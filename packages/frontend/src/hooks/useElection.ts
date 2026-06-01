import { useEffect } from 'react';
import api from '../lib/api';
import { useElectionStore } from '../store/electionStore';
import { Election } from '../types';

export const useElection = () => {
  const { elections, selectedElection, setElections, setSelectedElection, setIsLoading } = useElectionStore();

  const fetchElections = async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/api/elections');
      setElections(response.data);
    } catch (error) {
      console.error('Error fetching elections:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchElectionById = async (id: number) => {
    try {
      setIsLoading(true);
      const response = await api.get(`/api/elections/${id}`);
      setSelectedElection(response.data);
    } catch (error) {
      console.error('Error fetching election:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchElections();
  }, []);

  return {
    elections,
    selectedElection,
    fetchElections,
    fetchElectionById,
  };
};
