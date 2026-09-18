import { useCallback, useEffect, useState } from 'react';
import api, { isApiError } from '../lib/api';
import { useNetworkStore } from '../store/networkStore';
import {
  listCapturedBallots,
  updateBallotStatus,
} from '../lib/offlineBallots';
import type { SignedVoucher } from '../lib/offlineBallots';

export interface CapturedInput {
  electionId: number;
  candidateId: number;
  voucher: SignedVoucher;
  electionTitle?: string;
  candidateName?: string;
}

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

// Module-level: both the global manager (App) and the /offline page mount this
// hook. The lock guarantees only ONE submission pass at a time — two parallel
// submit calls would let one consume the voucher and the other race into
// 'duplicate' rejected for a vote that actually counted (Article I.1).
let syncLock = false;

/**
 * Offline ballot sync (ADR-008). Captured ballots are submitted through the
 * SAME server path as an online vote (POST /api/offline/ballots/submit →
 * voteService.castVote → relayer → chain). Sync runs automatically when the
 * device comes back online, on mount when already online, and on demand.
 */
export const useOfflineSync = () => {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [lastMessage, setLastMessage] = useState<string | null>(null);

  const syncNow = useCallback(async (): Promise<string | null> => {
    if (syncLock) return null;
    const pending = listCapturedBallots();
    if (pending.length === 0) {
      setStatus('idle');
      setLastMessage('No offline ballots waiting to submit.');
      return null;
    }

    syncLock = true;
    setStatus('syncing');
    let message: string | null = null;
    try {
      for (const ballot of pending) {
        try {
          const response = await api.post('/api/offline/ballots/submit', {
            voucher: ballot.voucher,
            candidateId: ballot.candidateId,
          });
          updateBallotStatus(ballot.electionId, 'submitted', {
            txHash: response.data?.txHash,
          });
          message = `Ballot ${ballot.electionId} submitted on-chain.`;
        } catch (err: unknown) {
          const http = isApiError(err)
            ? err.status ?? 0
            : 0;
          const reason =
            err && typeof err === 'object' && 'serverMessage' in err
              ? String((err as { serverMessage?: unknown }).serverMessage ?? '')
              : '';
          if (http === 409 || http === 400) {
            updateBallotStatus(ballot.electionId, 'rejected', {
              reason: reason || 'rejected-by-server',
            });
            message = `Ballot ${ballot.electionId} rejected by server (${reason || 'duplicate'}).`;
          } else {
            message = `Ballot ${ballot.electionId} could not be submitted yet. It stays captured.`;
          }
        }
      }
      setStatus('success');
      setLastMessage(message ?? 'Offline ballots synced.');
      return message;
    } catch (err: unknown) {
      setStatus('error');
      setLastMessage(err instanceof Error ? err.message : 'Offline sync failed.');
      return null;
    } finally {
      syncLock = false;
    }
  }, []);

  useEffect(() => {
    // Mounted with `false` so the first invocation treats the (possibly
    // already-online) mount as offline→online and drains pending captures.
    let lastOnline = false;
    const maybeSync = () => {
      const online = useNetworkStore.getState().isOnline;
      if (online && !lastOnline) {
        void syncNow();
      }
      lastOnline = online;
    };
    maybeSync();
    const unsubscribe = useNetworkStore.subscribe(maybeSync);
    return () => {
      unsubscribe();
    };
  }, [syncNow]);

  return { status, lastMessage, syncNow };
};