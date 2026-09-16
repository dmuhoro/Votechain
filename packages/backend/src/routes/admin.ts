import { Router } from 'express';
import { z } from 'zod';
import { adminProtect, protect } from '../middleware/authMiddleware';
import { supabase } from '../services/supabaseService';
import { ethers } from 'ethers';
import { SEPOLIA_RPC_URL, CONTRACT_ADDRESS, OWNER_PRIVATE_KEY } from '../config';
import VoteChainArtifact from '../artifacts/VoteChain.json';

const router = Router();

// Initialize ethers provider and contract for admin operations.
// Owner-only calls (createElection, closeElection, updateRelayer) MUST be
// signed by the owner key (ADR-003 key separation), never the relayer key.
const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
const ownerWallet = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);
const voteChainContract = new ethers.Contract(CONTRACT_ADDRESS, VoteChainArtifact.abi, ownerWallet);

// Schema for creating an election
const createElectionSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  candidates: z.array(z.object({
    name: z.string().min(1, "Candidate name is required"),
    party: z.string().optional(),
  })).min(1, "At least one candidate is required"),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
});

// POST /api/admin/elections/create - Creates election on-chain + stores in Supabase
router.post('/elections/create', protect, adminProtect, async (req, res) => {
  try {
    const { title, description, candidates, startTime, endTime } = createElectionSchema.parse(req.body);

    const candidateNames = candidates.map(c => c.name);
    const candidateParties = candidates.map(c => c.party || "");

    const startTimestamp = Math.floor(new Date(startTime).getTime() / 1000);
    const endTimestamp = Math.floor(new Date(endTime).getTime() / 1000);

    // 1. Create election on-chain
    const tx = await voteChainContract.createElection(
      title,
      description || "",
      candidateNames,
      candidateParties,
      startTimestamp,
      endTimestamp
    );
    const receipt = await tx.wait();

    if (!receipt) {
      throw new Error("Transaction receipt not received.");
    }

    // Extract electionId from event
    const iface = new ethers.Interface(VoteChainArtifact.abi);
    let chainElectionId: number | undefined;
    for (const log of receipt.logs) {
      try {
        const parsedLog = iface.parseLog(log);
        if (parsedLog && parsedLog.name === 'ElectionCreated') {
          chainElectionId = Number(parsedLog.args.electionId);
          break;
        }
      } catch (e) {
        // Not an ElectionCreated event, continue
      }
    }

    if (chainElectionId === undefined) {
      throw new Error("Could not get electionId from transaction receipt.");
    }

    // 2. Store election details in Supabase
    const { data, error } = await supabase
      .from('elections')
      .insert({
        chain_election_id: chainElectionId,
        title,
        description,
        start_time: startTime,
        end_time: endTime,
        contract_address: CONTRACT_ADDRESS,
      })
      .select();

    if (error) {
      console.error("Error storing election in Supabase:", error);
      // Potentially revert on-chain transaction if DB storage is critical
      return res.status(500).json({ message: "Election created on-chain but failed to store in database." });
    }

    res.status(201).json({ message: "Election created successfully", election: data[0] });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error("Error creating election:", error);
    res.status(500).json({ message: error.message || "Failed to create election" });
  }
});

// Schema for closing an election
const closeElectionSchema = z.object({
  id: z.preprocess(Number, z.number().int().positive()),
});

// POST /api/admin/elections/:id/close - Closes an election
router.post('/elections/:id/close', protect, adminProtect, async (req, res) => {
  try {
    const { id } = closeElectionSchema.parse(req.params);

    // Get chain_election_id from DB
    const { data: election, error: dbError } = await supabase
      .from('elections')
      .select('chain_election_id')
      .eq('id', id)
      .single();

    if (dbError) {
      if (dbError.code === 'PGRST116') {
        return res.status(404).json({ message: 'Election not found in DB' });
      }
      return res.status(500).json({ message: dbError.message });
    }

    const chainElectionId = election.chain_election_id;

    // Close election on-chain
    const tx = await voteChainContract.closeElection(chainElectionId);
    await tx.wait();

    // Update status in DB
    const { error: updateError } = await supabase
      .from('elections')
      .update({ is_active: false })
      .eq('id', id);

    if (updateError) {
      console.error("Error updating election status in Supabase:", updateError);
      // Log for manual intervention, on-chain is closed.
    }

    res.status(200).json({ message: "Election closed successfully" });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error("Error closing election:", error);
    res.status(500).json({ message: error.message || "Failed to close election" });
  }
});

// GET /api/admin/voters - List registered voters with verification status
router.get('/voters', protect, adminProtect, async (_req, res) => {
  try {
    const { data: voters, error } = await supabase
      .from('voters')
      .select('id, email, is_verified, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    res.status(200).json(voters);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Schema for verifying a voter
const verifyVoterSchema = z.object({
  id: z.string().uuid(),
});

// PATCH /api/admin/voters/:id/verify - Mark voter as verified
router.patch('/voters/:id/verify', protect, adminProtect, async (req, res) => {
  try {
    const { id } = verifyVoterSchema.parse(req.params);

    const { data, error } = await supabase
      .from('voters')
      .update({ is_verified: true })
      .eq('id', id)
      .select();

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ message: 'Voter not found' });
    }

    res.status(200).json({ message: 'Voter verified successfully', voter: data[0] });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    res.status(500).json({ message: error.message });
  }
});

export default router;
