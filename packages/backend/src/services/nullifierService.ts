import { supabase } from "./supabaseService";
import { SERVER_SECRET } from "../config";
import { createHash } from "crypto";

export const generateNullifier = (voterId: string, electionId: number): string => {
  const data = `${voterId}-${electionId}-${SERVER_SECRET}`;
  return `0x${createHash("sha256").update(data).digest("hex")}`;
};

export const checkAndStoreNullifier = async (electionId: number, nullifierHash: string) => {
  // Check if nullifier already exists
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
    throw new Error("Voter has already cast a vote in this election.");
  }

  // Store nullifier
  const { error: insertError } = await supabase
    .from("nullifiers")
    .insert({ election_id: electionId, nullifier_hash: nullifierHash });

  if (insertError) {
    throw new Error(`Error storing nullifier: ${insertError.message}`);
  }
};
