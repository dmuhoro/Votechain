import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

import api from './api';
import {
  getDialerPhone,
  bindDialerPhone,
  provisionDialerCode,
  getDialerReceipt,
  buildVoteSms,
  buildReceiptSms,
} from './dialer';

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
});

describe('dialer lib', () => {
  it('reads the current phone binding', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { phoneNumber: '+254700000001' } });
    const state = await getDialerPhone();
    expect(api.get).toHaveBeenCalledWith('/api/dialer/phone');
    expect(state.phoneNumber).toBe('+254700000001');
  });

  it('binds a phone number via POST with the exact payload', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: { message: 'ok', phoneNumber: '+254700000002' },
    });
    const result = await bindDialerPhone('+254700000002');
    expect(api.post).toHaveBeenCalledWith('/api/dialer/phone', { phoneNumber: '+254700000002' });
    expect(result.phoneNumber).toBe('+254700000002');
  });

  it('provisions a one-time code for an election id', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: {
        message: 'issued',
        pin: '123456',
        electionCode: '3',
        electionTitle: 'Test Election',
        expiresAt: '2027-01-01T00:00:00Z',
        exists: false,
      },
    });
    const result = await provisionDialerCode(7);
    expect(api.post).toHaveBeenCalledWith('/api/dialer/codes', { electionId: 7 });
    expect(result.pin).toMatch(/^\d{6}$/);
    expect(result.electionCode).toBe('3');
  });

  it('URL-encodes the receipt code when verifying', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        message: 'Vote verified successfully.',
        voteCode: 'V88A42554551E',
        electionTitle: 'Test Election',
        txHash: '0xabc',
        blockNumber: 1,
        explorerUrl: 'https://sepolia.etherscan.io/tx/0xabc',
      },
    });
    const receipt = await getDialerReceipt('V88A42554551E');
    expect(api.get).toHaveBeenCalledWith('/api/dialer/receipts/V88A42554551E');
    expect(receipt.txHash).toBe('0xabc');
  });

  it('builds the exact SMS command bodies', () => {
    expect(buildVoteSms('3', 2, '123456')).toBe('VOTE 3 2 123456');
    expect(buildReceiptSms('V88A42554551E')).toBe('RECEIPT V88A42554551E');
  });
});
