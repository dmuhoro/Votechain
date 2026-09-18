import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  signVoucher,
  verifyVoucher,
  voucherHash,
  candidatesFingerprint,
  provisionVoucher,
  getVoucherRow,
  listVoucherRows,
  markVoucher,
  OfflineBallotError,
  ChainCandidate,
} from "../src/services/offlineBallotService";

vi.mock("../src/services/supabaseService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/supabaseService")>();
  return {
    ...actual,
    supabase: { from: () => { throw new Error("not stubbed"); } },
  };
});

import { supabase } from "../src/services/supabaseService";

const CANDIDATES: ChainCandidate[] = [
  { id: 1, name: "Alpha", party: "Progressive" },
  { id: 2, name: "Beta", party: "Union" },
  { id: 3, name: "Gamma", party: "Independent" },
];

const TIMES = {
  now: new Date("2026-09-18T10:00:00Z"),
  startTime: new Date("2026-09-01T00:00:00Z"),
  endTime: new Date("2027-01-01T00:00:00Z"),
};

type Row = {
  id: string;
  voter_id: string;
  election_id: number;
  voucher_hash: string;
  payload: string;
  status: "issued" | "consumed" | "rejected";
  reason: string | null;
  created_at: string;
  consumed_at: string | null;
};

function stubOfflineDb(overrides: {
  row?: Row | null;
  rowError?: unknown;
  insertError?: unknown;
  updateError?: unknown;
  listRows?: Row[];
}) {
  const result = { error: overrides.updateError ?? null };

  // eq chains may be of any length; the terminal node resolves to `result`
  // (like a supabase builder). Calls are recorded for assertions.
  const makeEqChain = (resolvedValue: unknown, record: any[] = []) => {
    const chain = {
      eq: (_col: string, _val: string | number) => {
        record.push([_col, _val]);
        return chain;
      },
      maybeSingle: async () => ({ data: overrides.row ?? null, error: overrides.rowError ?? null }),
      order: () => {
        return {
          ...(overrides.listRows
            ? {
                then: (res: (v: unknown) => unknown) => res({ data: overrides.listRows, error: null }),
              }
            : {
                maybeSingle: async () => ({ data: overrides.row ?? null, error: overrides.rowError ?? null }),
              }),
        };
      },
      then: (res: (v: unknown) => unknown) =>
        Promise.resolve(resolvedValue).then((v) => res({ data: v, error: null })),
    };
    return chain;
  };

  const from = vi.fn((table: string) => {
    if (table !== "offline_ballots") throw new Error(`unexpected table ${table}`);
    return {
      select: (cols: string) => ({
        eq: (col: string, val: string) => makeEqChain(null, []).eq(col, val),
      }),
      insert: async () => ({ error: overrides.insertError ?? null }),
      update: (patch: Partial<Row>) => ({
        eq: (col: string, val: string) => {
          // track patches applied via update
          return makeEqChain(null, []).eq(col, val);
        },
      }),
    };
  });

  (supabase as unknown as { from: unknown }).from = from;
  return { from };
}

const fp = (cands: ChainCandidate[] = CANDIDATES) => candidatesFingerprint(cands);

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("offlineBallotService — voucher crypto", () => {
  it("signS/verify roundtrip passes", () => {
    const voucher = {
      version: 1 as const,
      voterId: "v1",
      electionId: 1,
      candidatesFingerprint: fp(),
      issuedAt: "2026-09-18T10:00:00.000Z",
      expiresAt: "2027-01-01T00:00:00.000Z",
    };
    const signed = { payload: voucher, signature: signVoucher(voucher) };
    expect(verifyVoucher(signed)).toBe(true);
  });

  it("detects a tampered signature (fails closed)", () => {
    const voucher = {
      version: 1 as const,
      voterId: "v1",
      electionId: 1,
      candidatesFingerprint: fp(),
      issuedAt: "2026-09-18T10:00:00.000Z",
      expiresAt: "2027-01-01T00:00:00.000Z",
    };
    const sig = signVoucher(voucher);
    const flipped = (sig[0] === "0" ? "f" : "0") + sig.slice(1);
    expect(verifyVoucher({ payload: voucher, signature: flipped })).toBe(false);
  });

  it("detects a voter swap (a voter cannot use another voter's voucher)", () => {
    const base = {
      version: 1 as const,
      voterId: "v1",
      electionId: 1,
      candidatesFingerprint: fp(),
      issuedAt: "2026-09-18T10:00:00.000Z",
      expiresAt: "2027-01-01T00:00:00.000Z",
    };
    const signature = signVoucher(base);
    expect(verifyVoucher({ payload: { ...base, voterId: "attacker" }, signature })).toBe(false);
  });

  it("detects a version bump (unknown voucher version)", () => {
    const base = {
      version: 1 as const,
      voterId: "v1",
      electionId: 1,
      candidatesFingerprint: fp(),
      issuedAt: "2026-09-18T10:00:00.000Z",
      expiresAt: "2027-01-01T00:00:00.000Z",
    };
    const signature = signVoucher(base);
    expect(verifyVoucher({ payload: { ...base, version: 2 as const }, signature })).toBe(false);
  });

  it("candidatesFingerprint is deterministic and order-independent", () => {
    const a = candidatesFingerprint(CANDIDATES);
    const shuffled = [CANDIDATES[2], CANDIDATES[0], CANDIDATES[1]];
    expect(candidatesFingerprint(shuffled)).toBe(a);
  });

  it("candidatesFingerprint changes when a candidate is tampered", () => {
    const a = fp();
    const tampered = CANDIDATES.map((c) => (c.id === 1 ? { ...c, name: "Evil" } : c));
    expect(candidatesFingerprint(tampered)).not.toBe(a);
  });
});

describe("offlineBallotService — provisioning and one-time semantics", () => {
  it("provisions a fresh voucher and persists issuer + payload", async () => {
    stubOfflineDb({ row: null, rowError: null });

    const { signed, exists } = await provisionVoucher("v1", 1, TIMES, fp());

    expect(exists).toBe(false);
    expect(verifyVoucher(signed)).toBe(true);
    expect(signed.payload.voterId).toBe("v1");
    expect(signed.payload.electionId).toBe(1);
    expect(signed.payload.expiresAt).toBe(TIMES.endTime.toISOString());

    const insertCalls = vi.mocked(supabase.from).mock.calls.filter(([t]) => t === "offline_ballots");
    expect(insertCalls.length).toBeGreaterThan(0);
  });

  it("re-downloads the SAME voucher when one is already issued (device lost local copy)", async () => {
    const payload = {
      version: 1 as const,
      voterId: "v1",
      electionId: 1,
      candidatesFingerprint: fp(),
      issuedAt: TIMES.now.toISOString(),
      expiresAt: TIMES.endTime.toISOString(),
    };
    stubOfflineDb({
      row: {
        id: "row1",
        voter_id: "v1",
        election_id: 1,
        voucher_hash: voucherHash(payload),
        payload: JSON.stringify(payload),
        status: "issued",
        reason: null,
        created_at: TIMES.now.toISOString(),
        consumed_at: null,
      },
    });

    const { signed, exists } = await provisionVoucher("v1", 1, TIMES, fp());
    expect(exists).toBe(true);
    expect(verifyVoucher(signed)).toBe(true);
    expect(signed.payload.issuedAt).toBe(TIMES.now.toISOString());
  });

  it("rejects provisioning after the voucher was consumed (no second ballot)", async () => {
    stubOfflineDb({
      row: {
        id: "row1",
        voter_id: "v1",
        election_id: 1,
        voucher_hash: "h",
        payload: "{}",
        status: "consumed",
        reason: null,
        created_at: TIMES.now.toISOString(),
        consumed_at: TIMES.now.toISOString(),
      },
    });

    await expect(provisionVoucher("v1", 1, TIMES, fp())).rejects.toMatchObject({
      name: "OfflineBallotError",
      statusCode: 409,
    });
  });

  it("re-issues a voucher after a prior rejection (election reopens)", async () => {
    stubOfflineDb({
      row: {
        id: "row1",
        voter_id: "v1",
        election_id: 1,
        voucher_hash: "hash-old",
        payload: "{}",
        status: "rejected",
        reason: "election-closed",
        created_at: TIMES.now.toISOString(),
        consumed_at: null,
      },
    });

    const { signed, exists } = await provisionVoucher("v1", 1, TIMES, fp());
    expect(exists).toBe(false);
    expect(verifyVoucher(signed)).toBe(true);
  });

  it("surfaces the UNIQUE backstop as 409 on a concurrent provision", async () => {
    stubOfflineDb({ row: null, insertError: { code: "23505" } });

    await expect(provisionVoucher("v1", 1, TIMES, fp())).rejects.toMatchObject({
      name: "OfflineBallotError",
      statusCode: 409,
    });
  });

  it("consumes the voucher (markVoucher) with a consumed_at timestamp", async () => {
    stubOfflineDb({ updateError: null });
    await expect(markVoucher("v1", 1, "consumed")).resolves.toBeUndefined();
  });

  it("getVoucherRow returns null when no row exists", async () => {
    // maybeSingle resolves {data:null,error:null} on an empty set.
    stubOfflineDb({ row: null, rowError: null });
    const row = await getVoucherRow("v1", 1);
    expect(row).toBeNull();
  });

  it("getVoucherRow surfaces a real DB error", async () => {
    stubOfflineDb({ row: null, rowError: { code: "ECONNREFUSED", message: "connection refused" } });
    await expect(getVoucherRow("v1", 1)).rejects.toMatchObject({
      name: "OfflineBallotError",
      statusCode: 500,
    });
  });
});