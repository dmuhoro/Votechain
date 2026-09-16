import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateNullifier,
  checkNullifier,
  storeNullifier,
  isAlreadyVotedError,
} from "../src/services/nullifierService";

vi.mock("../src/services/supabaseService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/supabaseService")>();
  return {
    ...actual,
    supabase: { from: () => { throw new Error("not stubbed"); } },
  };
});

const nullifierService = await import("../src/services/nullifierService");
import { supabase } from "../src/services/supabaseService";

type SupabaseStub = { from: (table: string) => unknown };

function mockSupabase({ existing, insertError, fetchCode }: {
  existing: unknown;
  insertError?: unknown;
  fetchCode?: string;
}) {
  const fetchSingle = vi.fn().mockResolvedValue({
    data: existing,
    error: fetchCode ? { code: fetchCode } : null,
  });
  const insert = vi.fn().mockResolvedValue({ error: insertError ?? null });
  const upsert = vi.fn().mockResolvedValue({ error: insertError ?? null });

  const from = vi.fn(() => ({
    select: () => ({
      eq: () => ({ eq: () => ({ single: fetchSingle }) }),
    }),
    insert,
    upsert,
  }));

  (supabase as unknown as SupabaseStub).from = from;
  return { from, insert, upsert, fetchSingle };
}

describe("nullifierService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("generateNullifier returns a deterministic 0x-prefixed 64-char hex string", () => {
    const a = generateNullifier("user-1", 3);
    const b = generateNullifier("user-1", 3);
    expect(a).toBe(b);
    expect(a).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("generateNullifier differs across elections and voters", () => {
    const byElection = generateNullifier("user-1", 1);
    const otherElection = generateNullifier("user-1", 2);
    const otherVoter = generateNullifier("user-2", 1);
    expect(byElection).not.toBe(otherElection);
    expect(byElection).not.toBe(otherVoter);
  });

  it("checkNullifier rejects an already-used nullifier", async () => {
    const { insert } = mockSupabase({ existing: { id: "row" } });
    await expect(nullifierService.checkNullifier(1, "0xabc")).rejects.toThrow(
      "already cast a vote"
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it("checkNullifier passes (no throw) when nullifier is not yet used", async () => {
    const { insert } = mockSupabase({ existing: null, fetchCode: "PGRST116" });
    await expect(nullifierService.checkNullifier(1, "0xabc")).resolves.toBeUndefined();
    expect(insert).not.toHaveBeenCalled();
  });

  it("checkNullifier surfaces supabase read errors (non empty-set)", async () => {
    mockSupabase({ existing: null, fetchCode: "ECONNREFUSED" });
    await expect(nullifierService.checkNullifier(1, "0xabc")).rejects.toThrow(
      "Error checking nullifier"
    );
  });

  it("storeNullifier upserts with an atomic onConflict/ignoreDuplicates backstop", async () => {
    const { upsert } = mockSupabase({ existing: null });
    await nullifierService.storeNullifier(1, "0xabc");
    expect(upsert).toHaveBeenCalledWith(
      { election_id: 1, nullifier_hash: "0xabc" },
      { onConflict: "nullifier_hash", ignoreDuplicates: true }
    );
  });

  it("storeNullifier surfaces supabase upsert errors", async () => {
    mockSupabase({ existing: null, insertError: { message: "dup" } });
    await expect(nullifierService.storeNullifier(1, "0xabc")).rejects.toThrow(
      "Error storing nullifier"
    );
  });

  it("isAlreadyVotedError detects the contract revert string", () => {
    expect(isAlreadyVotedError(new Error('execution reverted: "Already voted"'))).toBe(true);
    expect(isAlreadyVotedError({ message: "reverted: Already voted" })).toBe(true);
    expect(isAlreadyVotedError(new Error("network error"))).toBe(false);
  });
});