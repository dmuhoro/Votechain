import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";

vi.mock("../src/services/relayerService", () => ({
  relayerService: { submitVote: vi.fn() },
}));

vi.mock("../src/services/supabaseService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/supabaseService")>();
  return {
    ...actual,
    supabase: { from: () => { throw new Error("not stubbed"); } },
  };
});

import { relayerService } from "../src/services/relayerService";
import { supabase } from "../src/services/supabaseService";
import {
  parseSmsCommand,
  voteCodeFromTxHash,
  verifyPin,
  isElectionOpen,
  provisionPin,
  handleInboundSms,
} from "../src/services/dialerService";
import type { ChainCandidate } from "../src/services/offlineBallotService";
import { SimulatedSmsGateway } from "../src/services/smsGateway";

const TX = "0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
const PIN = "123456";
const pinHashOf = (pin: string) =>
  createHash("sha256").update(`votechain-dialer-pin:${pin}`).digest("hex");

const CANDIDATES: ChainCandidate[] = [
  { id: 1, name: "Alpha", party: "Progressive" },
  { id: 2, name: "Beta", party: "Union" },
];

const NOW = new Date("2026-09-19T10:00:00Z");

const OPEN_ELECTION = {
  id: 7,
  chain_election_id: 3,
  dial_code: "3",
  title: "Test Election",
  start_time: "2026-09-01T00:00:00Z",
  end_time: "2027-01-01T00:00:00Z",
  is_active: true,
};

const CLOSED_ELECTION = { ...OPEN_ELECTION, is_active: false };

const VERIFIED_VOTER = { id: "voter-1", is_verified: true, phone_number: "+254700000001" };
const UNVERIFIED_VOTER = { ...VERIFIED_VOTER, is_verified: false };

interface DialerCodeFixture {
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

interface StubState {
  voter?: typeof VERIFIED_VOTER | null;
  electionByDialCode?: typeof OPEN_ELECTION | null;
  electionById?: Record<number, typeof OPEN_ELECTION> | null;
  dialerCode?: DialerCodeFixture | null;
  voteRecordByCode?: unknown;
  nullifierExists?: unknown;
  insertError?: Record<string, { code?: string; message?: string }>;
  updateError?: Record<string, { code?: string; message?: string }>;
  upsertError?: { code?: string; message?: string };
}

function stubDb(state: StubState = {}) {
  const calls = {
    inserts: [] as { table: string; payload: any }[],
    updates: [] as { table: string; patch: any; filters: [string, any][] }[],
  };

  const onInsert = (table: string, payload: any) => {
    calls.inserts.push({ table, payload });
    return { error: state.insertError?.[table] ?? null };
  };
  const onUpsert = () => ({ error: state.upsertError ?? null });

  const resolveSelect = (table: string, filters: [string, any][]) => {
    const get = (col: string) => filters.find(([c]) => c === col)?.[1];
    if (table === "voters") return { data: state.voter ?? null, error: null };
    if (table === "elections") {
      if (get("dial_code") !== undefined) {
        return { data: state.electionByDialCode ?? null, error: null };
      }
      const byId = state.electionById ?? (state.electionByDialCode ? { [state.electionByDialCode.id]: state.electionByDialCode } : {});
      return { data: byId[Number(get("id"))] ?? null, error: null };
    }
    if (table === "dialer_codes") {
      const row = state.dialerCode as { status?: string } | null | undefined;
      if (get("status") === "issued") {
        return { data: row && row.status === "issued" ? row : null, error: null };
      }
      return { data: row ?? null, error: null };
    }
    if (table === "vote_records") return { data: state.voteRecordByCode ?? null, error: null };
    if (table === "nullifiers") {
      return state.nullifierExists
        ? { data: state.nullifierExists, error: null }
        : { data: null, error: { code: "PGRST116", message: "no rows" } };
    }
    throw new Error(`unexpected table ${table}`);
  };

  const resolveUpdate = (table: string, patch: any, filters: [string, any][]) => {
    calls.updates.push({ table, patch, filters });
    return { error: state.updateError?.[table] ?? null };
  };

  const from = vi.fn((table: string) => {
    const filters: [string, any][] = [];
    let patch: any = null;
    const builder: any = {
      select: () => builder,
      eq: (col: string, val: any) => {
        filters.push([col, val]);
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => resolveSelect(table, filters),
      single: async () => resolveSelect(table, filters),
      insert: (payload: any) => Promise.resolve(onInsert(table, payload)),
      update: (p: any) => {
        patch = p;
        return builder;
      },
      upsert: () => Promise.resolve(onUpsert()),
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(resolveUpdate(table, patch, filters)).then(res, rej),
    };
    return builder;
  });

  (supabase as unknown as { from: unknown }).from = from;
  return calls;
}

function baseState(overrides: StubState = {}): StubState {
  return {
    voter: VERIFIED_VOTER,
    electionByDialCode: OPEN_ELECTION,
    electionById: { 7: OPEN_ELECTION },
    dialerCode: {
      id: "code-1",
      voter_id: "voter-1",
      election_id: 7,
      phone_number: VERIFIED_VOTER.phone_number,
      pin_hash: pinHashOf(PIN),
      status: "issued",
      reason: null,
      expires_at: OPEN_ELECTION.end_time,
      created_at: NOW.toISOString(),
      consumed_at: null,
    },
    ...overrides,
  };
}

function ctx(overrides: Partial<{ candidates: ChainCandidate[]; now: Date; gateway: SimulatedSmsGateway }> = {}) {
  const gateway = overrides.gateway ?? new SimulatedSmsGateway();
  return {
    gateway,
    now: overrides.now ?? NOW,
    fetchChainCandidates: vi.fn(async () => overrides.candidates ?? CANDIDATES),
    gatewayName: gateway.name,
    smsGateway: gateway,
  };
}

function invoke(body: string, from = VERIFIED_VOTER.phone_number, context = ctx()) {
  return handleInboundSms(
    { From: from, Body: body, gateway: context.gateway.name },
    context
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(relayerService.submitVote).mockReset();
  vi.mocked(relayerService.submitVote).mockResolvedValue({ txHash: TX, blockNumber: 4242 });
});

// ---------------------------------------------------------------------------
describe("dialer — command grammar", () => {
  it("parses a valid VOTE command", () => {
    expect(parseSmsCommand("vote 3 2 123456")).toEqual({
      type: "vote",
      electionCode: "3",
      candidateId: 2,
      pin: "123456",
    });
  });

  it("parses a valid RECEIPT command (case-insensitive)", () => {
    expect(parseSmsCommand(`receipt v${TX.slice(2, 14)}`)).toEqual({
      type: "receipt",
      voteCode: `V${TX.slice(2, 14).toUpperCase()}`,
    });
  });

  it("falls back to HELP for a malformed vote (bad pin, zero candidate, extra tokens)", () => {
    expect(parseSmsCommand("VOTE 3 2 12345").type).toBe("help");
    expect(parseSmsCommand("VOTE 3 0 123456").type).toBe("help");
    expect(parseSmsCommand("VOTE 3 2 123456 extra").type).toBe("help");
    expect(parseSmsCommand("nonsense").type).toBe("help");
    expect(parseSmsCommand("").type).toBe("help");
  });

  it("derives the receipt code exactly as the DB generated column does", () => {
    expect(voteCodeFromTxHash(TX)).toBe(`V${TX.slice(2, 14).toUpperCase()}`);
    expect(voteCodeFromTxHash("0xdeadbeefdeadbeef00")).toBe("VDEADBEEFDEAD");
  });

  it("verifyPin accepts only the exact PIN it hashed", () => {
    expect(verifyPin(PIN, pinHashOf(PIN))).toBe(true);
    expect(verifyPin("000000", pinHashOf(PIN))).toBe(false);
    expect(verifyPin("abcdef", pinHashOf(PIN))).toBe(false);
  });

  it("isElectionOpen respects active flag and the window", () => {
    expect(isElectionOpen(OPEN_ELECTION, NOW)).toBe(true);
    expect(isElectionOpen(CLOSED_ELECTION, NOW)).toBe(false);
    expect(isElectionOpen({ ...OPEN_ELECTION, start_time: "2027-01-01T00:00:00Z" }, NOW)).toBe(false);
    expect(isElectionOpen({ ...OPEN_ELECTION, end_time: "2026-01-01T00:00:00Z" }, NOW)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe("dialer — PIN provisioning (one-time semantics)", () => {
  it("inserts a fresh PIN and it verifies against the stored digest", async () => {
    const calls = stubDb(baseState({ dialerCode: null }));
    const { pin, exists } = await provisionPin("voter-1", 7, VERIFIED_VOTER.phone_number, OPEN_ELECTION.end_time);

    expect(exists).toBe(false);
    expect(pin).toMatch(/^\d{6}$/);
    const insert = calls.inserts.find((i) => i.table === "dialer_codes");
    expect(insert).toBeTruthy();
    expect(verifyPin(pin, insert!.payload.pin_hash)).toBe(true);
    expect(insert!.payload.pin_hash).not.toContain(pin);
  });

  it("rotates an already-issued PIN in place (voter lost the code)", async () => {
    stubDb(baseState());
    const { pin, exists } = await provisionPin("voter-1", 7, VERIFIED_VOTER.phone_number, OPEN_ELECTION.end_time);
    expect(exists).toBe(true);
    expect(pin).toMatch(/^\d{6}$/);
  });

  it("re-issues after a prior rejection (status flips back to issued)", async () => {
    stubDb(baseState({ dialerCode: { ...baseState().dialerCode, status: "rejected", reason: "expired" } }));
    const { pin, exists } = await provisionPin("voter-1", 7, VERIFIED_VOTER.phone_number, OPEN_ELECTION.end_time);
    expect(exists).toBe(false);
    expect(verifyPin(pin, pinHashOf(pin))).toBe(true);
  });

  it("refuses to re-issue after the PIN was consumed (no second ballot)", async () => {
    stubDb(baseState({ dialerCode: { ...baseState().dialerCode, status: "consumed" } }));
    await expect(
      provisionPin("voter-1", 7, VERIFIED_VOTER.phone_number, OPEN_ELECTION.end_time)
    ).rejects.toMatchObject({ name: "DialerError", statusCode: 409 });
  });

  it("surfaces the partial-unique backstop as 409 on a concurrent provision", async () => {
    stubDb(baseState({ dialerCode: null, insertError: { dialer_codes: { code: "23505" } } }));
    await expect(
      provisionPin("voter-1", 7, VERIFIED_VOTER.phone_number, OPEN_ELECTION.end_time)
    ).rejects.toMatchObject({ name: "DialerError", statusCode: 409 });
  });
});

// ---------------------------------------------------------------------------
describe("dialer — intake refusals (never touch the real cast path)", () => {
  it("rejects an unbound phone with phone_unbound and does not call the relayer", async () => {
    stubDb(baseState({ voter: null }));
    const r = await invoke(`VOTE 3 1 ${PIN}`);
    expect(r.outcome).toBe("phone_unbound");
    expect(relayerService.submitVote).not.toHaveBeenCalled();
  });

  it("rejects an unverified voter with not_verified and does not call the relayer", async () => {
    stubDb(baseState({ voter: UNVERIFIED_VOTER }));
    const r = await invoke(`VOTE 3 1 ${PIN}`);
    expect(r.outcome).toBe("not_verified");
    expect(relayerService.submitVote).not.toHaveBeenCalled();
  });

  it("reports election_not_found for an unknown dial code", async () => {
    stubDb(baseState({ electionByDialCode: null }));
    const r = await invoke(`VOTE 99 1 ${PIN}`);
    expect(r.outcome).toBe("election_not_found");
    expect(relayerService.submitVote).not.toHaveBeenCalled();
  });

  it("refuses a closed election", async () => {
    stubDb(baseState({ electionByDialCode: CLOSED_ELECTION, electionById: { 7: CLOSED_ELECTION } }));
    const r = await invoke(`VOTE 3 1 ${PIN}`);
    expect(r.outcome).toBe("election_closed");
    expect(relayerService.submitVote).not.toHaveBeenCalled();
  });

  it("refuses when no PIN was provisioned", async () => {
    stubDb(baseState({ dialerCode: null }));
    const r = await invoke(`VOTE 3 1 ${PIN}`);
    expect(r.outcome).toBe("no_active_code");
    expect(relayerService.submitVote).not.toHaveBeenCalled();
  });

  it("refuses an expired PIN and marks the code rejected", async () => {
    const calls = stubDb(
      baseState({ dialerCode: { ...baseState().dialerCode, expires_at: "2026-09-19T09:00:00Z" } })
    );
    const r = await invoke(`VOTE 3 1 ${PIN}`);
    expect(r.outcome).toBe("expired");
    expect(calls.updates.some((u) => u.table === "dialer_codes" && u.patch.status === "rejected")).toBe(true);
    expect(relayerService.submitVote).not.toHaveBeenCalled();
  });

  it("refuses a wrong PIN (fail closed) and does NOT consume or call the relayer", async () => {
    const calls = stubDb(baseState());
    const r = await invoke("VOTE 3 1 999999");
    expect(r.outcome).toBe("invalid_pin");
    expect(calls.updates.some((u) => u.table === "dialer_codes")).toBe(false);
    expect(relayerService.submitVote).not.toHaveBeenCalled();
  });

  it("refuses a candidate not on the ballot and does not call the relayer", async () => {
    const calls = stubDb(baseState());
    const r = await invoke("VOTE 3 9 " + PIN);
    expect(r.outcome).toBe("candidate_mismatch");
    expect(calls.updates.some((u) => u.patch.status === "rejected")).toBe(true);
    expect(relayerService.submitVote).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe("dialer — the real cast path (proves wiring, not just a helper)", () => {
  it("casts through the SHARED castVote path exactly once and returns a receipt code", async () => {
    const calls = stubDb(baseState());
    const context = ctx();
    const r = await invoke(`VOTE 3 2 ${PIN}`, VERIFIED_VOTER.phone_number, context);

    // Relayer (the real broker submission) was invoked exactly once with the
    // CHAIN election id (3), the candidate, and a 32-byte nullifier.
    expect(relayerService.submitVote).toHaveBeenCalledTimes(1);
    expect(relayerService.submitVote).toHaveBeenCalledWith(3, 2, expect.stringMatching(/^0x[0-9a-f]{64}$/));

    expect(r.outcome).toBe("voted");
    expect(r.txHash).toBe(TX);
    expect(r.voteCode).toBe(`V${TX.slice(2, 14).toUpperCase()}`);
    expect(r.reply).toContain("Vote cast successfully");
    expect(r.reply).toContain(r.voteCode!);

    // PIN consumed (one-time) + audit row written.
    expect(calls.updates.some((u) => u.table === "dialer_codes" && u.patch.status === "consumed")).toBe(true);
    expect(calls.inserts.some((i) => i.table === "vote_records")).toBe(true);
    const audit = calls.inserts.find((i) => i.table === "sms_intake_log");
    expect(audit?.payload.outcome).toBe("voted");
    expect(audit?.payload.vote_code).toBe(r.voteCode);
  });

  it("maps a chain-boundary duplicate to duplicate, consumes nothing, and never double-submits", async () => {
    stubDb(baseState());
    vi.mocked(relayerService.submitVote).mockRejectedValue(
      new Error('execution reverted: "Already voted"')
    );

    const r = await invoke(`VOTE 3 2 ${PIN}`);
    expect(r.outcome).toBe("duplicate");
    expect(relayerService.submitVote).toHaveBeenCalledTimes(1);
    expect(r.txHash).toBeUndefined();
  });

  it("maps a DB-boundary duplicate (nullifier present) to duplicate without calling the relayer", async () => {
    stubDb(baseState({ nullifierExists: { id: "row" } }));
    const r = await invoke(`VOTE 3 2 ${PIN}`);
    expect(r.outcome).toBe("duplicate");
    expect(relayerService.submitVote).not.toHaveBeenCalled();
  });

  it("reports error and casts nothing when the relayer fails unexpectedly", async () => {
    stubDb(baseState());
    vi.mocked(relayerService.submitVote).mockRejectedValue(new Error("rpc exploded"));
    const r = await invoke(`VOTE 3 2 ${PIN}`);
    expect(r.outcome).toBe("error");
  });
});

// ---------------------------------------------------------------------------
describe("dialer — receipt & help", () => {
  it("verifies a known vote code without exposing voter identity", async () => {
    stubDb(baseState({ voteRecordByCode: { election_id: 7, tx_hash: TX, nullifier_hash: "0xn", block_number: 4242, vote_code: `V${TX.slice(2, 14).toUpperCase()}` } }));
    const r = await invoke(`RECEIPT V${TX.slice(2, 14).toUpperCase()}`);
    expect(r.outcome).toBe("receipt");
    expect(r.reply).toContain(TX);
    expect(r.reply).not.toContain(VERIFIED_VOTER.id);
    expect(relayerService.submitVote).not.toHaveBeenCalled();
  });

  it("reports an unknown receipt code without casting", async () => {
    stubDb(baseState({ voteRecordByCode: null }));
    const r = await invoke("RECEIPT V000000000000");
    expect(r.outcome).toBe("receipt");
    expect(r.reply).toContain("No vote found");
  });

  it("answers HELP for unknown commands", async () => {
    stubDb(baseState());
    const r = await invoke("HI");
    expect(r.outcome).toBe("hello");
    expect(r.reply).toContain("VOTE <electionCode>");
  });
});
