import { createHash, createHmac, timingSafeEqual } from "crypto";
import { supabase } from "./supabaseService";
import { SERVER_SECRET } from "../config";

/**
 * ADR-008 offline ballot provisioning + reconciliation.
 *
 * A voucher is a server-signed capability that binds { voter, election,
 * candidate-set } to ONE submission. It grants nothing on its own: the
 * submission still runs through voteService.castVote (nullifier -> relayer ->
 * chain -> DB). The voucher exists so a capture is attributable to a verified
 * voter + a specific open election, at most once (first submission wins via the
 * nullifier at both boundaries), and so eligibility is checked at PROVISION time
 * (fail fast), not discovered after a long offline spell.
 */

export interface OfflineVoucher {
  version: 1;
  voterId: string;
  electionId: number;
  candidatesFingerprint: string;
  issuedAt: string;
  expiresAt: string;
}

export interface SignedVoucher {
  payload: OfflineVoucher;
  signature: string;
}

export interface ChainCandidate {
  id: number;
  name: string;
  party: string;
}

export type VoucherStatus = "issued" | "consumed" | "rejected";

export class OfflineBallotError extends Error {
  statusCode: number;
  reason?: string;
  constructor(message: string, statusCode: number, reason?: string) {
    super(message);
    this.name = "OfflineBallotError";
    this.statusCode = statusCode;
    this.reason = reason;
  }
}

// Domain-separated key: never reuse the nullifier key material for signatures.
// SERVER_SECRET is committed nowhere; derived bytes are in-memory only.
const VOUCHER_KEY = createHash("sha256")
  .update(`votechain-offline-ballot-v1:${SERVER_SECRET}`)
  .digest();

function canonicalize(value: unknown): string {
  return JSON.stringify(
    // Sort top-level keys for a stable representation regardless of insertion order.
    Object.fromEntries(
      Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1))
    )
  );
}

export function candidatesFingerprint(candidates: ChainCandidate[]): string {
  const stable = [...candidates]
    .sort((a, b) => a.id - b.id)
    .map((c) => ({ id: c.id, name: c.name, party: c.party ?? "" }));
  return createHash("sha256").update(canonicalize({ candidates: stable })).digest("hex");
}

export function signVoucher(payload: OfflineVoucher): string {
  const canonicalPayload = canonicalize(payload);
  return createHmac("sha256", VOUCHER_KEY).update(canonicalPayload).digest("hex");
}

export function verifyVoucher(signed: SignedVoucher): boolean {
  if (!signed || !signed.payload || typeof signed.signature !== "string") return false;
  if (signed.payload.version !== 1) return false;
  const expected = Buffer.from(signVoucher(signed.payload), "hex");
  const provided = Buffer.from(signed.signature, "hex");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

export function voucherHash(payload: OfflineVoucher): string {
  return createHash("sha256").update(canonicalize(payload)).digest("hex");
}

interface VoucherRow {
  id: string;
  voter_id: string;
  election_id: number;
  voucher_hash: string;
  payload: string;
  status: VoucherStatus;
  reason: string | null;
  created_at: string;
  consumed_at: string | null;
}

export async function getVoucherRow(
  voterId: string,
  electionId: number
): Promise<VoucherRow | null> {
  const { data, error } = await supabase
    .from("offline_ballots")
    .select("id, voter_id, election_id, voucher_hash, payload, status, reason, created_at, consumed_at")
    .eq("voter_id", voterId)
    .eq("election_id", electionId)
    .maybeSingle();

  if (error) throw new OfflineBallotError(error.message, 500);
  return (data as VoucherRow | null) ?? null;
}

export async function listVoucherRows(voterId: string): Promise<VoucherRow[]> {
  const { data, error } = await supabase
    .from("offline_ballots")
    .select("id, voter_id, election_id, voucher_hash, payload, status, reason, created_at, consumed_at")
    .eq("voter_id", voterId)
    .order("created_at", { ascending: false });

  if (error) throw new OfflineBallotError(error.message, 500);
  return (data as VoucherRow[]) ?? [];
}

function toSignedVoucher(payloadJson: string): SignedVoucher {
  const payload = JSON.parse(payloadJson) as OfflineVoucher;
  return { payload, signature: signVoucher(payload) };
}

/**
 * Mint a one-time voucher for (voter, election). Eligible only for a verified,
 * active-and-open election, at most one issued voucher per voter per election.
 * Returns { voucher, exists } where `exists` is true when a same-voucher was
 * already issued (device lost its local copy and is re-downloading it).
 */
export async function provisionVoucher(
  voterId: string,
  electionId: number,
  times: { now: Date; startTime: Date; endTime: Date },
  fingerprint: string
): Promise<{ signed: SignedVoucher; exists: boolean }> {
  const existing = await getVoucherRow(voterId, electionId);

  if (existing?.status === "consumed") {
    throw new OfflineBallotError("Voter has already voted in this election.", 409, "duplicate");
  }
  if (existing?.status === "issued") {
    // Re-download the SAME voucher: a local copy was lost, the ballot was not
    // consumed, so the voter may still capture offline (one submission total).
    return { signed: toSignedVoucher(existing.payload), exists: true };
  }

  if (existing?.status === "rejected") {
    // A previous capture was definitively rejected (e.g. election closed before
    // sync). Allow a fresh attempt if the election is provably open again — the
    // DB row is single-row-per-voter, so we flip it back to issued.
    const payload: OfflineVoucher = {
      version: 1,
      voterId,
      electionId,
      candidatesFingerprint: fingerprint,
      issuedAt: times.now.toISOString(),
      expiresAt: times.endTime.toISOString(),
    };
    const hash = voucherHash(payload);
    const { error } = await supabase
      .from("offline_ballots")
      .update({ status: "issued", reason: null, voucher_hash: hash, payload: canonicalize(payload), consumed_at: null })
      .eq("id", existing.id);
    if (error) throw new OfflineBallotError(error.message, 500);
    return { signed: { payload, signature: signVoucher(payload) }, exists: false };
  }

  const payload: OfflineVoucher = {
    version: 1,
    voterId,
    electionId,
    candidatesFingerprint: fingerprint,
    issuedAt: times.now.toISOString(),
    expiresAt: times.endTime.toISOString(),
  };
  const signed: SignedVoucher = { payload, signature: signVoucher(payload) };

  const { error } = await supabase.from("offline_ballots").insert({
    voter_id: voterId,
    election_id: electionId,
    voucher_hash: voucherHash(payload),
    payload: canonicalize(payload),
    status: "issued",
    created_at: times.now.toISOString(),
  });

  if (error) {
    // UNIQUE (voter_id, election_id) backstop for a concurrent provision.
    if (error.code === "23505") {
      throw new OfflineBallotError(
        "An offline ballot was already issued for this election.",
        409,
        "issued"
      );
    }
    throw new OfflineBallotError(error.message, 500);
  }

  return { signed, exists: false };
}

export async function markVoucher(
  voterId: string,
  electionId: number,
  status: Extract<VoucherStatus, "consumed" | "rejected">,
  reason?: string
): Promise<void> {
  const { error } = await supabase
    .from("offline_ballots")
    .update({
      status,
      ...(reason ? { reason } : {}),
      ...(status === "consumed" ? { consumed_at: new Date().toISOString() } : {}),
    })
    .eq("voter_id", voterId)
    .eq("election_id", electionId);

  if (error) throw new OfflineBallotError(error.message, 500);
}