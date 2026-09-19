import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageShell from '../components/PageShell';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { useAuthStore } from '../store/authStore';
import { useElection } from '../hooks/useElection';
import { toErrorMessage } from '../lib/api';
import {
  getDialerPhone,
  bindDialerPhone,
  provisionDialerCode,
  getDialerReceipt,
  buildVoteSms,
  type DialerProvisionResult,
  type DialerReceipt,
} from '../lib/dialer';

/**
 * Dialer page (ADR-009): lets a verified voter bind their phone, provision a
 * one-time PIN, and verify a vote by receipt code from any phone. The vote
 * itself is sent by SMS to the carrier shortcode using the command shown here.
 */
const DialerPage: React.FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { elections } = useElection();

  const [phone, setPhone] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [binding, setBinding] = useState(false);

  const [electionId, setElectionId] = useState<number | ''>('');
  const [provision, setProvision] = useState<DialerProvisionResult | null>(null);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);

  const [receiptCode, setReceiptCode] = useState('');
  const [receipt, setReceipt] = useState<DialerReceipt | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    getDialerPhone()
      .then((state) => setPhone(state.phoneNumber))
      .catch(() => setPhone(null));
  }, []);

  useEffect(() => {
    if (elections.length > 0 && electionId === '') {
      setElectionId(elections[0].id);
    }
  }, [elections, electionId]);

  const handleBind = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneError(null);
    setBinding(true);
    try {
      const result = await bindDialerPhone(phoneInput.trim());
      setPhone(result.phoneNumber);
      setPhoneInput('');
    } catch (err) {
      setPhoneError(toErrorMessage(err, 'Could not bind that phone number.'));
    } finally {
      setBinding(false);
    }
  };

  const handleProvision = async () => {
    if (electionId === '') return;
    setProvisionError(null);
    setProvisioning(true);
    try {
      const result = await provisionDialerCode(Number(electionId));
      setProvision(result);
    } catch (err) {
      setProvisionError(toErrorMessage(err, 'Could not issue a dialer code.'));
    } finally {
      setProvisioning(false);
    }
  };

  const handleCheckReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    setReceiptError(null);
    setReceipt(null);
    setChecking(true);
    try {
      const result = await getDialerReceipt(receiptCode.trim().toUpperCase());
      setReceipt(result);
    } catch (err) {
      setReceiptError(toErrorMessage(err, 'That receipt code was not found.'));
    } finally {
      setChecking(false);
    }
  };

  return (
    <PageShell title="Dialer Voting">
      <div className="mx-auto max-w-3xl">
        <Card className="mb-6">
          <h1 className="mb-2 text-2xl font-bold md:text-3xl">Dialer Voting</h1>
          <p className="text-sm text-gray-400">
            Vote from any phone — no browser or data needed. Bind your number, get a one-time PIN,
            then text the command to the VoteChain shortcode. The vote runs through the same on-chain
            path as the app, so double-vote prevention is unchanged.
          </p>
        </Card>

        {!user?.is_verified && (
          <Card className="mb-6 border border-amber-700 bg-amber-950">
            <p className="text-sm text-amber-200">
              Dialer voting is available to verified voters only. Once an official verifies your
              account, you can bind a phone here.
            </p>
          </Card>
        )}

        <Card className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">1. Bind your phone</h2>
          {phone ? (
            <p className="text-sm text-green-300">Bound: {phone}</p>
          ) : (
            <form onSubmit={handleBind} className="flex flex-wrap items-end gap-3">
              <label className="flex-1">
                <span className="mb-1 block text-sm text-gray-400">Phone number (international)</span>
                <input
                  type="tel"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="+254700000000"
                  className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100"
                />
              </label>
              <Button type="submit" isLoading={binding} disabled={!user?.is_verified || phoneInput.trim().length < 7}>
                Bind phone
              </Button>
            </form>
          )}
          {phoneError && <p className="mt-2 text-sm text-red-300">{phoneError}</p>}
        </Card>

        <Card className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">2. Get a one-time PIN</h2>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex-1">
              <span className="mb-1 block text-sm text-gray-400">Election</span>
              <select
                value={electionId}
                onChange={(e) => setElectionId(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100"
              >
                <option value="" disabled>
                  Select an election
                </option>
                {elections.map((election) => (
                  <option key={election.id} value={election.id}>
                    {election.title}
                  </option>
                ))}
              </select>
            </label>
            <Button onClick={handleProvision} isLoading={provisioning} disabled={!phone || electionId === ''}>
              Issue PIN
            </Button>
          </div>

          {provisionError && <p className="mt-2 text-sm text-red-300">{provisionError}</p>}

          {provision && (
            <div className="mt-4 rounded-lg border border-blue-800 bg-blue-950 p-4">
              <p className="text-sm text-blue-200">
                {provision.exists ? 'Your previous PIN was replaced.' : 'PIN issued.'} Expires{' '}
                {new Date(provision.expiresAt).toLocaleString()}.
              </p>
              <p className="mt-3 text-3xl font-bold tracking-widest text-white">{provision.pin}</p>
              <p className="mt-3 text-sm text-gray-300">
                Text this to the VoteChain shortcode:
              </p>
              <code className="mt-1 block break-all rounded bg-gray-900 px-3 py-2 text-sm text-green-300">
                {buildVoteSms(provision.electionCode ?? '?', 1, provision.pin)}
              </code>
              <p className="mt-2 text-xs text-gray-400">
                Replace the candidate number (1) with the position of your choice on the ballot. One
                PIN works once. Keep it secret.
              </p>
            </div>
          )}
        </Card>

        <Card className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">3. Verify a vote by receipt code</h2>
          <form onSubmit={handleCheckReceipt} className="flex flex-wrap items-end gap-3">
            <label className="flex-1">
              <span className="mb-1 block text-sm text-gray-400">Receipt code (starts with V)</span>
              <input
                value={receiptCode}
                onChange={(e) => setReceiptCode(e.target.value)}
                placeholder="V88A42554551E"
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100"
              />
            </label>
            <Button type="submit" isLoading={checking} disabled={receiptCode.trim().length < 3}>
              Verify
            </Button>
          </form>

          {receiptError && <p className="mt-2 text-sm text-red-300">{receiptError}</p>}

          {receipt && (
            <div className="mt-4 rounded-lg border border-green-800 bg-green-950 p-4">
              <p className="text-sm text-green-200">{receipt.message}</p>
              <p className="mt-1 text-sm text-gray-300">
                {receipt.electionTitle} · block {receipt.blockNumber ?? '?'}
              </p>
              <a
                href={receipt.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block break-all text-sm text-blue-300 underline"
              >
                {receipt.txHash}
              </a>
            </div>
          )}
        </Card>

        <Button variant="secondary" onClick={() => navigate('/elections')} className="w-full">
          ← Back to Elections
        </Button>
      </div>
    </PageShell>
  );
};

export default DialerPage;
