-- ADR-009: dialer (SMS/USSD) vote intake.
-- Feature-phone reachability: a verified voter binds a phone, provisions a
-- 6-digit one-time PIN per (voter, election), and casts via the shared cast
-- path. This is a front door on the SAME vote core — no second counting
-- authority (chain + vote_records stay authoritative).

-- 1. Phone binding on voters (unique, nullable — multiple unbound voters OK).
ALTER TABLE voters ADD COLUMN phone_number TEXT;
ALTER TABLE voters ADD CONSTRAINT voters_phone_number_key UNIQUE (phone_number);

-- 2. Dialer-friendly short code per election (backfilled from chain election id).
ALTER TABLE elections ADD COLUMN dial_code TEXT;
UPDATE elections SET dial_code = chain_election_id::text WHERE dial_code IS NULL;
ALTER TABLE elections ALTER COLUMN dial_code SET NOT NULL;
ALTER TABLE elections ADD CONSTRAINT elections_dial_code_key UNIQUE (dial_code);

-- 3. One-time auth PINs. Only the SHA-256 digest of the PIN is stored (never
--    the plaintext). One active (issued) PIN per (voter, election) — partial
--    unique index is the fail-closed backstop, mirroring offline_ballots.
CREATE TABLE dialer_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voter_id UUID NOT NULL REFERENCES voters(id) ON DELETE CASCADE,
  election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('issued', 'consumed', 'rejected')),
  reason TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  consumed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX dialer_codes_one_active_per_voter_election
  ON dialer_codes (voter_id, election_id) WHERE status = 'issued';

-- 4. Audit log: every inbound dialer command gets an explicit outcome
--    (Constitution Article I.6 — no silent drops).
CREATE TABLE sms_intake_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway TEXT NOT NULL DEFAULT 'simulated',
  body TEXT NOT NULL,
  from_number TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN (
    'hello', 'voted', 'duplicate', 'receipt', 'invalid_pin', 'no_active_code', 'expired',
    'election_closed', 'candidate_mismatch', 'election_not_found',
    'unknown_command', 'not_verified', 'phone_unbound', 'error'
  )),
  reason TEXT,
  election_id INTEGER,
  vote_code TEXT,
  tx_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX sms_intake_log_from_created_idx ON sms_intake_log (from_number, created_at DESC);

-- 5. Short receipt code on vote_records so a voter can re-verify on any phone.
--    Generated STORED so the shared castVote insert (which does not know about
--    vote_code) produces it automatically — the code can never drift from the
--    tx hash it certifies. Must match dialerService.voteCodeFromTxHash().
ALTER TABLE vote_records ADD COLUMN vote_code TEXT
  GENERATED ALWAYS AS ('V' || upper(substr(replace(tx_hash, '0x', ''), 1, 12))) STORED;
ALTER TABLE vote_records ADD CONSTRAINT vote_records_vote_code_key UNIQUE (vote_code);

-- RLS: service-role only for the dialer tables (same as offline_ballots).
ALTER TABLE dialer_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dialer_codes service-role read"
  ON dialer_codes FOR SELECT USING (auth.role() = 'service_role');
CREATE POLICY "dialer_codes service-role write"
  ON dialer_codes FOR ALL WITH CHECK (auth.role() = 'service_role');

ALTER TABLE sms_intake_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sms_intake_log service-role read"
  ON sms_intake_log FOR SELECT USING (auth.role() = 'service_role');
CREATE POLICY "sms_intake_log service-role write"
  ON sms_intake_log FOR ALL WITH CHECK (auth.role() = 'service_role');