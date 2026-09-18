import { useEffect, useCallback, useState, useRef } from 'react';
import api, { toErrorMessage } from '../lib/api';
import { ElectionResult } from '../types';
import { useNetworkStore } from '../store/networkStore';

const POLL_INTERVAL_MS = 30000;

const REQUEST_WATCHDOG_MS = 20000;

// Controllers whose request was superseded by an unmount / effect re-run.
// Their settled promises must NOT write state or surface errors, but they must
// release the in-flight guard so a fresh request can run.
const superseded = new WeakSet<AbortController>();

export const useResults = (electionId: number | null) => {
  const [results, setResults] = useState<ElectionResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const isOnline = useNetworkStore((s) => s.isOnline);
  const inFlight = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  const fetchResults = useCallback(async () => {
    if (!electionId || inFlight.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    inFlight.current = true;

    // Watchdog: even a "never settling" request must fail so the UI is never
    // stuck in 'Loading'. axios's own timeout (15s) usually fires first.
    const watchdog = setTimeout(() => controller.abort(), REQUEST_WATCHDOG_MS);

    try {
      setIsLoading(true);
      setError(null);
      const response = await api.get(`/api/elections/${electionId}/results`, {
        signal: controller.signal,
        timeout: 15000,
      });
      clearTimeout(watchdog);
      if (!controller.signal.aborted) {
        setResults(response.data);
        setLastUpdated(new Date());
      }
    } catch (err: any) {
      clearTimeout(watchdog);
      // Superseded (unmount / connectivity re-run) requests settle silently.
      if (controller.signal.aborted && superseded.has(controller)) return;
      setError(toErrorMessage(err, 'Failed to fetch results'));
      console.error('Error fetching results:', err);
    } finally {
      // Only the CURRENT request releases the guard; a previously superseded
      // request must not clear the flag of a newer in-flight one.
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        inFlight.current = false;
      }
      if (!controller.signal.aborted && !superseded.has(controller)) {
        setIsLoading(false);
      }
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
      // Supersede + abort any in-flight request so the effect body can start a
      // fresh one on re-run (e.g. offline boot flips isOnline twice at startup).
      if (controllerRef.current) {
        superseded.add(controllerRef.current);
        controllerRef.current.abort();
        controllerRef.current = null;
      }
      inFlight.current = false;
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