import { useState } from 'react';
import api from '../lib/api';
import { VoteReceipt } from '../types';

export const useVote = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const castVote = async (electionId: number, candidateId: number): Promise<VoteReceipt | null> => {
    try {
      setIsSubmitting(true);
      setError(null);
      const response = await api.post('/api/votes/cast', {
        electionId,
        candidateId,
      });
      return response.data;
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to cast vote';
      setError(errorMessage);
      console.error('Error casting vote:', err);
      return null;
    } finally {
      setIsSubmitting(false);
    }
  };

  const getVoteReceipt = async (txHash: string): Promise<VoteReceipt | null> => {
    try {
      const response = await api.get(`/api/votes/receipt/${txHash}`);
      return response.data;
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to fetch vote receipt';
      setError(errorMessage);
      console.error('Error fetching vote receipt:', err);
      return null;
    }
  };

  return {
    castVote,
    getVoteReceipt,
    isSubmitting,
    error,
  };
};
