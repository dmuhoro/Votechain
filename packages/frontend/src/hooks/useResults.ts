import { useEffect, useCallback, useState } from 'react';
import api from '../lib/api';
import { ElectionResult } from '../types';

export const useResults = (electionId: number | null) => {
  const [results, setResults] = useState<ElectionResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchResults = useCallback(async () => {
    if (!electionId) return;
    try {
      setIsLoading(true);
      setError(null);
      const response = await api.get(`/api/elections/${electionId}/results`);
      setResults(response.data);
      setLastUpdated(new Date());
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to fetch results';
      setError(errorMessage);
      console.error('Error fetching results:', err);
    } finally {
      setIsLoading(false);
    }
  }, [electionId, setIsLoading, setError, setResults, setLastUpdated]);

  useEffect(() => {
    fetchResults();
    const interval = setInterval(fetchResults, 30000);
    return () => clearInterval(interval);
  }, [fetchResults]);

  return {
    results,
    isLoading,
    error,
    lastUpdated,
    refetch: fetchResults,
  };
};
