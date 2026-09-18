import { useCallback, useEffect, useRef, useState } from 'react';
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

/**
 * Offline ballot sync (ADR-008). Captured ballots are submitted through the
 * SAME server path as an online vote (POST /api/offline/ballots/submit →
 * voteService.castVote → relayer → chain). Sync runs automatically when the
 * device comes back online and on demand via syncNow().
 */
export const useOfflineSync = () => {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const syncingRef = useRef(false);

  const syncNow = useCallback(async (): Promise<string | null> => {
    if (syncingRef.current) return null;
    const pending = listCapturedBallots();
    if (pending.length === 0) {
      setStatus('idle');
      setLastMessage('No offline ballots waiting to submit.');
      return null;
    }

    syncingRef.current = true;
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
      syncingRef.current = false;
    }
  }, []);

  useEffect(() => {
    let lastOnline = useNetworkStore.getState().isOnline;
    const maybeSync = () => {
      const online = useNetworkStore.getState().isOnline;
      if (online && !lastOnline) {
        void syncNow();
      }
      lastOnline = online;
    };
    const unsubscribe = useNetworkStore.subscribe(maybeSync);
    return () => {
      unsubscribe();
    };
  }, [syncNow]);

  return { status, lastMessage, syncNow };
};