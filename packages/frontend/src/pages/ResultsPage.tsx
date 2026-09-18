import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { toErrorMessage } from '../lib/api';
import { useResults } from '../hooks/useResults';
import { useNetworkStore } from '../store/networkStore';
import { Election } from '../types';
import ResultsChart from '../components/ResultsChart';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import PageShell from '../components/PageShell';

const EXPLORER_URL = import.meta.env.VITE_SEPOLIA_EXPLORER as string | undefined;

const ResultsPage: React.FC = () => {
  const { electionId } = useParams<{ electionId: string }>();
  const navigate = useNavigate();
  const isOnline = useNetworkStore((s) => s.isOnline);
  const [election, setElection] = useState<Election | null>(null);
  const [electionError, setElectionError] = useState<string | null>(null);
  const { results, isLoading, lastUpdated, refetch, error } = useResults(electionId ? Number(electionId) : null);

  useEffect(() => {
    let cancelled = false;
    const fetchElection = async () => {
      try {
        const response = await api.get(`/api/elections/${electionId}`);
        if (!cancelled) setElection(response.data);
      } catch (err: any) {
        if (!cancelled) setElectionError(toErrorMessage(err, 'Failed to load election'));
      }
    };

    if (electionId) {
      fetchElection();
    }
    return () => {
      cancelled = true;
    };
  }, [electionId]);

  const getTimeAgo = (date: Date | null): string => {
    if (!date) return 'Never';
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };

  return (
    <PageShell title="Live Results">
      <div className="mx-auto max-w-4xl">
        <Button variant="secondary" onClick={() => navigate('/elections')} className="mb-6">
          ← Back to Elections
        </Button>

        {election && (
          <Card className="mb-6">
            <h1 className="mb-2 text-2xl font-bold md:text-3xl">{election.title}</h1>
            <p className="mb-4 text-gray-400">{election.description}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-400">
              <span>Status: {election.is_active ? '🟢 Active' : '🔴 Closed'}</span>
              <span>Last updated: {getTimeAgo(lastUpdated)}</span>
            </div>
          </Card>
        )}

        {electionError && !election && (
          <Card className="mb-6 border border-red-700 bg-red-900">
            <p className="text-red-200">{electionError}</p>
          </Card>
        )}

        <Card>
          <h2 className="mb-2 text-2xl font-bold">Live Results</h2>
          {!isOnline && (
            <p className="mb-4 text-sm text-amber-300">
              Offline — showing the last synced on-chain results (they may be stale).
            </p>
          )}
          {error ? (
            <div className="py-8 text-center">
              <p className="mb-4 text-red-200">{error}</p>
              <Button variant="secondary" onClick={refetch}>
                Retry
              </Button>
            </div>
          ) : (
            <ResultsChart results={results} isLoading={isLoading} />
          )}
          <div className="mt-6 flex gap-2">
            <Button variant="secondary" onClick={refetch} className="flex-1">
              Refresh Results
            </Button>
            {EXPLORER_URL && (
              <Button
                variant="secondary"
                onClick={() => window.open(EXPLORER_URL, '_blank')}
                className="flex-1"
              >
                View on Etherscan
              </Button>
            )}
          </div>
        </Card>
      </div>
    </PageShell>
  );
};

export default ResultsPage;