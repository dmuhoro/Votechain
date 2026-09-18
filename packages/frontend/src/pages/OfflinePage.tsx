import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageShell from '../components/PageShell';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { useNetworkStore } from '../store/networkStore';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { listBallots } from '../lib/offlineBallots';
import type { CapturedOfflineBallot } from '../lib/offlineBallots';

const statusLabel: Record<CapturedOfflineBallot['status'], string> = {
  captured: 'Captured — will submit when connected',
  submitted: 'Submitted on-chain',
  rejected: 'Rejected — not counted',
};

const statusBadge = (status: CapturedOfflineBallot['status']) => {
  const classes = {
    captured: 'border-amber-700 bg-amber-950 text-amber-200',
    submitted: 'border-green-700 bg-green-950 text-green-200',
    rejected: 'border-red-700 bg-red-950 text-red-200',
  }[status];
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${classes}`}>
      {statusLabel[status]}
    </span>
  );
};

const OfflinePage: React.FC = () => {
  const navigate = useNavigate();
  const isOnline = useNetworkStore((s) => s.isOnline);
  const { status, lastMessage, syncNow } = useOfflineSync();
  const [ballots, setBallots] = useState<CapturedOfflineBallot[]>(() => listBallots());

  useEffect(() => {
    const refresh = () => setBallots(listBallots());
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  const handleSync = async () => {
    await syncNow();
    setBallots(listBallots());
  };

  const pendingCount = ballots.filter((b) => b.status === 'captured').length;

  return (
    <PageShell title="Offline Ballots">
      <div className="mx-auto max-w-3xl">
        <Card className="mb-6">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-bold md:text-3xl">Offline Ballots</h1>
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${
                isOnline
                  ? 'border-green-700 bg-green-950 text-green-200'
                  : 'border-amber-700 bg-amber-950 text-amber-200'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-green-400' : 'bg-amber-400'}`} />
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
          <p className="text-sm text-gray-400">
            Votes captured while offline are stored securely on this device and submitted
            automatically the next time you connect. {''}
            <span className="text-gray-300 font-medium">A captured ballot is not counted</span> until
            the server accepts it on-chain.
          </p>
        </Card>

        {lastMessage && (
          <Card className="mb-6 border border-blue-800 bg-blue-950">
            <p className="text-sm text-blue-200">{lastMessage}</p>
          </Card>
        )}

        <div className="mb-6 flex items-center justify-between gap-3">
          <p className="text-sm text-gray-400">
            {pendingCount === 0
              ? 'No ballots waiting to submit.'
              : `${pendingCount} ballot${pendingCount === 1 ? '' : 's'} waiting to submit.`}
          </p>
          <Button
            variant="primary"
            onClick={handleSync}
            disabled={!isOnline || pendingCount === 0 || status === 'syncing'}
          >
            {status === 'syncing' ? 'Syncing…' : 'Sync now'}
          </Button>
        </div>

        {ballots.length === 0 ? (
          <Card className="mb-6">
            <p className="text-gray-400">
              No offline ballots yet. Open an election while online and a signed ballot will be
              prepared; if the network drops, your vote is captured here instead.
            </p>
          </Card>
        ) : (
          <div className="mb-6 space-y-3">
            {ballots.map((ballot) => (
              <Card key={ballot.electionId}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-gray-100">
                      {ballot.electionTitle ?? `Election #${ballot.electionId}`}
                    </p>
                    <p className="text-sm text-gray-400">
                      {ballot.candidateName ?? `Candidate #${ballot.candidateId}`} · captured{' '}
                      {new Date(ballot.capturedAt).toLocaleString()}
                    </p>
                  </div>
                  {statusBadge(ballot.status)}
                </div>
                {ballot.status === 'rejected' && ballot.reason && (
                  <p className="mt-2 text-sm text-red-300">{ballot.reason}</p>
                )}
                {ballot.status === 'submitted' && ballot.txHash && (
                  <p className="mt-2 break-all text-sm text-gray-400">tx: {ballot.txHash}</p>
                )}
              </Card>
            ))}
          </div>
        )}

        <Button variant="secondary" onClick={() => navigate('/elections')} className="w-full">
          ← Back to Elections
        </Button>
      </div>
    </PageShell>
  );
};

export default OfflinePage;