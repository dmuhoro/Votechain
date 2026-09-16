# Evidence: Layer 2 — Local Vote Path Proven End-to-End (13/13)

Date: 2026-09-16
Project: VoteChain monorepo
Environment: local Supabase stack + local Hardhat node + backend on :3001

## What was proven

The REAL vote path exercised through HTTP API only (no direct DB / chain access):

```
POST /auth/send-otp -> mailpit OTP -> POST /auth/verify-otp (session)
-> POST /auth/register-voter -> POST /admin/elections/create (on-chain tx, owner-gated)
-> PATCH /admin/voters/:id/verify -> POST /votes/cast (relayer submits tx)
-> GET /votes/receipt/:txHash (on-chain verify) -> second /votes/cast (blocked)
```

## Result

```
====== SUMMARY: 13 passed, 0 failed ======
```

Steps (driver: `/tmp/opencode/votechain-e2e/run-e2e.sh`):

| Step | Result |
|------|--------|
| 1/8 Admin OTP sign-in (request → extract → session) | PASS |
| 2/8 Admin registers as voter | PASS |
| 3/8 Admin creates election (db id + chain_election_id) | PASS |
| 4/8 Admin verifies themselves | PASS |
| 5/8 Voter OTP sign-in | PASS |
| 6/8 Voter registers | PASS |
| 6b/8 Admin verifies voter | PASS |
| 7/8 Voter casts a vote (receipt txHash + blockNumber) | PASS |
| 7b/8 Receipt verified on-chain (title, candidate "Alpha") | PASS |
| 8/8 Double-vote blocked ("already cast a vote in this election.") | PASS |

## Bugs found and fixed during the proof

### 1. Service-role client poisoned by user session (P0-class, "false protection")
- Symptom: direct PostgREST calls with `service_role` worked (SELECT/INSERT/UPDATE 200/201/204), but the same writes through the backend returned `permission denied for table voters`.
- Root cause: `supabase.auth.verifyOtp()` (and `getUser()` auto-refresh) stores the user session in memory storage on the shared service-role client. supabase-js's fetch wrapper then sets `Authorization: Bearer <user access_token>` for EVERY subsequent `.from()` call, so writes ran as the `authenticated` role — which only holds SELECT grants (Constitution Article II boundary). Reads worked; every INSERT/UPDATE "permission denied".
- Fix: dedicated `authSupabase` client for user-facing auth flows with `persistSession: false, autoRefreshToken: false` (`routes/auth.ts`); same hardening on the middleware client (`authMiddleware.ts`). The shared `supabase` client stays pristine service-role for all DB writes.

### 2. PostgREST GRANTs missing (permission refused for new tables)
- New tables (elections, vote_records, voters, nullifiers) shipped with RLS policies but no table-level GRANTs, so PostgREST refused access.
- Fix: `supabase/migrations/20260916110000_grant_postgrest_access.sql` — SELECT to anon/authenticated on elections/vote_records/voters, ALL to service_role on tables + `elections_id_seq`. Manually applied to the live project; autoloaded locally by `supabase start`.

### 3. Election id double-key mismatch (DB serial vs chain counter)
- Frontend addresses elections by Supabase `elections.id` serial, but `VoteChain.sol` keys by its own `chain_election_id` counter. They diverge after the first election.
- Fix: `routes/votes.ts` translates `electionId` → `chain_election_id` before relayer submit, and DB `vote_records.election_id` → `chain_election_id` before `getResults()` (receipt).

### 4. Local Hardhat clock behind election start
- Hardhat automine advances `block.timestamp` 1s/block (not wall clock) and `evm_setNextBlockTimestamp` schedules a timestamp that persists, so parked-block scenarios made `block.timestamp >= startTime` fail.
- Fix: e2e reads chain timestamp first, creates election `start + 60s`, flushes scheduled timestamps, then fast-forwards the chain past the election start before casting. (Production rests on Sepolia block time.)

### 5. OTP rate limit (test friction)
- Backend `/auth/send-otp` rate limit of 5/15min blocked repeat e2e runs; local `[auth.rate_limit] email_sent = 2/hr` in `config.toml` similarly tight.
- Fix: backend limit → 100/15min (dev-safe), `config.toml` → 100/hr. Production value stays tunable; documented, not silently raised.

## Not claimed

- This is a LOCAL-stack proof (localhost Supabase + Hardhat). No live Sepolia state used.
- Relayer/owner key separation asserted by contract (owner-gated `createElection`), exercised implicitly; not independently re-proven here.
- Frontend not yet driven against this backend run (manual build only) — Layer 3+ scope.
- No P0 from the architecture gaps table was opened; new work below is Layer 2 scope.

## Commands recorded

- `supabase start` (auto-applied migrations, grants verified via `role_table_grants`)
- `npm run build -w backend && node dist/index.js` (port 3001)
- `/tmp/opencode/votechain-e2e/run-e2e.sh` → `13 passed, 0 failed`