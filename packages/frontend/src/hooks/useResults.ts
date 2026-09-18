import { useEffect, useCallback, useState, useRef } from 'react';
import api, { toErrorMessage } from '../lib/api';
import { ElectionResult } from '../types';
import { useNetworkStore } from '../store/networkStore';

const POLL_INTERVAL_MS = 30000;

export const useResults = (electionId: number | null) => {
  const [results, setResults] = useState<ElectionResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const isOnline = useNetworkStore((s) => s.isOnline);
  const inFlight = useRef(false);
  const abortedRef = useRef(false);

  const fetchResults = useCallback(async () => {
    if (!electionId || inFlight.current) return;
    inFlight.current = true;
    const controller = new AbortController();
    abortedRef.current = false;
    try {
      setIsLoading(true);
      setError(null);
      const response = await api.get(`/api/elections/${electionId}/results`, {
        signal: controller.signal,
        timeout: 15000,
      });
      if (!abortedRef.current) {
        setResults(response.data);
        setLastUpdated(new Date());
      }
    } catch (err: any) {
      if (abortedRef.current) return;
      setError(toErrorMessage(err, 'Failed to fetch results'));
      console.error('Error fetching results:', err);
    } finally {
      inFlight.current = false;
      if (!abortedRef.current) setIsLoading(false);
    }
  }, [electionId]);

  // Resume polling as soon as the tab regains focus or the network returns.
  useEffect(() => {
    if (isOnline) {
      fetchResults();
    }
  }, [isOnline, fetchResults]);

  useEffect(() => {
    fetchResults();

    const tick = () => {
      // Never poll while hidden or offline: no background battery/bandwidth
      // burn and no hang-on-flaky-network spam.
      if (document.hidden || !isOnline) return;
      fetchResults();
    };

    const interval = setInterval(tick, POLL_INTERVAL_MS);

    const onVisibility = () => {
      if (!document.hidden && isOnline) fetchResults();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      abortedRef.current = true;
    };
  }, [fetchResults, isOnline]);

  return {
    results,
    isLoading,
    error,
    lastUpdated,
    refetch: fetchResults,
  };
};