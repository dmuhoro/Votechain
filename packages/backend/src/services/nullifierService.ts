import { supabase } from "./supabaseService";
import { SERVER_SECRET } from "../config";
import { createHash } from "crypto";

export const generateNullifier = (voterId: string, electionId: number): string => {
  const data = `${voterId}-${electionId}-${SERVER_SECRET}`;
  return `0x${createHash("sha256").update(data).digest("hex")}`;
};

export const isAlreadyVotedError = (error: any): boolean => {
  const message = String(
    error?.message || error?.shortMessage || error?.info?.error?.message || ""
  ).toLowerCase();
  return message.includes("already voted");
};

export const checkNullifier = async (electionId: number, nullifierHash: string): Promise<void> => {
  const { data: existingNullifier, error: fetchError } = await supabase
    .from("nullifiers")
    .select("id")
    .eq("election_id", electionId)
    .eq("nullifier_hash", nullifierHash)
    .single();

  if (fetchError && fetchError.code !== "PGRST116") { // PGRST116 means no rows found
    throw new Error(`Error checking nullifier: ${fetchError.message}`);
  }

  if (existingNullifier) {
    const err = new Error("Voter has already cast a vote in this election.");
    (err as any).statusCode = 409;
    throw err;
  }
};

export const storeNullifier = async (electionId: number, nullifierHash: string): Promise<void> => {
  const { error: upsertError } = await supabase
    .from("nullifiers")
    .upsert({ election_id: electionId, nullifier_hash: nullifierHash }, {
      onConflict: "nullifier_hash",
      ignoreDuplicates: true,
    });

  if (upsertError) {
    throw new Error(`Error storing nullifier: ${upsertError.message}`);
  }
};