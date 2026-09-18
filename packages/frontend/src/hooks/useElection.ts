import { useEffect, useCallback } from 'react';
import api, { toErrorMessage } from '../lib/api';
import { useElectionStore } from '../store/electionStore';

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

  const fetchElections = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await api.get('/api/elections');
      setElections(response.data);
    } catch (err: any) {
      setError(toErrorMessage(err, 'Failed to load elections'));
    } finally {
      setIsLoading(false);
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

  return {
    elections,
    selectedElection,
    isLoading,
    error,
    fetchElections,
    fetchElectionById,
  };
};
