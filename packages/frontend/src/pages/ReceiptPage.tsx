import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { toErrorMessage } from '../lib/api';
import { VoteReceipt } from '../types';
import TxHashBadge from '../components/TxHashBadge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import PageShell from '../components/PageShell';

const ReceiptPage: React.FC = () => {
  const { txHash } = useParams<{ txHash: string }>();
  const navigate = useNavigate();
  const [receipt, setReceipt] = useState<VoteReceipt | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchReceipt = async () => {
      try {
        if (!txHash) throw new Error('No transaction hash provided');
        const response = await api.get(`/api/votes/receipt/${txHash}`);
        if (!cancelled) setReceipt(response.data);
      } catch (err: any) {
        if (!cancelled) setError(toErrorMessage(err, 'Failed to fetch vote receipt'));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    if (txHash) {
      fetchReceipt();
    }
    return () => {
      cancelled = true;
    };
  }, [txHash]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-900 to-gray-800">
        <p className="text-gray-400">Loading receipt...</p>
      </div>
    );
  }

  if (error) {
    return (
      <PageShell title="Vote Receipt">
        <div className="mx-auto max-w-2xl">
          <Card className="border border-red-700 bg-red-900">
            <p className="mb-4 text-red-200">{error}</p>
            <Button variant="secondary" onClick={() => navigate('/elections')}>
              Back to Elections
            </Button>
          </Card>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Vote Confirmed">
      <div className="mx-auto max-w-2xl">
        <Card className="mb-6 border border-green-700 bg-green-900 text-center">
          <div className="mb-4 text-4xl">✓</div>
          <h1 className="mb-2 text-2xl font-bold text-green-200 md:text-3xl">Vote Confirmed</h1>
          <p className="text-green-300">Your vote has been permanently recorded on the blockchain.</p>
        </Card>

        {receipt && (
          <Card className="space-y-6">
            <div>
              <h2 className="text-xl font-bold mb-4">Receipt Details</h2>
              <div className="space-y-4">
                <div className="bg-gray-700 rounded-lg p-4">
                  <p className="text-gray-400 text-sm mb-1">Election</p>
                  <p className="text-lg font-semibold">{receipt.electionTitle}</p>
                </div>

                <div className="bg-gray-700 rounded-lg p-4">
                  <p className="text-gray-400 text-sm mb-1">You Voted For</p>
                  <p className="text-lg font-semibold">{receipt.candidateVotedFor}</p>
                  <p className="text-gray-400 text-sm">{receipt.candidateParty}</p>
                </div>

                <div className="bg-gray-700 rounded-lg p-4">
                  <p className="text-gray-400 text-sm mb-2">Transaction Hash</p>
                  <TxHashBadge txHash={receipt.txHash} explorerUrl={receipt.explorerUrl} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-700 rounded-lg p-4">
                    <p className="text-gray-400 text-sm mb-1">Block Number</p>
                    <p className="text-lg font-semibold">{receipt.blockNumber}</p>
                  </div>
                  <div className="bg-gray-700 rounded-lg p-4">
                    <p className="text-gray-400 text-sm mb-1">Timestamp</p>
                    <p className="text-lg font-semibold">{receipt.timestamp ? new Date(receipt.timestamp).toLocaleString() : 'N/A'}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-700 pt-6">
              <p className="mb-4 text-sm text-gray-400">
                Your vote is now part of the immutable blockchain record. Anyone can verify it using the transaction hash above.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  onClick={() => window.open(receipt.explorerUrl, '_blank')}
                  className="flex-1"
                >
                  View on Etherscan
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => navigate('/elections')}
                  className="flex-1"
                >
                  Back to Elections
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </PageShell>
  );
};

export default ReceiptPage;
