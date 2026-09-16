import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateNullifier } from "../src/services/nullifierService";

vi.mock("../src/services/supabaseService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/supabaseService")>();
  return {
    ...actual,
    supabase: { from: () => { throw new Error("not stubbed"); } },
  };
});

import * as nullifierService from "../src/services/nullifierService";
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

  const from = vi.fn(() => ({
    select: () => ({
      eq: () => ({ eq: () => ({ single: fetchSingle }) }),
    }),
    insert,
  }));

  (supabase as unknown as SupabaseStub).from = from;
  return { from, insert, fetchSingle };
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

  it("checkAndStoreNullifier rejects an already-used nullifier", async () => {
    const { insert } = mockSupabase({ existing: { id: "row" } });
    await expect(nullifierService.checkAndStoreNullifier(1, "0xabc")).rejects.toThrow(
      "already cast a vote"
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it("checkAndStoreNullifier stores the nullifier when not yet used", async () => {
    const { insert } = mockSupabase({ existing: null, fetchCode: "PGRST116" });
    await nullifierService.checkAndStoreNullifier(1, "0xabc");
    expect(insert).toHaveBeenCalledWith({ election_id: 1, nullifier_hash: "0xabc" });
  });

  it("checkAndStoreNullifier surfaces supabase read errors (non empty-set)", async () => {
    mockSupabase({ existing: null, fetchCode: "ECONNREFUSED" });
    await expect(nullifierService.checkAndStoreNullifier(1, "0xabc")).rejects.toThrow(
      "Error checking nullifier"
    );
  });

  it("checkAndStoreNullifier surfaces supabase insert errors", async () => {
    mockSupabase({ existing: null, fetchCode: "PGRST116", insertError: { message: "dup" } });
    await expect(nullifierService.checkAndStoreNullifier(1, "0xabc")).rejects.toThrow(
      "Error storing nullifier"
    );
  });
});