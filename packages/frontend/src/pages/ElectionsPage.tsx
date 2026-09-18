import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useElection } from '../hooks/useElection';
import { useNetworkStore } from '../store/networkStore';
import ElectionCard from '../components/ElectionCard';
import Button from '../components/ui/Button';
import PageShell from '../components/PageShell';

const ElectionsPage: React.FC = () => {
  const navigate = useNavigate();
  const isOnline = useNetworkStore((s) => s.isOnline);
  const { elections, isLoading, error, fetchElections } = useElection();
  const [filter, setFilter] = useState<'all' | 'active' | 'upcoming' | 'closed'>('all');

  const now = new Date();
  const filteredElections = elections.filter((election) => {
    const start = new Date(election.start_time);
    const end = new Date(election.end_time);

    switch (filter) {
      case 'active':
        return now >= start && now <= end;
      case 'upcoming':
        return now < start;
      case 'closed':
        return now > end;
      default:
        return true;
    }
  });

  return (
    <PageShell title="Elections">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold md:text-4xl">Elections</h1>
        <Button variant="secondary" onClick={() => navigate('/')} className="hidden md:inline-flex">
          Home
        </Button>
      </div>

      {/* Filter Buttons */}
      <div className="mb-8 flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Election filters">
        {(['all', 'active', 'upcoming', 'closed'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            role="tab"
            aria-selected={filter === f}
            className={`shrink-0 rounded-lg px-4 py-2 font-semibold transition-colors ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Offline cached-data strip */}
      {!isOnline && elections.length > 0 && (
        <div className="mb-6 rounded-lg border border-amber-700 bg-amber-950 px-4 py-3 text-sm text-amber-200">
          These elections are from your saved cache. Data refreshes automatically when you&apos;re
          back online.
        </div>
      )}

      {/* Elections Grid */}
      {isLoading ? (
        <div className="py-12 text-center">
          <p className="text-lg text-gray-400">
            {!isOnline ? 'Showing saved elections…' : 'Loading elections...'}
          </p>
        </div>
      ) : error ? (
        <div className="py-12 text-center">
          <p className="mb-4 text-lg text-red-200">{error}</p>
          <Button variant="secondary" onClick={fetchElections}>
            Retry
          </Button>
        </div>
      ) : filteredElections.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-lg text-gray-400">No elections found in this category.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredElections.map((election) => (
            <ElectionCard
              key={election.id}
              election={election}
              onVote={(id) => navigate(`/ballot/${id}`)}
              onViewResults={(id) => navigate(`/results/${id}`)}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
};

export default ElectionsPage;
