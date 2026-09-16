import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useResults } from '../hooks/useResults';
import { Election } from '../types';
import ResultsChart from '../components/ResultsChart';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

const ResultsPage: React.FC = () => {
  const { electionId } = useParams<{ electionId: string }>();
  const navigate = useNavigate();
  const [election, setElection] = useState<Election | null>(null);
  const { results, isLoading, lastUpdated, refetch, error } = useResults(electionId ? Number(electionId) : null);

  useEffect(() => {
    const fetchElection = async () => {
      try {
        const response = await api.get(`/api/elections/${electionId}`);
        setElection(response.data);
      } catch (error) {
        console.error('Error fetching election:', error);
      }
    };

    if (electionId) {
      fetchElection();
    }
  }, [electionId]);

  const getTimeAgo = (date: Date | null): string => {
    if (!date) return 'Never';
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 py-12">
      <div className="max-w-6xl mx-auto px-4">
        <Button variant="secondary" onClick={() => navigate('/elections')} className="mb-8">
          ← Back to Elections
        </Button>

        {election && (
          <Card className="mb-8">
            <h1 className="text-3xl font-bold mb-2">{election.title}</h1>
            <p className="text-gray-400 mb-4">{election.description}</p>
            <div className="flex gap-4 text-sm text-gray-400">
              <span>Status: {election.is_active ? '🟢 Active' : '🔴 Closed'}</span>
              <span>Last updated: {getTimeAgo(lastUpdated)}</span>
            </div>
          </Card>
        )}

        <Card>
          <h2 className="text-2xl font-bold mb-6">Live Results</h2>
          {error ? (
            <div className="text-center py-8">
              <p className="text-red-200 mb-4">{error}</p>
              <Button variant="secondary" onClick={refetch}>
                Retry
              </Button>
            </div>
          ) : (
            <ResultsChart results={results} isLoading={isLoading} />
          )}
          <div className="mt-8 flex gap-2">
            <Button variant="secondary" onClick={refetch} className="flex-1">
              Refresh Results
            </Button>
            {election && (
              <Button
                variant="secondary"
                onClick={() => window.open(`${import.meta.env.VITE_SEPOLIA_EXPLORER}`, '_blank')}
                className="flex-1"
              >
                View on Etherscan
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ResultsPage;
