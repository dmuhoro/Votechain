import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ElectionResult } from '../types';

interface ResultsChartProps {
  results: ElectionResult[];
  isLoading: boolean;
}

const useIsMobile = (): boolean => {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768,
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return isMobile;
};

const ResultsChart: React.FC<ResultsChartProps> = ({ results, isLoading }) => {
  const isMobile = useIsMobile();

  if (isLoading) {
    return <div className="py-8 text-center">Loading results...</div>;
  }

  if (!results || results.length === 0) {
    return <div className="py-8 text-center text-gray-400">No results available yet.</div>;
  }

  const data = results.map((result) => ({
    name: result.name,
    party: result.party,
    votes: result.voteCount,
  }));

  const totalVotes = results.reduce((sum, r) => sum + r.voteCount, 0);

  return (
    <div className="w-full">
      <div className={isMobile ? 'h-64' : 'h-96'}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={isMobile ? { bottom: 32 } : undefined}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="name"
              stroke="#9CA3AF"
              interval={0}
              angle={isMobile ? -35 : undefined}
              textAnchor={isMobile ? 'end' : undefined}
              height={isMobile ? 60 : undefined}
            />
            <YAxis stroke="#9CA3AF" allowDecimals={false} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
              labelStyle={{ color: '#F3F4F6' }}
            />
            <Legend />
            <Bar dataKey="votes" fill="#3B82F6" name="Vote Count" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {isMobile && (
        <div className="mt-4 overflow-hidden rounded-lg border border-gray-700">
          <table className="w-full text-sm" aria-label="Results table">
            <thead>
              <tr className="bg-gray-700 text-left text-gray-300">
                <th className="px-3 py-2 font-medium">Candidate</th>
                <th className="px-3 py-2 text-right font-medium">Votes</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.name} className="border-t border-gray-700">
                  <td className="px-3 py-2 text-gray-200">
                    {row.name}
                    <span className="text-xs text-gray-400"> · {row.party}</span>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-white">{row.votes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 text-center text-gray-400">
        Total Votes: <span className="font-bold text-white">{totalVotes}</span>
      </div>
    </div>
  );
};

export default ResultsChart;