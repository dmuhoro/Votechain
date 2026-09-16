import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { VoteReceipt } from '../types';
import TxHashBadge from '../components/TxHashBadge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

const ReceiptPage: React.FC = () => {
  const { txHash } = useParams<{ txHash: string }>();
  const navigate = useNavigate();
  const [receipt, setReceipt] = useState<VoteReceipt | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReceipt = async () => {
      try {
        if (!txHash) throw new Error('No transaction hash provided');
        const response = await api.get(`/api/votes/receipt/${txHash}`);
        setReceipt(response.data);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to fetch vote receipt');
      } finally {
        setIsLoading(false);
      }
    };

    if (txHash) {
      fetchReceipt();
    }
  }, [txHash]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center">
        <p className="text-gray-400">Loading receipt...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 py-12">
        <div className="max-w-2xl mx-auto px-4">
          <Card className="bg-red-900 border border-red-700">
            <p className="text-red-200 mb-4">{error}</p>
            <Button variant="secondary" onClick={() => navigate('/elections')}>
              Back to Elections
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 py-12">
      <div className="max-w-2xl mx-auto px-4">
        <Card className="text-center mb-8 bg-green-900 border border-green-700">
          <div className="text-4xl mb-4">✓</div>
          <h1 className="text-3xl font-bold text-green-200 mb-2">Vote Confirmed</h1>
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
              <p className="text-gray-400 text-sm mb-4">
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
    </div>
  );
};

export default ReceiptPage;
