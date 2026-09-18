import { useRef, useState } from 'react';
import api, { toErrorMessage, isApiError } from '../lib/api';
import { VoteReceipt } from '../types';
import { useNetworkStore } from '../store/networkStore';

export const useVote = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // In-flight guard: even two rapid taps on Confirm before React re-renders
  // cannot fire a second /votes/cast. The backend nullifier still blocks a
  // replay, but this prevents the wasted second transaction + API call.
  // (Constitution Article II double-vote invariant; defense in depth.)
  const isSubmittingRef = useRef(false);

  const castVote = async (electionId: number, candidateId: number): Promise<VoteReceipt | null> => {
    if (isSubmittingRef.current) {
      return null;
    }

    // Fail fast when the browser already knows we are offline. The nullifier +
    // chain vote path cannot run without connectivity; a queued "offline vote"
    // would be a silent drop (Constitution Article I.6). No silent drops.
    if (!useNetworkStore.getState().isOnline) {
      setError('You are offline. Reconnect to cast your vote.');
      return null;
    }

    isSubmittingRef.current = true;
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
      isSubmittingRef.current = false;
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
