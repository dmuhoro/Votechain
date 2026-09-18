import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { toErrorMessage } from '../lib/api';
import { useVote } from '../hooks/useVote';
import { useNetworkStore } from '../store/networkStore';
import { useAuthStore } from '../store/authStore';
import {
  saveSignedVoucher,
  getSignedVoucher,
  getOfflineBallot,
  captureOfflineBallot,
  removeOfflineBallot,
} from '../lib/offlineBallots';
import type { CapturedInput } from '../hooks/useOfflineSync';
import { Candidate } from '../types';
import CandidateCard from '../components/CandidateCard';
import VoteConfirmModal from '../components/VoteConfirmModal';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import PageShell from '../components/PageShell';

const BallotPage: React.FC = () => {
  const { electionId } = useParams<{ electionId: string }>();
  const navigate = useNavigate();
  const isOnline = useNetworkStore((s) => s.isOnline);
  const user = useAuthStore((s) => s.user);
  const { castVote, isSubmitting, error: voteError } = useVote();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offlineCaptured, setOfflineCaptured] = useState<CapturedInput | null>(null);
  const [isPreparingOffline, setIsPreparingOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchCandidates = async () => {
      try {
        const response = await api.get(`/api/elections/${electionId}/candidates`);
        if (!cancelled) setCandidates(response.data);
      } catch (err: any) {
        if (!cancelled) setError(toErrorMessage(err, 'Failed to fetch candidates'));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    if (electionId) {
      fetchCandidates();
    }
    return () => {
      cancelled = true;
    };
  }, [electionId]);

  const numericElectionId = electionId ? Number(electionId) : null;

  // Provision a signed offline voucher as soon as a verified voter opens the
  // ballot while online. If the connection drops later, the voucher is already
  // on-device so the vote can still be captured (ADR-008). Best-effort for the
  // online path: if it fails the voter can still vote normally online.
  useEffect(() => {
    if (!numericElectionId || !isOnline || !user?.id) return;
    let cancelled = false;
    setIsPreparingOffline(true);
    const provision = async () => {
      try {
        const response = await api.post('/api/offline/ballots', {
          electionId: numericElectionId,
        });
        if (!cancelled && response.data?.voucher) {
          saveSignedVoucher(response.data.voucher);
        }
      } catch {
        // Non-fatal: online voting still works; offline capture needs a
        // voucher, so an explicit error is shown if the network drops.
      } finally {
        if (!cancelled) setIsPreparingOffline(false);
      }
    };
    void provision();
    return () => {
      cancelled = true;
    };
  }, [numericElectionId, isOnline, user?.id]);

  // Restore an already-captured ballot for this election after a reload.
  useEffect(() => {
    if (!numericElectionId) return;
    const existing = getOfflineBallot(numericElectionId);
    if (existing?.status === 'captured') {
      setOfflineCaptured({
        electionId: existing.electionId,
        candidateId: existing.candidateId,
        voucher: existing.voucher,
        electionTitle: existing.electionTitle,
        candidateName: existing.candidateName,
      });
    }
  }, [numericElectionId]);

  const handleVoteConfirm = async () => {
    if (!electionId || !selectedCandidateId) return;

    // Offline: capture the ballot on-device instead of failing. Submission
    // happens automatically on reconnect THROUGH the real cast path.
    if (!isOnline) {
      // First capture uses the signed voucher that was provisioned while
      // online (ADR-008); a later re-capture after reload reuses the vaulted
      // ballot so the voter can change their selection before it submits.
      const existing = getOfflineBallot(Number(electionId));
      const signed = getSignedVoucher(Number(electionId));
      const voucherRaw = existing?.voucher ?? signed;
      if (!user?.id || !voucherRaw) {
        setError(
          'No offline ballot is available on this device. Reconnect once to download a signed ballot, then it can be captured offline.',
        );
        return;
      }
      const voucher = voucherRaw;
      captureOfflineBallot({
        voterId: user.id,
        electionId: Number(electionId),
        candidateId: selectedCandidateId,
        voucher,
        capturedAt: new Date().toISOString(),
        status: 'captured',
        electionTitle: `Election #${electionId}`,
        candidateName: candidates.find((c) => c.id === selectedCandidateId)?.name,
      });
      setOfflineCaptured({
        electionId: Number(electionId),
        candidateId: selectedCandidateId,
        voucher,
        electionTitle: `Election #${electionId}`,
        candidateName: candidates.find((c) => c.id === selectedCandidateId)?.name,
      });
      return;
    }

    const receipt = await castVote(Number(electionId), selectedCandidateId);
    if (receipt) {
      navigate(`/receipt/${receipt.txHash}`);
    }
  };

  const selectedCandidate = candidates.find((c) => c.id === selectedCandidateId);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-900 to-gray-800">
        <p className="text-gray-400">Loading candidates...</p>
      </div>
    );
  }

  return (
    <PageShell title="Cast Your Vote">
      <div className="mx-auto max-w-4xl">
        <Button variant="secondary" onClick={() => navigate('/elections')} className="mb-6">
          ← Back to Elections
        </Button>

        <Card className="mb-6">
          <h1 className="mb-3 text-2xl font-bold md:text-3xl">Cast Your Vote</h1>
          <p className="text-gray-400">Select a candidate below. Your vote will be recorded on the blockchain.</p>
        </Card>

        {!isOnline && (
          <Card className="mb-6 border border-amber-700 bg-amber-950">
            <p className="text-sm text-amber-200">
              You&apos;re offline. Your vote can still be captured on this device and will submit
              automatically when you reconnect.
            </p>
          </Card>
        )}

        {isPreparingOffline && (
          <Card className="mb-6 border border-blue-800 bg-blue-950">
            <p className="text-sm text-blue-200">Preparing an offline ballot…</p>
          </Card>
        )}

        {offlineCaptured && (
          <Card className="mb-6 border border-green-800 bg-green-950">
            <p className="text-sm text-green-200">
              Your offline ballot has been captured on this device. It is stored securely and will
              be submitted to the VoteChain network when you reconnect.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => {
                removeOfflineBallot(offlineCaptured.electionId);
                setOfflineCaptured(null);
              }}
            >
              Discard capture
            </Button>
          </Card>
        )}

        {error && (
          <Card className="mb-6 border border-red-700 bg-red-900">
            <p className="text-red-200">{error}</p>
          </Card>
        )}

        {voteError && (
          <Card className="mb-6 border border-red-700 bg-red-900">
            <p className="text-red-200">{voteError}</p>
          </Card>
        )}

        <div className="mb-6 space-y-4">
          {candidates.map((candidate) => (
            <CandidateCard
              key={candidate.id}
              candidate={candidate}
              isSelected={selectedCandidateId === candidate.id}
              onSelect={setSelectedCandidateId}
            />
          ))}
        </div>

        <Button
          variant="primary"
          size="lg"
          onClick={() => {
            if (isOnline) {
              setIsModalOpen(true);
            } else {
              void handleVoteConfirm();
            }
          }}
          disabled={!selectedCandidateId}
          className="w-full"
        >
          {!isOnline ? 'Capture Vote' : 'Submit Vote'}
        </Button>

        <VoteConfirmModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          candidate={selectedCandidate || null}
          onConfirm={handleVoteConfirm}
          isSubmitting={isSubmitting}
        />

        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => navigate('/offline')}
            className="text-xs font-medium text-gray-400 hover:text-gray-200"
          >
            View your offline ballots
          </button>
        </div>
      </div>
    </PageShell>
  );
};

export default BallotPage;