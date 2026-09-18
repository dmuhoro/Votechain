import { useState } from 'react';
import api, { toErrorMessage, isApiError } from '../lib/api';
import { VoteReceipt } from '../types';
import { useNetworkStore } from '../store/networkStore';

export const useVote = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const castVote = async (electionId: number, candidateId: number): Promise<VoteReceipt | null> => {
    // Fail fast when the browser already knows we are offline. The nullifier +
    // chain vote path cannot run without connectivity; a queued "offline vote"
    // would be a silent drop (Constitution Article I.6). No silent drops.
    if (!useNetworkStore.getState().isOnline) {
      setError('You are offline. Reconnect to cast your vote.');
      return null;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      const response = await api.post('/api/votes/cast', {
        electionId,
        candidateId,
      });
      return response.data;
    } catch (err: any) {
      const errorMessage = isApiError(err)
        ? err.serverMessage ?? err.message
        : toErrorMessage(err, 'Failed to cast vote');
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
      setError(toErrorMessage(err, 'Failed to fetch vote receipt'));
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
