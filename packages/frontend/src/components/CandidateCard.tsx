import React from 'react';
import { Candidate } from '../types';
import Card from './ui/Card';

interface CandidateCardProps {
  candidate: Candidate;
  isSelected: boolean;
  onSelect: (candidateId: number) => void;
}

const CandidateCard: React.FC<CandidateCardProps> = ({ candidate, isSelected, onSelect }) => {
  return (
    <Card
      onClick={() => onSelect(candidate.id)}
      className={`cursor-pointer transition-all ${
        isSelected ? 'ring-2 ring-blue-500 bg-gray-700' : 'hover:bg-gray-700'
      }`}
    >
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
          {candidate.name.charAt(0)}
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-bold">{candidate.name}</h3>
          <p className="text-gray-400 text-sm">{candidate.party || 'Independent'}</p>
        </div>
        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
          isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-500'
        }`}>
          {isSelected && <span className="text-white text-sm">✓</span>}
        </div>
      </div>
    </Card>
  );
};

export default CandidateCard;
