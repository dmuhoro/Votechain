import { Router } from 'express';
import { z } from 'zod';
import { ethers } from 'ethers';
import { supabase } from '../services/supabaseService';
import { CONTRACT_ADDRESS, SEPOLIA_RPC_URL } from '../config';
import VoteChainArtifact from '../artifacts/VoteChain.json';

const router = Router();

// Initialize ethers provider and contract
const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
const voteChainContract = new ethers.Contract(CONTRACT_ADDRESS, VoteChainArtifact.abi, provider);

// Schema for election ID parameter
const electionIdSchema = z.object({
  id: z.preprocess(Number, z.number().int().positive()),
});

// GET /api/elections - List all elections with status
router.get('/', async (_req, res) => {
  try {
    const { data: elections, error } = await supabase
      .from('elections')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    res.status(200).json(elections);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/elections/:id - Single election details
router.get('/:id', async (req, res) => {
  try {
    const { id } = electionIdSchema.parse(req.params);

    const { data: election, error } = await supabase
      .from('elections')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') { // No rows found
        return res.status(404).json({ message: 'Election not found' });
      }
      return res.status(500).json({ message: error.message });
    }

    res.status(200).json(election);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    res.status(500).json({ message: error.message });
  }
});

// GET /api/elections/:id/results - Fetch live results from contract via ethers.js
router.get('/:id/results', async (req, res) => {
  try {
    const { id } = electionIdSchema.parse(req.params);

    const { data: election, error } = await supabase
      .from('elections')
      .select('chain_election_id')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ message: 'Election not found in DB' });
      }
      return res.status(500).json({ message: error.message });
    }

    const chainElectionId = election.chain_election_id;

    // Fetch results from smart contract
    const [names, parties, voteCounts] = await voteChainContract.getResults(chainElectionId);

    const results = names.map((name: string, index: number) => ({
      name,
      party: parties[index],
      voteCount: Number(voteCounts[index]), // Convert BigInt to number
    }));

    res.status(200).json(results);
  } catch (error: any) {
    console.error("Error fetching election results:", error);
    res.status(500).json({ message: 'Failed to fetch election results from blockchain', error: error.message });
  }
});

// GET /api/elections/:id/candidates - List candidates for an election
router.get('/:id/candidates', async (req, res) => {
  try {
    const { id } = electionIdSchema.parse(req.params);

    const { data: election, error } = await supabase
      .from('elections')
      .select('chain_election_id')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ message: 'Election not found in DB' });
      }
      return res.status(500).json({ message: error.message });
    }

    const chainElectionId = election.chain_election_id;

    // Fetch candidates from the smart contract via getResults (names/parties)
    const [names, parties] = await voteChainContract.getResults(chainElectionId);

    const candidates = names.map((name: string, index: number) => ({
      id: index + 1,
      name,
      party: parties[index],
    }));

    res.status(200).json(candidates);
  } catch (error: any) {
    console.error("Error fetching election candidates:", error);
    res.status(500).json({ message: 'Failed to fetch election candidates from blockchain', error: error.message });
  }
});

export default router;
