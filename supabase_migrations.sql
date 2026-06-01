-- Create voters table
CREATE TABLE voters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  national_id_hash TEXT UNIQUE NOT NULL,  -- hashed, never store plaintext
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security for voters table
ALTER TABLE voters ENABLE ROW LEVEL SECURITY;

-- Policy for voters to read their own record
CREATE POLICY "Voters can view their own data." ON voters FOR SELECT USING (auth.uid() = id);

-- Create elections table (mirrors on-chain data for fast querying)
CREATE TABLE elections (
  id SERIAL PRIMARY KEY,
  chain_election_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT true,
  contract_address TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security for elections table
ALTER TABLE elections ENABLE ROW LEVEL SECURITY;

-- Policy for all authenticated users to read elections
CREATE POLICY "All authenticated users can view elections." ON elections FOR SELECT USING (auth.role() = 'authenticated');

-- Create vote_records table (audit trail — no voter identity stored)
CREATE TABLE vote_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id INTEGER REFERENCES elections(id),
  tx_hash TEXT UNIQUE NOT NULL,          -- Ethereum tx hash given to voter
  nullifier_hash TEXT UNIQUE NOT NULL,   -- proves uniqueness, not identity
  block_number INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security for vote_records table
ALTER TABLE vote_records ENABLE ROW LEVEL SECURITY;

-- Policy for vote_records to be publicly readable (for audit)
CREATE POLICY "Vote records are publicly readable." ON vote_records FOR SELECT USING (true);

-- Create nullifiers table (fast double-vote check before hitting chain)
CREATE TABLE nullifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id INTEGER REFERENCES elections(id),
  nullifier_hash TEXT UNIQUE NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security for nullifiers table
ALTER TABLE nullifiers ENABLE ROW LEVEL SECURITY;

-- Policy for nullifiers to be only readable by service role
CREATE POLICY "Nullifiers are only readable by service role." ON nullifiers FOR SELECT USING (auth.role() = 'service_role');
CREATE POLICY "Nullifiers can be inserted by service role." ON nullifiers FOR INSERT WITH CHECK (auth.role() = 'service_role');
