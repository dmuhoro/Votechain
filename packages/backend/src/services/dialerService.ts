import { createHash, randomInt, timingSafeEqual } from "crypto";
import { supabase } from "./supabaseService";
import { castVote, VoteError } from "./voteService";
import type { ChainCandidate } from "./offlineBallotService";
import type { SmsGateway } from "./smsGateway";

/**
 * ADR-009 dialer (SMS/USSD) vote intake.
 *
 * A verified voter binds a phone, provisions a 6-digit one-time PIN per
 * (voter, election), then casts by texting `VOTE <electionCode> <candidateId> <pin>`.
 * The intake runs the SAME shared cast path (voteService.castVote) as the
 * online route and the offline reconciliation route — nullifier (boundary a)
 * -> relayer -> chain (boundary b) -> vote_record. It adds a front door, never
 * a second counting authority. Every inbound command is audited to
 * sms_intake_log with an explicit outcome (Constitution Article I.6).
 */

export type IntakeOutcome =
  | "hello"
  | "voted"
  | "duplicate"
  | "receipt"
  | "invalid_pin"
  | "no_active_code"
  | "expired"
  | "election_closed"
  | "candidate_mismatch"
  | "election_not_found"
  | "unknown_command"
  | "not_verified"
  | "phone_unbound"
  | "error";

export class DialerError extends Error {
  statusCode: number;
  reason?: string;
  constructor(message: string, statusCode: number, reason?: string) {
    super(message);
    this.name = "DialerError";
    this.statusCode = statusCode;
    this.reason = reason;
  }
}

// ---------------------------------------------------------------------------
// Command grammar
// ---------------------------------------------------------------------------

export type DialerCommand =
  | { type: "vote"; electionCode: string; candidateId: number; pin: string }
  | { type: "receipt"; voteCode: string }
  | { type: "help" };

const PIN_RE = /^\d{6}$/;

/** Parse a free-text SMS body into a structured dialer command. */
export function parseSmsCommand(body: string): DialerCommand {
  const tokens = body
    .trim()
    .toUpperCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);

  if (tokens.length === 0) return { type: "help" };

  const [verb, ...rest] = tokens;

  if (verb === "VOTE" && rest.length === 3) {
    const candidateId = Number(rest[1]);
    const pin = rest[2];
    if (Number.isInteger(candidateId) && candidateId > 0 && PIN_RE.test(pin)) {
      return { type: "vote", electionCode: rest[0], candidateId, pin };
    }
    return { type: "help" };
  }

  if (verb === "RECEIPT" && rest.length === 1) {
    const voteCode = rest[0];
    if (/^V[0-9A-F]{12}$/.test(voteCode)) {
      return { type: "receipt", voteCode };
    }
    return { type: "help" };
  }

  return { type: "help" };
}

// ---------------------------------------------------------------------------
// PIN lifecycle
// ---------------------------------------------------------------------------

const pinHashOf = (pin: string): string =>
  createHash("sha256").update(`votechain-dialer-pin:${pin}`).digest("hex");

export function generatePin(): string {
  // 6 random decimal digits from a CSPRNG (uniform via randomInt).
  let pin = "";
  for (let i = 0; i < 6; i++) pin += String(randomInt(10));
  return pin;
}

export function verifyPin(pin: string, pinHash: string): boolean {
  if (!PIN_RE.test(pin)) return false;
  const expected = Buffer.from(pinHash, "hex");
  const provided = Buffer.from(pinHashOf(pin), "hex");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

interface DialerCodeRow {
  id: string;
  voter_id: string;
  election_id: number;
  phone_number: string;
  pin_hash: string;
  status: "issued" | "consumed" | "rejected";
  reason: string | null;
  expires_at: string;
  created_at: string;
  consumed_at: string | null;
}

export async function activeDialerCode(
  voterId: string,
  electionId: number
): Promise<DialerCodeRow | null> {
  const { data, error } = await supabase
    .from("dialer_codes")
    .select("id, voter_id, election_id, phone_number, pin_hash, status, reason, expires_at, created_at, consumed_at")
    .eq("voter_id", voterId)
    .eq("election_id", electionId)
    .eq("status", "issued")
    .maybeSingle();

  if (error) throw new DialerError(error.message, 500);
  return (data as DialerCodeRow | null) ?? null;
}

/**
 * The single dialer-code row for (voter, election), any status. Provisioning
 * mutates this row in place so the one-active-PIN invariant is a real DB fact
 * (partial unique index) and history is not duplicated.
 */
export async function dialerCodeFor(
  voterId: string,
  electionId: number
): Promise<DialerCodeRow | null> {
  const { data, error } = await supabase
    .from("dialer_codes")
    .select("id, voter_id, election_id, phone_number, pin_hash, status, reason, expires_at, created_at, consumed_at")
    .eq("voter_id", voterId)
    .eq("election_id", electionId)
    .maybeSingle();

  if (error) throw new DialerError(error.message, 500);
  return (data as DialerCodeRow | null) ?? null;
}

/**
 * Provision a ONE-TIME PIN for (voter, election). Eligible only for a voter
 * with a bound phone and an open election. One issued PIN per (voter, election)
 * enforced by the partial unique index (fail-closed).
 */
export async function provisionPin(
  voterId: string,
  electionId: number,
  phoneNumber: string,
  expiresAt: string
): Promise<{ pin: string; exists: boolean }> {
  const existing = await dialerCodeFor(voterId, electionId);

  // A consumed PIN means this voter already cast here. Refuse a second ballot.
  if (existing?.status === "consumed") {
    throw new DialerError("A vote has already been cast for this election.", 409, "already_voted");
  }

  const pin = generatePin();
  const pin_hash = pinHashOf(pin);

  if (existing) {
    // Issued (lost PIN) or rejected (retry): rotate in place. The DB uniqueness
    // guarantee still holds; a consumed row can never be revived here.
    const { error } = await supabase
      .from("dialer_codes")
      .update({
        pin_hash,
        expires_at: expiresAt,
        status: "issued",
        reason: null,
        consumed_at: null,
      })
      .eq("id", existing.id);
    if (error) throw new DialerError(error.message, 500);
    return { pin, exists: existing.status === "issued" };
  }

  const { error } = await supabase.from("dialer_codes").insert({
    voter_id: voterId,
    election_id: electionId,
    phone_number: phoneNumber,
    pin_hash,
    status: "issued",
    expires_at: expiresAt,
  });

  if (error) {
    if (error.code === "23505") {
      throw new DialerError("An active dialer PIN already exists for this election.", 409);
    }
    throw new DialerError(error.message, 500);
  }
  return { pin, exists: false };
}

export async function markDialerCode(
  voterId: string,
  electionId: number,
  status: Extract<DialerCodeRow["status"], "consumed" | "rejected">,
  reason?: string
): Promise<void> {
  const { error } = await supabase
    .from("dialer_codes")
    .update({
      status,
      ...(reason ? { reason } : {}),
      ...(status === "consumed" ? { consumed_at: new Date().toISOString() } : {}),
    })
    .eq("voter_id", voterId)
    .eq("election_id", electionId)
    .eq("status", "issued");

  if (error) throw new DialerError(error.message, 500);
}

// ---------------------------------------------------------------------------
// Audit log — every inbound command records an explicit outcome (no silent drops)
// ---------------------------------------------------------------------------

export async function logIntake(entry: {
  gateway: string;
  body: string;
  fromNumber: string;
  outcome: IntakeOutcome;
  reason?: string;
  electionId?: number;
  voteCode?: string;
  txHash?: string;
}): Promise<void> {
  const { error } = await supabase.from("sms_intake_log").insert({
    gateway: entry.gateway,
    body: entry.body,
    from_number: entry.fromNumber,
    outcome: entry.outcome,
    ...(entry.reason ? { reason: entry.reason } : {}),
    ...(entry.electionId !== undefined ? { election_id: entry.electionId } : {}),
    ...(entry.voteCode ? { vote_code: entry.voteCode } : {}),
    ...(entry.txHash ? { tx_hash: entry.txHash } : {}),
  });
  if (error) {
    // Audit is critical (Article I.6); surface loudly, never drop silently.
    console.error("FAILED to write sms_intake_log:", error.message, entry);
  }
}

// ---------------------------------------------------------------------------
// Vote code (short, human-retypable on a feature phone) — MUST match the
// migration backfill: 'V' + first 12 hex chars of the tx hash, uppercased.
// ---------------------------------------------------------------------------

export function voteCodeFromTxHash(txHash: string): string {
  return `V${txHash.replace("0x", "").slice(0, 12).toUpperCase()}`;
}

export interface ReceiptRecord {
  election_id: number;
  tx_hash: string;
  nullifier_hash: string;
  block_number: number | null;
  vote_code: string | null;
}

export async function lookupVoteByCode(voteCode: string): Promise<ReceiptRecord | null> {
  const { data, error } = await supabase
    .from("vote_records")
    .select("election_id, tx_hash, nullifier_hash, block_number, vote_code")
    .eq("vote_code", voteCode)
    .maybeSingle();

  if (error) throw new DialerError(error.message, 500);
  return (data as ReceiptRecord | null) ?? null;
}

// ---------------------------------------------------------------------------
// Teams / helpers for the intake handler
// ---------------------------------------------------------------------------

interface ElectionRow {
  id: number;
  chain_election_id: number;
  dial_code: string | null;
  title: string;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

export async function electionByDialCode(dialCode: string): Promise<ElectionRow | null> {
  const { data, error } = await supabase
    .from("elections")
    .select("id, chain_election_id, dial_code, title, start_time, end_time, is_active")
    .eq("dial_code", dialCode)
    .maybeSingle();

  if (error) throw new DialerError(error.message, 500);
  return (data as ElectionRow | null) ?? null;
}

export async function electionById(id: number): Promise<ElectionRow | null> {
  const { data, error } = await supabase
    .from("elections")
    .select("id, chain_election_id, dial_code, title, start_time, end_time, is_active")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new DialerError(error.message, 500);
  return (data as ElectionRow | null) ?? null;
}

interface VoterRow {
  id: string;
  is_verified: boolean;
  phone_number: string | null;
}

export async function voterByPhoneNumber(phoneNumber: string): Promise<VoterRow | null> {
  const { data, error } = await supabase
    .from("voters")
    .select("id, is_verified, phone_number")
    .eq("phone_number", phoneNumber)
    .maybeSingle();

  if (error) throw new DialerError(error.message, 500);
  return (data as VoterRow | null) ?? null;
}

/** Bind (or re-bind) a verified voter's dialer phone number. */
export async function bindDialerPhone(voterId: string, phoneNumber: string): Promise<void> {
  const { error } = await supabase
    .from("voters")
    .update({ phone_number: phoneNumber })
    .eq("id", voterId);
  if (error) {
    if (error.code === "23505") {
      throw new DialerError("That phone number is already bound to another voter.", 409, "phone_taken");
    }
    throw new DialerError(error.message, 500);
  }
}

/** Read the current dialer phone binding for a voter (null when unbound). */
export async function dialerPhone(voterId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("voters")
    .select("phone_number")
    .eq("id", voterId)
    .maybeSingle();

  if (error) throw new DialerError(error.message, 500);
  return (data as { phone_number: string | null } | null)?.phone_number ?? null;
}

export function isElectionOpen(
  election: Pick<ElectionRow, "is_active" | "start_time" | "end_time">,
  now: Date
): boolean {
  if (!election.is_active) return false;
  return now >= new Date(election.start_time) && now <= new Date(election.end_time);
}

// ---------------------------------------------------------------------------
// THE INTAKE — the real path entry point for a texted vote.
// ---------------------------------------------------------------------------

export interface InboundSms {
  From: string;
  Body: string;
  MessageSid?: string;
  gateway: string;
}

export interface DialerContext {
  now?: Date;
  /** Resolve chain candidates for an election (default: ethers via offline-style lookup). */
  fetchChainCandidates: (chainElectionId: number) => Promise<ChainCandidate[]>;
  gatewayName: string;
  gateway: SmsGateway;
}

export interface IntakeResult {
  reply: string;
  outcome: IntakeOutcome;
  electionId?: number;
  txHash?: string;
  voteCode?: string;
}

/**
 * Handle a single inbound dialer message. Returns the SMS reply and records
 * the outcome in sms_intake_log. All vote outcomes are explicit.
 */
export async function handleInboundSms(
  msg: InboundSms,
  ctx: DialerContext
): Promise<IntakeResult> {
  const now = ctx.now ?? new Date();
  const command = parseSmsCommand(msg.Body);

const fail: (
  outcome: IntakeOutcome,
  reply: string,
  extra?: Partial<IntakeResult>
) => Promise<IntakeResult> = async (outcome, reply, extra) => {
  await logIntake({
    gateway: ctx.gatewayName,
    body: msg.Body,
    fromNumber: msg.From,
    outcome,
    ...extra,
  });
  return { reply, outcome, ...extra };
};

  // 1. Bind phone → voter. A phone that maps to no voter gets an explicit reply.
  const voter = await voterByPhoneNumber(msg.From);
  if (!voter || !voter.phone_number) {
    return fail(
      "phone_unbound",
      "This phone number is not bound to a VoteChain voter. Open the app, sign in, and bind your phone in Dialer settings first. Reply HELP for commands."
    );
  }
  if (!voter.is_verified) {
    return fail(
      "not_verified",
      "Your voter account is not yet verified. An official must verify you before you can vote."
    );
  }

  // 2. Dispatch by command type.
  if (command.type === "vote") {
    return handleVoteCommand(voter.id, msg, command.electionCode, command.candidateId, command.pin, ctx, now, fail);
  }

  if (command.type === "receipt") {
    const record = await lookupVoteByCode(command.voteCode);
    if (!record) {
      return fail(
        "receipt",
        "No vote found for that receipt code. Check the code and try again."
      );
    }
    await logIntake({
      gateway: ctx.gatewayName,
      body: msg.Body,
      fromNumber: msg.From,
      outcome: "receipt",
      electionId: record.election_id,
      voteCode: command.voteCode,
      txHash: record.tx_hash,
    });
    const election = await electionById(record.election_id).catch(() => null);
    const title = election?.title ?? `Election #${record.election_id}`;
    return {
      reply:
        `Vote verified. ${title} · tx ${record.tx_hash} · block ${record.block_number ?? "?"} · ` +
        `voted via code ${command.voteCode}.`,
      outcome: "receipt",
      electionId: record.election_id,
      voteCode: command.voteCode,
      txHash: record.tx_hash,
    };
  }

  // 3. HELP with the grammar.
  const reply =
    "VoteChain Dialer. Commands: VOTE <electionCode> <candidateId> <6-digit pin> to vote; RECEIPT <code> to verify a vote. Text HELP for this message.";
  await logIntake({ gateway: ctx.gatewayName, body: msg.Body, fromNumber: msg.From, outcome: "hello" });
  return { reply, outcome: "hello" };
}

async function handleVoteCommand(
  voterId: string,
  msg: InboundSms,
  electionCode: string,
  candidateId: number,
  pin: string,
  ctx: DialerContext,
  now: Date,
  fail: (outcome: IntakeOutcome, reply: string, extra?: Partial<IntakeResult>) => Promise<IntakeResult>
): Promise<IntakeResult> {
  // 3. Resolve election by dial code.
  const election = await electionByDialCode(electionCode);
  if (!election) {
    return fail(
      "election_not_found",
      `No election found for code ${electionCode}. Check the election code and retry.`
    );
  }

  // 4. Election must be open.
  if (!isElectionOpen(election, now)) {
    return fail(
      "election_closed",
      "This election is not open for voting right now. It was not counted.",
      { electionId: election.id }
    );
  }

  // 5. The PIN must exist, belong to this (voter, election), and be unexpired.
  const code = await activeDialerCode(voterId, election.id);
  if (!code) {
    return fail(
      "no_active_code",
      "No active dialer PIN for this election. Open the app and request a code first.",
      { electionId: election.id }
    );
  }
  if (now > new Date(code.expires_at)) {
    await markDialerCode(voterId, election.id, "rejected", "expired");
    return fail(
      "expired",
      "Your dialer PIN has expired. Request a new code from the app.",
      { electionId: election.id }
    );
  }
  if (!verifyPin(pin, code.pin_hash)) {
    return fail(
      "invalid_pin",
      "That PIN is incorrect. Check the 6-digit code from the app and retry.",
      { electionId: election.id }
    );
  }

  // 6. Candidate must exist on-chain for this election.
  const candidates = await ctx.fetchChainCandidates(election.chain_election_id);
  if (!candidates.some((c) => c.id === candidateId)) {
    await markDialerCode(voterId, election.id, "rejected", "candidate-mismatch");
    return fail(
      "candidate_mismatch",
      "That candidate number is not on the ballot for this election. It was not counted.",
      { electionId: election.id }
    );
  }

  // 7. THE REAL PATH — identical code to POST /api/votes/cast and the offline
  //    reconciliation route. Two-boundary nullifier enforced at submit time.
  try {
    const result = await castVote(voterId, election.id, candidateId);
    await markDialerCode(voterId, election.id, "consumed");
    const voteCode = voteCodeFromTxHash(result.txHash);

    await logIntake({
      gateway: ctx.gatewayName,
      body: msg.Body,
      fromNumber: msg.From,
      outcome: "voted",
      electionId: election.id,
      voteCode,
      txHash: result.txHash,
    });

    return {
      reply:
        `Vote cast successfully for ${candidates.find((c) => c.id === candidateId)?.name ?? `candidate #${candidateId}`}. ` +
        `Receipt code: ${voteCode}. Text RECEIPT ${voteCode} anytime to verify.`,
      outcome: "voted",
      electionId: election.id,
      txHash: result.txHash,
      voteCode,
    };
  } catch (error: any) {
    if (error instanceof VoteError && error.statusCode === 409) {
      // Nullifier boundary refused the replay (voter already voted — online,
      // offline, or via a raced duplicate).
      await markDialerCode(voterId, election.id, "rejected", "duplicate");
      return fail(
        "duplicate",
        "You have already voted in this election. This vote was not counted.",
        { electionId: election.id }
      );
    }
    console.error("Dialer vote failed:", error);
    return fail("error", "Something went wrong casting your vote. It was not counted. Please retry later.", {
      electionId: election.id,
    });
  }
}