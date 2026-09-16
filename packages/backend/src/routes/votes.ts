import { Router, Request } from 'express';
import { z } from 'zod';
import { protect } from '../middleware/authMiddleware';
import { relayerService } from '../services/relayerService';
import { generateNullifier, checkAndStoreNullifier } from '../services/nullifierService';
import { supabase } from '../services/supabaseService';
import { ethers } from 'ethers';
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

    // 1. Generate nullifier
    const nullifier = generateNullifier(req.user.id, electionId);

    // 2. Check nullifier not in nullifiers table (fast pre-check)
    await checkAndStoreNullifier(electionId, nullifier);

    // 3. Submit transaction via relayerService
    const { txHash, blockNumber } = await relayerService.submitVote(
      electionId,
      candidateId,
      nullifier
    );

    // 4. Store vote_record in Supabase
    const { error: voteRecordError } = await supabase
      .from('vote_records')
      .insert({
        election_id: electionId,
        tx_hash: txHash,
        nullifier_hash: nullifier,
        block_number: blockNumber,
      });

    if (voteRecordError) {
      // If storing vote record fails, we should ideally have a mechanism to revert the nullifier
      // or at least log this for manual intervention, as the vote was sent on-chain.
      console.error('Failed to store vote record in DB:', voteRecordError);
      // Still return success as the on-chain transaction was successful
    }

    res.status(200).json({
      message: 'Vote cast successfully',
      txHash,
      blockNumber,
      explorerUrl: `${SEPOLIA_EXPLORER}/tx/${txHash}`,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
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
        const [names, parties] = await voteChainContract.getResults(voteRecord.election_id);
        const index = Number(candidateId) - 1;
        candidateName = names[index] || 'Unknown';
        candidateParty = parties[index] || 'Unknown';
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
