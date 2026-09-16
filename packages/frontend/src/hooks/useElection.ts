import { useEffect, useCallback } from 'react';
import api from '../lib/api';
import { useElectionStore } from '../store/electionStore';

export const useElection = () => {
  const { elections, selectedElection, setElections, setSelectedElection, setIsLoading } = useElectionStore();

  const fetchElections = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/api/elections');
      setElections(response.data);
    } catch (error) {
      console.error('Error fetching elections:', error);
    } finally {
      setIsLoading(false);
    }
  }, [setElections, setIsLoading]);

  const fetchElectionById = useCallback(async (id: number) => {
    try {
      setIsLoading(true);
      const response = await api.get(`/api/elections/${id}`);
      setSelectedElection(response.data);
    } catch (error) {
      console.error('Error fetching election:', error);
    } finally {
      setIsLoading(false);
    }
  }, [setSelectedElection, setIsLoading]);

  useEffect(() => {
    fetchElections();
  }, [fetchElections]);

  return {
    elections,
    selectedElection,
    fetchElections,
    fetchElectionById,
  };
};
