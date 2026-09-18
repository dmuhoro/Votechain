import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  saveSignedVoucher,
  getSignedVoucher,
  listSignedVouchers,
  captureOfflineBallot,
  listCapturedBallots,
  listBallots,
  getOfflineBallot,
  updateBallotStatus,
  removeOfflineBallot,
} from './offlineBallots';
import type { SignedVoucher, CapturedOfflineBallot } from './offlineBallots';

const voucher = (electionId: number): SignedVoucher => ({
  payload: {
    version: 1,
    voterId: 'voter-1',
    electionId,
    candidatesFingerprint: 'fp123',
    issuedAt: '2026-09-18T10:00:00.000Z',
    expiresAt: '2027-01-01T00:00:00.000Z',
  },
  signature: 'Sig-' + electionId,
});

const ballot = (electionId: number): CapturedOfflineBallot => ({
  voterId: 'voter-1',
  electionId,
  candidateId: 2,
  voucher: voucher(electionId),
  capturedAt: '2026-09-18T11:00:00.000Z',
  status: 'captured',
  electionTitle: `Election #${electionId}`,
  candidateName: 'Beta',
});

describe('offlineBallot vault', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('saves one signed voucher per election (idempotent overwrite)', () => {
    expect(saveSignedVoucher(voucher(1))).toBe(true);
    expect(saveSignedVoucher(voucher(1))).toBe(true);
    expect(listSignedVouchers()).toHaveLength(1);
    expect(getSignedVoucher(1)).toEqual(voucher(1));
  });

  it('captures a ballot and lists it as pending', () => {
    captureOfflineBallot(ballot(1));
    captureOfflineBallot(ballot(2));

    expect(listCapturedBallots().map((b) => b.electionId)).toEqual([1, 2]);
    expect(getOfflineBallot(1)).toMatchObject({ electionId: 1, status: 'captured' });
  });

  it('capturing the same election replaces the previous capture (one ballot per election)', () => {
    captureOfflineBallot(ballot(1));
    const updated = { ...ballot(1), candidateId: 3, candidateName: 'Gamma' };
    captureOfflineBallot(updated);

    expect(listCapturedBallots()).toHaveLength(1);
    expect(getOfflineBallot(1)?.candidateId).toBe(3);
  });

  it('moves a ballot to submitted and no longer lists it as pending', () => {
    captureOfflineBallot(ballot(1));
    updateBallotStatus(1, 'submitted', { txHash: '0xabc' });

    expect(listCapturedBallots()).toHaveLength(0);
    expect(listBallots()[0]).toMatchObject({ status: 'submitted', txHash: '0xabc' });
  });

  it('records a rejected ballot with an explicit reason (no silent drop)', () => {
    captureOfflineBallot(ballot(1));
    updateBallotStatus(1, 'rejected', { reason: 'duplicate' });

    expect(getOfflineBallot(1)).toMatchObject({ status: 'rejected', reason: 'duplicate' });
  });

  it('clears a captured ballot via removeOfflineBallot', () => {
    captureOfflineBallot(ballot(1));
    removeOfflineBallot(1);
    expect(listBallots()).toHaveLength(0);
  });

  it('fails closed on corrupt vault json: returns empty and clears the key', () => {
    saveSignedVoucher(voucher(1));
    expect(listSignedVouchers()).toHaveLength(1);

    const proto = Object.getPrototypeOf(window.localStorage) as Storage;
    const spy = vi.spyOn(proto, 'getItem').mockImplementation((key: string) =>
      key === 'vc_offline_vouchers' ? '{corrupt' : null,
    );

    expect(listSignedVouchers()).toEqual([]);
    expect(listCapturedBallots()).toEqual([]);
    spy.mockRestore();
  });
});