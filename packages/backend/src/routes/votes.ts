import { Router, Request } from 'express';
import { z } from 'zod';
import { ethers } from 'ethers';
import { protect } from '../middleware/authMiddleware';
import { castVote, VoteError } from '../services/voteService';
import { supabase } from '../services/supabaseService';
import { SEPOLIA_RPC_URL, CONTRACT_ADDRESS, SEPOLIA_EXPLORER } from '../config';
import VoteChainArtifact from '../artifacts/VoteChain.json';

const router = Router();

// Extend Request type for authenticated user
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    is_admin: boolean;
    is_verified_voter: boolean;
  };
}
// Initialize ethers provider and contract for read-only operations
const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
const voteChainContract = new ethers.Contract(CONTRACT_ADDRESS, VoteChainArtifact.abi, provider);

// Schema for casting a vote
const castVoteSchema = z.object({
  electionId: z.number().int().positive(),
  candidateId: z.number().int().positive(),
});

router.post('/cast', protect, async (req: AuthenticatedRequest, res) => {
  try {
    const { electionId, candidateId } = castVoteSchema.parse(req.body);

    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    if (!req.user.is_verified_voter) {
      return res.status(403).json({ message: 'Voter is not verified.' });
    }

    // Real submission path: shared with the offline reconciliation route so
    // an offline ballot is submitted through the identical code as an online
    // vote (Constitution Article II; ADR-008 §3).
    const result = await castVote(req.user.id, electionId, candidateId);

    if (result.warnings?.nullifierDbWarning) {
      res.set('X-VoteChain-Nullifier-Db-Warning', 'true');
    }

    res.status(200).json({
      message: 'Vote cast successfully',
      txHash: result.txHash,
      blockNumber: result.blockNumber,
      explorerUrl: result.explorerUrl,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    if (error instanceof VoteError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Error casting vote:', error);
    res.status(500).json({ message: error.message || 'Failed to cast vote' });
  }
});

// GET /api/votes/receipt/:txHash - verify a specific vote exists on-chain
const getReceiptSchema = z.object({
  txHash: z.string().startsWith('0x').length(66), // Ethereum transaction hash
});

router.get('/receipt/:txHash', async (req, res) => {
  try {
    const { txHash } = getReceiptSchema.parse(req.params);

    // Look up tx in our database first
    const { data: voteRecord, error: dbError } = await supabase
      .from('vote_records')
      .select('election_id, tx_hash, nullifier_hash, block_number')
      .eq('tx_hash', txHash)
      .single();

    if (dbError) {
      if (dbError.code === 'PGRST116') {
        return res.status(404).json({ message: 'Vote record not found in database.' });
      }
      return res.status(500).json({ message: dbError.message });
    }

    // Verify on-chain (optional, as we already have it in DB, but good for robustness)
    const transactionReceipt = await provider.getTransactionReceipt(txHash);

    if (!transactionReceipt || transactionReceipt.status !== 1) {
      return res.status(404).json({ message: 'Transaction not found or failed on-chain.' });
    }

    // Fetch election details from DB
    const { data: election, error: electionError } = await supabase
      .from('elections')
      .select('title, description')
      .eq('id', voteRecord.election_id)
      .single();

    if (electionError) {
      console.error('Error fetching election for receipt:', electionError);
      // Continue even if election details can't be fetched fully
    }

    // Decode the VoteCast event to get candidateId
    const iface = new ethers.Interface(VoteChainArtifact.abi);
    let candidateId = null;
    for (const log of transactionReceipt.logs) {
      try {
        const parsedLog = iface.parseLog(log);
        if (parsedLog && parsedLog.name === 'VoteCast') {
          candidateId = parsedLog.args.candidateId;
          break;
        }
      } catch (e) {
        // Not a VoteCast event, continue
      }
    }

    let candidateName = 'Unknown';
    let candidateParty = 'Unknown';
    if (candidateId !== null) {
      try {
        // Translate DB election id to the on-chain election id before reading results
        const { data: electionForChain } = await supabase
          .from('elections')
          .select('chain_election_id')
          .eq('id', voteRecord.election_id)
          .single();
        const chainElectionId = electionForChain?.chain_election_id;
        if (chainElectionId !== undefined) {
          const [names, parties] = await voteChainContract.getResults(chainElectionId);
          const index = Number(candidateId) - 1;
          candidateName = names[index] || 'Unknown';
          candidateParty = parties[index] || 'Unknown';
        }
      } catch (e) {
        console.error('Error fetching candidate details from contract:', e);
      }
    }

    const block = await provider.getBlock(transactionReceipt.blockNumber);
    const receiptTimestamp = block ? new Date(block.timestamp * 1000).toISOString() : null;

    res.status(200).json({
      message: 'Vote verified successfully',
      electionTitle: election?.title || 'N/A',
      electionDescription: election?.description || 'N/A',
      candidateVotedFor: candidateName,
      candidateParty: candidateParty,
      txHash: voteRecord.tx_hash,
      blockNumber: voteRecord.block_number,
      nullifierHash: voteRecord.nullifier_hash,
      timestamp: receiptTimestamp,
      explorerUrl: `${SEPOLIA_EXPLORER}/tx/${txHash}`,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Error verifying vote receipt:', error);
    res.status(500).json({ message: error.message || 'Failed to verify vote receipt' });
  }
});

export default router;
