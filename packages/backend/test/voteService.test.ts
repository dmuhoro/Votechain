import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  castVote,
  VoteError,
} from "../src/services/voteService";

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

type Table = string;

function stubDb(overrides: {
  election?: { chain_election_id: number } | null;
  electionError?: Partial<{ code: string; message: string }> | null;
  existingNullifier?: unknown;
  nullifierFetchError?: Partial<{ code: string }> | null;
  voteRecordError?: unknown;
  nullifierUpsertError?: unknown;
}) {
  const calls = { submitVote: vi.mocked(relayerService.submitVote), inserts: [] as string[] };
  void calls;

  const from = vi.fn((table: Table) => {
    if (table === "elections") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: overrides.election ?? null,
              error: overrides.electionError ?? null,
            }),
          }),
        }),
      };
    }
    if (table === "nullifiers") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({
                data: overrides.existingNullifier ?? null,
                error:
                  overrides.nullifierFetchError ??
                  (overrides.existingNullifier === undefined ? { code: "PGRST116" } : null),
              }),
            }),
          }),
        }),
        upsert: async () => ({
          error: overrides.nullifierUpsertError ?? null,
        }),
      };
    }
    if (table === "vote_records") {
      return {
        insert: async (payload: unknown) => {
          overrides.voteRecordError;
          return { error: overrides.voteRecordError ?? null };
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  });

  (supabase as unknown as { from: unknown }).from = from;
  return { from };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(relayerService.submitVote).mockReset();
  vi.mocked(relayerService.submitVote).mockResolvedValue({
    txHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    blockNumber: 12345,
  });
});

describe("voteService.castVote — shared real cast path", () => {
  it("submission calls the relayer exactly once with chain election id + nullifier", async () => {
    stubDb({
      election: { chain_election_id: 1 },
      nullifierFetchError: { code: "PGRST116" },
    });

    const result = await castVote("voter-1", 2, 1);

    expect(relayerService.submitVote).toHaveBeenCalledTimes(1);
    expect(relayerService.submitVote).toHaveBeenCalledWith(
      1, 1, expect.stringMatching(/^0x[0-9a-f]{64}$/)
    );
    expect(result.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.blockNumber).toBe(12345);
    expect(result.explorerUrl).toContain(`/tx/${result.txHash}`);
  });

  it("returns 404 VoteError and NEVER calls the relayer when the election is missing", async () => {
    stubDb({ election: null, electionError: { code: "PGRST116" } });

    await expect(castVote("voter-1", 2, 1)).rejects.toMatchObject({
      name: "VoteError",
      statusCode: 404,
    });
    expect(relayerService.submitVote).not.toHaveBeenCalled();
  });

  it("rejects a DB-boundary duplicate (nullifier already present) WITHOUT calling the relayer", async () => {
    stubDb({ election: { chain_election_id: 1 }, existingNullifier: { id: "row" } });

    await expect(castVote("voter-1", 2, 1)).rejects.toMatchObject({
      name: "VoteError",
      statusCode: 409,
    });
    expect(relayerService.submitVote).not.toHaveBeenCalled();
  });

  it("rejects a chain-boundary duplicate (contract revert) and skips the DB nullifier write", async () => {
    stubDb({ election: { chain_election_id: 1 }, nullifierFetchError: { code: "PGRST116" } });
    vi.mocked(relayerService.submitVote).mockRejectedValue(
      new Error('execution reverted: "Already voted"')
    );

    await expect(castVote("voter-1", 2, 1)).rejects.toMatchObject({
      name: "VoteError",
      statusCode: 409,
    });
  });

  it("tolerates a nullifier DB write failure after on-chain success and flags the warning", async () => {
    stubDb({
      election: { chain_election_id: 1 },
      nullifierFetchError: { code: "PGRST116" },
      nullifierUpsertError: { message: "boom", code: "500" },
    });

    const result = await castVote("voter-1", 2, 1);
    expect(result.warnings?.nullifierDbWarning).toBe(true);
    expect(relayerService.submitVote).toHaveBeenCalledTimes(1);
  });
});