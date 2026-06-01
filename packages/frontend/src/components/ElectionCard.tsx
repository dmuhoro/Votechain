import React from 'react';
import { Election } from '../types';
import { formatDate, getCountdown, isElectionActive } from '../lib/utils';
import Card from './ui/Card';
import Button from './ui/Button';

interface ElectionCardProps {
  election: Election;
  onVote?: (electionId: number) => void;
  onViewResults?: (electionId: number) => void;
}

const ElectionCard: React.FC<ElectionCardProps> = ({ election, onVote, onViewResults }) => {
  const active = isElectionActive(election);
  const countdown = getCountdown(election.end_time);

  return (
    <Card className="hover:shadow-xl transition-shadow">
      <div className="mb-4">
        <h3 className="text-xl font-bold mb-2">{election.title}</h3>
        <p className="text-gray-400 text-sm mb-4">{election.description}</p>
        <div className="flex items-center justify-between mb-4">
          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
            active ? 'bg-green-900 text-green-200' : 'bg-gray-700 text-gray-300'
          }`}>
            {active ? 'Active' : 'Inactive'}
          </span>
          <span className="text-sm text-gray-400">Ends in: {countdown}</span>
        </div>
      </div>
      <div className="flex gap-2">
        {active && onVote && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => onVote(election.id)}
            className="flex-1"
          >
            Vote Now
          </Button>
        )}
        {onViewResults && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onViewResults(election.id)}
            className="flex-1"
          >
            Results
          </Button>
        )}
      </div>
    </Card>
  );
};

export default ElectionCard;
