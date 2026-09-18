import React from 'react';
import { useNetworkStore } from '../store/networkStore';

/**
 * Global offline indicator. Shown whenever the browser reports no
 * connectivity: the app remains fully usable for cached data, but anything
 * that must hit the network (vote cast, auth) will fail fast with a clear
 * message instead of hanging or silently dropping.
 */
const OfflineBanner: React.FC = () => {
  const isOnline = useNetworkStore((s) => s.isOnline);

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 border-b border-amber-700/50 bg-amber-950/95 px-4 py-2 text-center text-sm text-amber-200 backdrop-blur"
    >
      You&apos;re offline — showing the last synced data. Reconnect to cast a vote.
    </div>
  );
};

export default OfflineBanner;