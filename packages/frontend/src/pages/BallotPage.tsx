import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { toErrorMessage } from '../lib/api';
import { useVote } from '../hooks/useVote';
import { useNetworkStore } from '../store/networkStore';
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
  const { castVote, isSubmitting, error: voteError } = useVote();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const handleVoteConfirm = async () => {
    if (!electionId || !selectedCandidateId) return;

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
              You&apos;re offline — you can review the ballot, but casting requires a connection.
            </p>
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
          onClick={() => setIsModalOpen(true)}
          disabled={!selectedCandidateId || !isOnline}
          className="w-full"
        >
          {!isOnline ? 'Reconnect to vote' : 'Submit Vote'}
        </Button>

        <VoteConfirmModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          candidate={selectedCandidate || null}
          onConfirm={handleVoteConfirm}
          isSubmitting={isSubmitting}
        />
      </div>
    </PageShell>
  );
};

export default BallotPage;
