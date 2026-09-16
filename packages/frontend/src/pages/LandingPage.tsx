import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import api from '../lib/api';
import { ElectionStats } from '../types';

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<ElectionStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadStats = async () => {
      try {
        const { data } = await api.get<ElectionStats>('/api/stats');
        if (!cancelled) setStats(data);
      } catch {
        if (!cancelled) setStatsError(true);
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    };
    loadStats();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800">
      {/* Hero Section */}
      <div className="max-w-6xl mx-auto px-4 py-20 text-center">
        <h1 className="text-5xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-green-400 bg-clip-text text-transparent">
          Vote. Verify. Trust.
        </h1>
        <p className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
          VoteChain brings transparency and integrity to elections through blockchain technology. Every vote is recorded, verified, and tamper-proof.
        </p>
        <div className="flex gap-4 justify-center">
          <Button variant="primary" size="lg" onClick={() => navigate('/login')}>
            Get Started
          </Button>
          <Button variant="secondary" size="lg" onClick={() => navigate('/elections')}>
            Browse Elections
          </Button>
        </div>
      </div>

      {/* How It Works */}
      <div className="max-w-6xl mx-auto px-4 py-20">
        <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
        <div className="grid md:grid-cols-3 gap-8">
          <Card>
            <div className="text-4xl mb-4">📋</div>
            <h3 className="text-xl font-bold mb-2">Register</h3>
            <p className="text-gray-400">Create your account and verify your identity securely.</p>
          </Card>
          <Card>
            <div className="text-4xl mb-4">🗳️</div>
            <h3 className="text-xl font-bold mb-2">Vote</h3>
            <p className="text-gray-400">Cast your vote gas-free. Your choice is recorded on the blockchain.</p>
          </Card>
          <Card>
            <div className="text-4xl mb-4">✓</div>
            <h3 className="text-xl font-bold mb-2">Verify</h3>
            <p className="text-gray-400">View your transaction on Etherscan. Your vote is permanent and auditable.</p>
          </Card>
        </div>
      </div>

      {/* Technology Section */}
      <div className="max-w-6xl mx-auto px-4 py-20">
        <h2 className="text-3xl font-bold text-center mb-12">Powered by Blockchain</h2>
        <Card className="text-center">
          <div className="space-y-4">
            <p className="text-lg text-gray-300">
              VoteChain leverages Ethereum's Sepolia testnet to ensure every vote is:
            </p>
            <div className="grid md:grid-cols-3 gap-4 mt-8">
              <div>
                <h4 className="font-bold mb-2">Transparent</h4>
                <p className="text-gray-400 text-sm">All votes are publicly auditable on the blockchain.</p>
              </div>
              <div>
                <h4 className="font-bold mb-2">Tamper-Proof</h4>
                <p className="text-gray-400 text-sm">Cryptographic security prevents vote manipulation.</p>
              </div>
              <div>
                <h4 className="font-bold mb-2">Trustless</h4>
                <p className="text-gray-400 text-sm">No central authority needed. Smart contracts enforce rules.</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Stats Section */}
      <div className="max-w-6xl mx-auto px-4 py-20">
        {statsLoading ? (
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div className="animate-pulse"><div className="text-4xl font-bold text-blue-400 mb-2">…</div><p className="text-gray-400">Active Elections</p></div>
            <div className="animate-pulse"><div className="text-4xl font-bold text-green-400 mb-2">…</div><p className="text-gray-400">Total Votes Cast</p></div>
            <div className="animate-pulse"><div className="text-4xl font-bold text-purple-400 mb-2">…</div><p className="text-gray-400">Registered Voters</p></div>
          </div>
        ) : statsError ? (
          <div className="text-center text-gray-400">
            <p>Live stats are temporarily unavailable.</p>
            <p className="text-sm mt-1">Vote records remain auditable on-chain regardless.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold text-blue-400 mb-2">{stats?.activeElections ?? 0}</div>
              <p className="text-gray-400">Active Elections</p>
            </div>
            <div>
              <div className="text-4xl font-bold text-green-400 mb-2">{stats?.totalVotes ?? 0}</div>
              <p className="text-gray-400">Total Votes Cast</p>
            </div>
            <div>
              <div className="text-4xl font-bold text-purple-400 mb-2">{stats?.registeredVoters ?? 0}</div>
              <p className="text-gray-400">Registered Voters</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-700 py-8 text-center text-gray-400">
        <p>VoteChain © 2026 | Transparent. Tamper-proof. Trustless.</p>
      </div>
    </div>
  );
};

export default LandingPage;