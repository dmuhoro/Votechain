import React from 'react';
import { truncateAddress } from '../lib/utils';

interface TxHashBadgeProps {
  txHash: string;
  explorerUrl: string;
}

const TxHashBadge: React.FC<TxHashBadgeProps> = ({ txHash, explorerUrl }) => {
  return (
    <a
      href={explorerUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-900 text-blue-200 rounded-lg hover:bg-blue-800 transition-colors"
    >
      <span className="text-sm font-mono">{truncateAddress(txHash)}</span>
      <span className="text-xs">↗</span>
    </a>
  );
};

export default TxHashBadge;
