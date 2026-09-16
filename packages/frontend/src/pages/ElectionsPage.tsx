import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useElection } from '../hooks/useElection';
import ElectionCard from '../components/ElectionCard';
import Button from '../components/ui/Button';

const ElectionsPage: React.FC = () => {
  const navigate = useNavigate();
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
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 py-12">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold">Elections</h1>
          <Button variant="secondary" onClick={() => navigate('/')}>
            Home
          </Button>
        </div>

        {/* Filter Buttons */}
        <div className="flex gap-2 mb-8 flex-wrap">
          {(['all', 'active', 'upcoming', 'closed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Elections Grid */}
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg">Loading elections...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-200 text-lg mb-4">{error}</p>
            <Button variant="secondary" onClick={fetchElections}>
              Retry
            </Button>
          </div>
        ) : filteredElections.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg">No elections found in this category.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
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
      </div>
    </div>
  );
};

export default ElectionsPage;
