import api from './api';

/**
 * Dialer (SMS/USSD) client (ADR-009). The dialer is the offline/feature-phone
 * channel: a verified voter binds a phone, provisions a one-time PIN, then
 * texts the VOTE command to the carrier shortcode. These calls only cover
 * provisioning and receipt lookup — the vote itself is sent by SMS.
 */

export interface DialerPhoneState {
  phoneNumber: string | null;
}

export interface DialerProvisionResult {
  message: string;
  pin: string;
  electionCode: string | null;
  electionTitle: string;
  expiresAt: string;
  exists: boolean;
}

export interface DialerReceipt {
  message: string;
  voteCode: string;
  electionTitle: string;
  txHash: string;
  blockNumber: number | null;
  explorerUrl: string;
}

export const getDialerPhone = async (): Promise<DialerPhoneState> => {
  const { data } = await api.get<DialerPhoneState>('/api/dialer/phone');
  return data;
};

export const bindDialerPhone = async (phoneNumber: string): Promise<{ message: string; phoneNumber: string }> => {
  const { data } = await api.post<{ message: string; phoneNumber: string }>('/api/dialer/phone', {
    phoneNumber,
  });
  return data;
};

export const provisionDialerCode = async (electionId: number): Promise<DialerProvisionResult> => {
  const { data } = await api.post<DialerProvisionResult>('/api/dialer/codes', { electionId });
  return data;
};

export const getDialerReceipt = async (voteCode: string): Promise<DialerReceipt> => {
  const { data } = await api.get<DialerReceipt>(`/api/dialer/receipts/${encodeURIComponent(voteCode)}`);
  return data;
};

/** Build the exact SMS body a voter sends for an election. */
export const buildVoteSms = (electionCode: string, candidateId: number, pin: string): string =>
  `VOTE ${electionCode} ${candidateId} ${pin}`;

/** Build the receipt SMS body for on-phone verification. */
export const buildReceiptSms = (voteCode: string): string => `RECEIPT ${voteCode}`;
