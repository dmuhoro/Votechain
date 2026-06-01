import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useVote } from '../hooks/useVote';
import { Candidate } from '../types';
import CandidateCard from '../components/CandidateCard';
import VoteConfirmModal from '../components/VoteConfirmModal';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

const BallotPage: React.FC = () => {
  const { electionId } = useParams<{ electionId: string }>();
  const navigate = useNavigate();
  const { castVote, isSubmitting } = useVote();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCandidates = async () => {
      try {
        const response = await api.get(`/api/elections/${electionId}/candidates`);
        setCandidates(response.data);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to fetch candidates');
      } finally {
        setIsLoading(false);
      }
    };

    if (electionId) {
      fetchCandidates();
    }
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
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center">
        <p className="text-gray-400">Loading candidates...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 py-12">
      <div className="max-w-4xl mx-auto px-4">
        <Button variant="secondary" onClick={() => navigate('/elections')} className="mb-8">
          ← Back to Elections
        </Button>

        <Card className="mb-8">
          <h1 className="text-3xl font-bold mb-4">Cast Your Vote</h1>
          <p className="text-gray-400">Select a candidate below. Your vote will be recorded on the blockchain.</p>
        </Card>

        {error && (
          <Card className="bg-red-900 border border-red-700 mb-8">
            <p className="text-red-200">{error}</p>
          </Card>
        )}

        <div className="space-y-4 mb-8">
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
          disabled={!selectedCandidateId}
          className="w-full"
        >
          Submit Vote
        </Button>

        <VoteConfirmModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          candidate={selectedCandidate || null}
          onConfirm={handleVoteConfirm}
          isSubmitting={isSubmitting}
        />
      </div>
    </div>
  );
};

export default BallotPage;
