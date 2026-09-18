import { Router, Request } from 'express';
import { z } from 'zod';
import { ethers } from 'ethers';
import { protect } from '../middleware/authMiddleware';
import { supabase } from '../services/supabaseService';
import { CONTRACT_ADDRESS, SEPOLIA_RPC_URL } from '../config';
import VoteChainArtifact from '../artifacts/VoteChain.json';
import {
  provisionVoucher,
  getVoucherRow,
  listVoucherRows,
  verifyVoucher,
  signVoucher,
  candidatesFingerprint,
  markVoucher,
  OfflineBallotError,
  ChainCandidate,
  SignedVoucher,
} from '../services/offlineBallotService';
import { castVote, VoteError } from '../services/voteService';

const router = Router();

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    is_admin: boolean;
    is_verified_voter: boolean;
  };
}

const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
const voteChainContract = new ethers.Contract(CONTRACT_ADDRESS, VoteChainArtifact.abi, provider);

async function fetchChainCandidates(chainElectionId: number): Promise<ChainCandidate[]> {
  const [names, parties] = await voteChainContract.getResults(chainElectionId);
  return names.map((name: string, index: number) => ({
    id: index + 1,
    name,
    party: parties[index] ?? "",
  }));
}

async function loadElection(electionId: number): Promise<{
  chain_election_id: number;
  title: string;
  is_active: boolean;
  start_time: string;
  end_time: string;
}> {
  const { data, error } = await supabase
    .from('elections')
    .select('chain_election_id, title, is_active, start_time, end_time')
    .eq('id', electionId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new OfflineBallotError('Election not found.', 404);
    }
    throw new OfflineBallotError(error.message, 500);
  }
  return data;
}

// POST /api/offline/ballots — provision a one-time offline ballot voucher.
// POST (mutating + never SW-cached) by design: a cached "provision response"
// must never be mistaken for a real voucher (Constitution Article I.1).
const provisionSchema = z.object({
  electionId: z.number().int().positive(),
});

router.post('/ballots', protect, async (req: AuthenticatedRequest, res) => {
  try {
    const { electionId } = provisionSchema.parse(req.body);

    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }
    if (!req.user.is_verified_voter) {
      return res.status(403).json({
        message: 'Voter is not verified. Offline ballots are only issued to verified voters.',
      });
    }

    const election = await loadElection(electionId);
    const now = new Date();
    const start = new Date(election.start_time);
    const end = new Date(election.end_time);
    if (!election.is_active || now < start || now > end) {
      return res.status(409).json({ message: 'Election is not open for voting.' });
    }

    const candidates = await fetchChainCandidates(election.chain_election_id);
    const fingerprint = candidatesFingerprint(candidates);

    const { signed, exists } = await provisionVoucher(req.user.id, electionId, {
      now,
      startTime: start,
      endTime: end,
    }, fingerprint);

    res.status(exists ? 200 : 201).json({
      message: exists
        ? 'An offline ballot was already issued for this election. Re-downloaded it.'
        : 'Offline ballot prepared. Capture your vote while offline and it will submit on reconnect.',
      voucher: signed,
      candidates,
      expiresAt: signed.payload.expiresAt,
      exists,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    if (error instanceof OfflineBallotError) {
      return res.status(error.statusCode).json({ message: error.message, reason: error.reason });
    }
    console.error('Error provisioning offline ballot:', error);
    res.status(500).json({ message: error.message || 'Failed to prepare offline ballot.' });
  }
});

// GET /api/offline/ballots — reconciliation state: my vouchers + their status.
router.get('/ballots', protect, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });

    const rows = await listVoucherRows(req.user.id);
    const vouchers: Array<{
      electionId: number;
      status: string;
      reason: string | null;
      created_at: string;
      consumed_at: string | null;
      voucher: SignedVoucher;
    }> = [];

    for (const row of rows) {
      try {
        const payload = JSON.parse(row.payload);
        vouchers.push({
          electionId: row.election_id,
          status: row.status,
          reason: row.reason,
          created_at: row.created_at,
          consumed_at: row.consumed_at,
          voucher: { payload, signature: signVoucher(payload) },
        });
      } catch {
        // Skip corrupt payloads; do not fail the whole list.
      }
    }

    res.status(200).json({ vouchers });
  } catch (error: any) {
    if (error instanceof OfflineBallotError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Error listing offline ballots:', error);
    res.status(500).json({ message: error.message || 'Failed to list offline ballots.' });
  }
});

// POST /api/offline/ballots/submit — submit a captured offline ballot THROUGH the
// real cast path (voteService.castVote). Voucher validation precedes it.
const submitSchema = z.object({
  voucher: z.object({
    payload: z.object({
      version: z.literal(1 as const),
      voterId: z.string(),
      electionId: z.number().int().positive(),
      candidatesFingerprint: z.string(),
      issuedAt: z.string(),
      expiresAt: z.string(),
    }),
    signature: z.string(),
  }),
  candidateId: z.number().int().positive(),
});

router.post('/ballots/submit', protect, async (req: AuthenticatedRequest, res) => {
  try {
    const { voucher, candidateId } = submitSchema.parse(req.body);

    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    // 1. Signature integrity (fail closed at the boundary).
    if (!verifyVoucher(voucher)) {
      return res.status(400).json({ message: 'Invalid offline ballot voucher.' });
    }

    const { voterId, electionId } = voucher.payload;

    // 2. The voucher must belong to THIS caller.
    if (voterId !== req.user.id) {
      return res.status(403).json({ message: 'Offline ballot belongs to a different voter.' });
    }

    // 3. Election must still be open (mirrors the vote path's window).
    const election = await loadElection(electionId);
    const now = new Date();
    if (!election.is_active || now < new Date(election.start_time) || now > new Date(election.end_time)) {
      // No silent drop: mark the voucher rejected with an explicit reason.
      await markVoucher(voterId, electionId, 'rejected', 'election-closed');
      return res.status(409).json({ message: 'Election is no longer open for this ballot. It was not counted.', reason: 'expired' });
    }

    // 4. One-time use: an already-consumed voucher must not submit again
    //    (the nullifier would also block it; this makes the reason explicit).
    const row = await getVoucherRow(voterId, electionId);
    if (!row || row.status === 'consumed') {
      return res.status(409).json({
        message: 'This offline ballot was already submitted.',
        reason: 'duplicate',
      });
    }
    if (row.status === 'rejected') {
      return res.status(409).json({ message: row.reason || 'This offline ballot was rejected.', reason: row.reason || 'rejected' });
    }

    // 5. Candidate-set integrity: the capture must match THIS election's current
    //    on-chain candidates (detects a tampered ballot payload).
    const candidates = await fetchChainCandidates(election.chain_election_id);
    const fingerprint = candidatesFingerprint(candidates);
    if (fingerprint !== voucher.payload.candidatesFingerprint) {
      await markVoucher(voterId, electionId, 'rejected', 'candidate-mismatch');
      return res.status(400).json({ message: 'Offline ballot does not match the election candidates. It was not counted.', reason: 'rejected' });
    }
    if (!candidates.some((c) => c.id === candidateId)) {
      await markVoucher(voterId, electionId, 'rejected', 'candidate-mismatch');
      return res.status(400).json({ message: 'Selected candidate is not part of this election.', reason: 'rejected' });
    }

    // 6. THE REAL PATH: identical code to POST /api/votes/cast.
    let result;
    try {
      result = await castVote(req.user.id, electionId, candidateId);
    } catch (error: any) {
      if (error instanceof VoteError && error.statusCode === 409) {
        // The nullifier boundary refused the replay (voter already voted —
        // online, from another device, or a raced duplicate). Explicit outcome.
        await markVoucher(voterId, electionId, 'rejected', 'duplicate');
        return res.status(409).json({
          message: 'You have already voted in this election. This offline ballot was not counted.',
          reason: 'duplicate',
        });
      }
      throw error;
    }

    // 7. Consume the voucher. If this write fails the vote is STILL safely on
    //    chain; a future replay hits the nullifier boundary and is rejected
    //    with reason 'duplicate' (never a second vote).
    await markVoucher(voterId, electionId, 'consumed');

    res.status(200).json({
      message: 'Offline ballot submitted and counted on-chain.',
      ...result,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    if (error instanceof OfflineBallotError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Error submitting offline ballot:', error);
    res.status(500).json({ message: error.message || 'Failed to submit offline ballot.' });
  }
});

export default router;