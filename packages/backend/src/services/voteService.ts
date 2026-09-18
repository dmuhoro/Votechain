import { supabase } from "./supabaseService";
import {
  generateNullifier,
  checkNullifier,
  storeNullifier,
  isAlreadyVotedError,
} from "./nullifierService";
import { relayerService } from "./relayerService";
import { SEPOLIA_EXPLORER } from "../config";

/**
 * Shared on-chain cast path. BOTH the online route (`POST /api/votes/cast`)
 * and the offline ballot reconciliation route (`POST /api/offline/ballots/submit`)
 * MUST run through this function so an offline capture is submitted through the
 * exact same code as an online vote: nullifier (boundary a) -> relayer ->
 * chain (boundary b) -> nullifier row -> vote_record. No second counting
 * surface exists (Constitution Article II; ADR-008 §3).
 */

export class VoteError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "VoteError";
    this.statusCode = statusCode;
  }
}

export interface VoteSuccess {
  txHash: string;
  blockNumber: number;
  explorerUrl: string;
  warnings?: {
    nullifierDbWarning?: boolean;
  };
}

export async function castVote(
  userId: string,
  electionId: number,
  candidateId: number
): Promise<VoteSuccess> {
  // 0. Translate Supabase DB election id to on-chain election id.
  const { data: electionRow, error: electionError } = await supabase
    .from("elections")
    .select("chain_election_id")
    .eq("id", electionId)
    .single();

  if (electionError || !electionRow) {
    if (electionError && electionError.code === "PGRST116") {
      throw new VoteError("Election not found in database.", 404);
    }
    throw new VoteError(electionError?.message || "Failed to resolve election.", 500);
  }
  const chainElectionId = electionRow.chain_election_id;

  // 1. Generate nullifier (deterministic per voter + election)
  const nullifier = generateNullifier(userId, electionId);

  // 2. Fast pre-check: nullifier must not already be recorded (Article II.2 boundary a)
  try {
    await checkNullifier(electionId, nullifier);
  } catch (error: any) {
    if (error?.statusCode === 409) {
      throw new VoteError("Voter has already cast a vote in this election.", 409);
    }
    throw error;
  }

  // 3. Submit transaction via relayerService with the chain-facing election id.
  //    Article II.3: the nullifier DB row is written ONLY after the on-chain
  //    submission succeeds, so a failed chain transaction can be retried
  //    without permanently burning the nullifier.
  let txHash: string;
  let blockNumber: number;
  try {
    ({ txHash, blockNumber } = await relayerService.submitVote(
      chainElectionId,
      candidateId,
      nullifier
    ));
  } catch (error: any) {
    if (isAlreadyVotedError(error)) {
      throw new VoteError("Voter has already cast a vote in this election.", 409);
    }
    throw error;
  }

  // 3b. Record the nullifier now that the vote is on-chain (Article II.2 boundary a,
  //     race-safe via ON CONFLICT DO NOTHING backstop). If this write fails, the
  //     on-chain nullifier mapping (boundary b, authoritative) still blocks a replay.
  let nullifierDbWarning = false;
  try {
    await storeNullifier(electionId, nullifier);
  } catch (nullifierError) {
    nullifierDbWarning = true;
    console.error(
      "Failed to store nullifier in DB after on-chain success (chain still guards):",
      nullifierError
    );
  }

  // 4. Store vote_record in Supabase
  const { error: voteRecordError } = await supabase
    .from("vote_records")
    .insert({
      election_id: electionId,
      tx_hash: txHash,
      nullifier_hash: nullifier,
      block_number: blockNumber,
    });

  if (voteRecordError) {
    // The on-chain transaction succeeded; the receipt query falls back to the
    // chain, so the missing DB record is logged for manual intervention, not
    // treated as a failure of the vote itself.
    console.error("Failed to store vote record in DB:", voteRecordError);
  }

  return {
    txHash,
    blockNumber,
    explorerUrl: `${SEPOLIA_EXPLORER}/tx/${txHash}`,
    ...(nullifierDbWarning ? { warnings: { nullifierDbWarning: true } } : {}),
  };
}