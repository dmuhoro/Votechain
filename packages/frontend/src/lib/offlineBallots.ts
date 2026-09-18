import { safeStorage } from './storage';

/**
 * Offline ballot vault (ADR-008). Durable device-local staging for CAPTURED
 * ballots and their signed vouchers. This is capture + staged submission —
 * nothing here is "voted" until the server (shared cast path) accepts it.
 *
 * Fail-closed: on any tampered/corrupt payload the vault returns empty and
 * clears the corrupt key rather than fabricating a ballot.
 */

export interface OfflineVoucherPayload {
  version: 1;
  voterId: string;
  electionId: number;
  candidatesFingerprint: string;
  issuedAt: string;
  expiresAt: string;
}

export interface SignedVoucher {
  payload: OfflineVoucherPayload;
  signature: string;
}

export type BallotStatus = 'captured' | 'submitted' | 'rejected';

export interface CapturedOfflineBallot {
  voterId: string;
  electionId: number;
  candidateId: number;
  voucher: SignedVoucher;
  capturedAt: string;
  status: BallotStatus;
  reason?: string | null;
  txHash?: string;
  electionTitle?: string;
  candidateName?: string;
}

const VOUCHERS_KEY = 'vc_offline_vouchers';
const BALLOTS_KEY = 'vc_offline_ballots';

const readList = <T>(key: string): T[] => {
  const raw = safeStorage.getString(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    safeStorage.remove(key);
    return [];
  }
};

const writeList = <T>(key: string, items: T[]): boolean =>
  safeStorage.setString(key, JSON.stringify(items));

/** Save a signed voucher for one election (idempotent; one per election). */
export const saveSignedVoucher = (voucher: SignedVoucher): boolean => {
  const byElection = readList<SignedVoucher>(VOUCHERS_KEY).filter(
    (v) => v.payload.electionId !== voucher.payload.electionId,
  );
  byElection.push(voucher);
  return writeList(VOUCHERS_KEY, byElection);
};

export const getSignedVoucher = (electionId: number): SignedVoucher | null => {
  const found = readList<SignedVoucher>(VOUCHERS_KEY).find(
    (v) => v.payload.electionId === electionId,
  );
  return found ?? null;
};

export const listSignedVouchers = (): SignedVoucher[] => readList<SignedVoucher>(VOUCHERS_KEY);

/** Capture a ballot locally. Durable across sessions on device. */
export const captureOfflineBallot = (ballot: CapturedOfflineBallot): boolean => {
  const others = readList<CapturedOfflineBallot>(BALLOTS_KEY).filter(
    (b) => b.electionId !== ballot.electionId,
  );
  others.push(ballot);
  return writeList(BALLOTS_KEY, others);
};

export const listCapturedBallots = (): CapturedOfflineBallot[] =>
  readList<CapturedOfflineBallot>(BALLOTS_KEY).filter((b) => b.status === 'captured');

export const listBallots = (): CapturedOfflineBallot[] => readList<CapturedOfflineBallot>(BALLOTS_KEY);

export const getOfflineBallot = (electionId: number): CapturedOfflineBallot | null =>
  readList<CapturedOfflineBallot>(BALLOTS_KEY).find((b) => b.electionId === electionId) ?? null;

/** Move a captured ballot to a terminal status (submitted/rejected). */
export const updateBallotStatus = (
  electionId: number,
  status: Extract<BallotStatus, 'submitted' | 'rejected'>,
  patch: { reason?: string | null; txHash?: string } = {},
): boolean => {
  const ballots = readList<CapturedOfflineBallot>(BALLOTS_KEY);
  const index = ballots.findIndex((b) => b.electionId === electionId);
  if (index === -1) return false;
  ballots[index] = { ...ballots[index], status, ...patch };
  return writeList(BALLOTS_KEY, ballots);
};

export const removeOfflineBallot = (electionId: number): boolean => {
  const ballots = readList<CapturedOfflineBallot>(BALLOTS_KEY).filter(
    (b) => b.electionId !== electionId,
  );
  return writeList(BALLOTS_KEY, ballots);
};