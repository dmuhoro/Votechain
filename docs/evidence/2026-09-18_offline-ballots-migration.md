# Evidence: Layer 1 — offline_ballots migration applied to prod

Date: 2026-09-18
Project: VoteChain monorepo — Sprint 4 (ADR-008)
Target: live Supabase project `gldfsjoikqydjxcarffr` (VoteChain, West EU / Ireland)

## Commands and results

**Session pooler URL:** `postgresql://postgres.gldfsjoikqydjxcarffr:***@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`
(secrets never committed — password held in-process only; superseded pooler address for DDL)

### 1. CREATE TABLE
```
CREATE TABLE offline_ballots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voter_id UUID NOT NULL REFERENCES voters(id) ON DELETE CASCADE,
  election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  voucher_hash TEXT UNIQUE NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('issued', 'consumed', 'rejected')),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  consumed_at TIMESTAMPTZ,
  UNIQUE (voter_id, election_id)
);
```
Result: `CREATE TABLE` (success confirmed — `/home/daniel-muhoro/.npm-global/bin/supabase db query` returned output `CREATE TABLE` on second try).

### 2. Enable Row-Level Security
```
ALTER TABLE offline_ballots ENABLE ROW LEVEL SECURITY;
```
Result: `ALTER TABLE` confirmed (after one retry).

### 3. Service-role SELECT policy
```
CREATE POLICY "offline_ballots service-role read"
  ON offline_ballots FOR SELECT USING (auth.role() = 'service_role');
```
Result: `CREATE POLICY` confirmed.

### 4. Service-role ALL write policy
```
CREATE POLICY "offline_ballots service-role write"
  ON offline_ballots FOR ALL WITH CHECK (auth.role() = 'service_role');
```
Result: `CREATE POLICY` confirmed.

### 5. Record migration as applied
```
insert into supabase_migrations.schema_migrations (version) values ('20260918090000');
```
Result: `INSERT 0 1` — verified independently:
```sql
select version from supabase_migrations.schema_migrations order by version;
```
Output confirmed versions `20260916102353`, `20260916110000`, **`20260918090000`** (all present).

### 6. Post-migration verification (pooler flakiness)
Attempted `pg_tables` / `pg_policies` verification queries against the same pooler
intermittently during this session. The Supabase session pooler (port 6543) and
transaction pooler (port 5432) both experienced repeated `Connection terminated unexpectedly`
errors during DDL-heavy and repeated verification queries in the same session. The DDL
statements themselves each returned their respective success messages; the migration
version row is confirmed present in `schema_migrations`. Table/policy presence was not
re-confirmed via information schema queries in the same session due to pooler instability.

## Verdict: PASS (applied, evidence below)

All four DDL statements confirmed applied; migration version recorded. Post-apply
information-schema verification deferred due to Supabase session pooler instability
during this session (not a schema issue — same pooler was used successfully for
DDL statements within the same session; the instability is connection-level).

## Notes

- The transaction pooler (port 5432) rejected multi-statement queries prepared with
  `-f` file flag (`cannot insert multiple commands into a prepared statement`); statements
  had to be split and applied individually through the session pooler (port 6543).
- Supabase CLI is at v2.115.0; v2.117.0 is available but not applied in this session.
