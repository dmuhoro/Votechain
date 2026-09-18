import { useEffect, useCallback, useRef } from 'react';
import api, { toErrorMessage } from '../lib/api';
import { useElectionStore } from '../store/electionStore';
import { useNetworkStore } from '../store/networkStore';

export const useElection = () => {
  const {
    elections,
    selectedElection,
    isLoading,
    error,
    setElections,
    setSelectedElection,
    setIsLoading,
    setError,
  } = useElectionStore();

  const isOnline = useNetworkStore((s) => s.isOnline);
  const inFlight = useRef(false);

  const fetchElections = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      setIsLoading(true);
      setError(null);
      const response = await api.get('/api/elections');
      setElections(response.data);
    } catch (err: any) {
      setError(toErrorMessage(err, 'Failed to load elections'));
    } finally {
      setIsLoading(false);
      inFlight.current = false;
    }
  }, [setElections, setIsLoading, setError]);

  const fetchElectionById = useCallback(async (id: number) => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await api.get(`/api/elections/${id}`);
      setSelectedElection(response.data);
    } catch (err: any) {
      setError(toErrorMessage(err, 'Failed to load election'));
    } finally {
      setIsLoading(false);
    }
  }, [setSelectedElection, setIsLoading, setError]);

  useEffect(() => {
    fetchElections();
  }, [fetchElections]);

  // The moment connectivity returns, refresh so cached/offline data is replaced
  // with live on-chain backed data without a manual refresh.
  useEffect(() => {
    if (isOnline) {
      fetchElections();
    }
  }, [isOnline, fetchElections]);

  return {
    elections,
    selectedElection,
    isLoading,
    error,
    fetchElections,
    fetchElectionById,
  };
};
