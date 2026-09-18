-- ADR-008: offline ballot capture provenance. One issued voucher per
-- (voter, election). Status machine: issued -> consumed | rejected.
-- This is NOT a counting table: tallies come ONLY from the chain +
-- vote_records. It proves a voucher was provisioned and how it ended up.
CREATE TABLE offline_ballots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voter_id UUID NOT NULL REFERENCES voters(id) ON DELETE CASCADE,
  election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  voucher_hash TEXT UNIQUE NOT NULL,          -- sha256 of the canonical voucher payload
  payload TEXT NOT NULL,                      -- canonical voucher payload JSON (re-issue/re-download)
  status TEXT NOT NULL CHECK (status IN ('issued', 'consumed', 'rejected')),
  reason TEXT,                                -- human-readable rejection reason when status=rejected
  created_at TIMESTAMPTZ DEFAULT NOW(),
  consumed_at TIMESTAMPTZ,
  UNIQUE (voter_id, election_id)
);

-- Only the service role may read/write offline ballot provenance. Voters never
-- query this directly; the backend exposes provision/submit through the API.
ALTER TABLE offline_ballots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "offline_ballots service-role read"
  ON offline_ballots FOR SELECT USING (auth.role() = 'service_role');
CREATE POLICY "offline_ballots service-role write"
  ON offline_ballots FOR ALL WITH CHECK (auth.role() = 'service_role');