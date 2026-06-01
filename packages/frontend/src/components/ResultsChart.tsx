import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ElectionResult } from '../types';

interface ResultsChartProps {
  results: ElectionResult[];
  isLoading: boolean;
}

const ResultsChart: React.FC<ResultsChartProps> = ({ results, isLoading }) => {
  if (isLoading) {
    return <div className="text-center py-8">Loading results...</div>;
  }

  if (!results || results.length === 0) {
    return <div className="text-center py-8 text-gray-400">No results available yet.</div>;
  }

  const data = results.map((result) => ({
    name: result.name,
    party: result.party,
    votes: result.voteCount,
  }));

  const totalVotes = results.reduce((sum, r) => sum + r.voteCount, 0);

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="name" stroke="#9CA3AF" />
          <YAxis stroke="#9CA3AF" />
          <Tooltip
            contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
            labelStyle={{ color: '#F3F4F6' }}
          />
          <Legend />
          <Bar dataKey="votes" fill="#3B82F6" name="Vote Count" />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-4 text-center text-gray-400">
        Total Votes: <span className="text-white font-bold">{totalVotes}</span>
      </div>
    </div>
  );
};

export default ResultsChart;
