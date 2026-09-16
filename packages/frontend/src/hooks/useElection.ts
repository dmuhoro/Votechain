import { useEffect, useCallback } from 'react';
import api from '../lib/api';
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
      const msg = err.response?.data?.message || 'Failed to load elections';
      setError(msg);
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
      const msg = err.response?.data?.message || 'Failed to load election';
      setError(msg);
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
