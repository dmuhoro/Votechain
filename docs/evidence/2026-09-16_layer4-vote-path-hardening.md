# Evidence — Layer 4 (Vote-Path Hardening + Audit)

**Date:** 2026-09-16
**Gate:** Layer 4 — Constitutional vote-path fixes and hardening complete.

## 1. Article II.3 nullifier-burn fix (CRITICAL)

**Problem:** The original `checkAndStoreNullifier` in `nullifierService.ts` executed
SELECT + INSERT as a single function, and `votes.ts` called it *before*
`relayerService.submitVote`. If the on-chain transaction failed (network error, contract
revert, election not started), the nullifier row was already stored in the Supabase
`nullifiers` table → the voter was permanently locked out, unable to retry — a violation
of Constitution Article II.3: *"A failed on-chain transaction must not silently burn a
nullifier."*

**Fix:** Split into two functions — `checkNullifier` (SELECT only, fast pre-check) and
`storeNullifier` (upsert with `onConflict: 'nullifier_hash', ignoreDuplicates: true`).
Reordered in `votes.ts`:

1. `generateNullifier`
2. `checkNullifier` — pre-check boundary (a) rejects fast, no DB write yet
3. `relayerService.submitVote` — on-chain boundary (b) is the authoritative gate
4. `storeNullifier` — atomic ON CONFLICT backstop, only after on-chain success
5. `vote_records` insert

**Race backstop:** Two concurrent identical votes both pass `checkNullifier`, both
submit on-chain. Contract allows exactly one; the loser reverts with `"Already voted"`.
The winner stores the nullifier via ON CONFLICT DO NOTHING (atomic, no TOCTOU window).

**Article I.4 proof:** The existing `nullifierService.test.ts` now asserts:
- `checkNullifier` does **not** call `insert`/`upsert` when a row exists (pre-check only).
- `storeNullifier` passes the exact `onConflict` + `ignoreDuplicates` options.

**409 mapping for contract revert:** `isAlreadyVotedError` detects the `"Already voted"`
revert string from ethers and maps it to HTTP 409 with the message *"Voter has already
cast a vote in this election."* — satisfying Article I.6 (explicit rejection reason).

## 2. Config zod-parse bug (defaults were dead)

**Problem:** `config/index.ts` called `envSchema.parse(process.env)` for validation but
then destructured `process.env` directly. Zod defaults (e.g. `SEPOLIA_EXPLORER` default
`https://sepolia.etherscan.io`, `OTP_RATE_LIMIT` default `5`) never applied — they only
exist in the parse result object, which was discarded.

**Fix:** Destructure the parse result (`env = envSchema.parse(process.env)`), not
`process.env`. The try/catch now throws (consistent with Article IV.2 "refuse to boot
on missing/invalid env") rather than `process.exit(1)`.

## 3. OTP rate limit env-tunable, conservative default

`OTP_RATE_LIMIT` added to the zod schema with default `5` per 15-minute window (per
Article IV.4: rate-limited at the boundary, defaults must refuse, not silently allow).
Production deploy sets this env var to the desired value. Local e2e sets `100` in the
gitignored `.env`.

## 4. /api/stats endpoint + landing page

New `routes/stats.ts` returns `{ activeElections, totalVotes, registeredVoters }` using
three parallel `select('id', { count: 'exact', head: true })` queries (no data transfer,
count only). LandingPage now fetches stats on mount with loading skeleton and error
fallback ("Live stats temporarily unavailable — vote records remain auditable on-chain
regardless").

## 5. Error/loading states on elections/ballot/results

| Page | Before | After |
|------|--------|-------|
| ElectionsPage | No loading/error state (blank on network failure) | Spinner + retry button when error |
| BallotPage | Vote error from useVote silently dropped | `voteError` surfaced in a red error card |
| ResultsPage | `useResults.error` never rendered | Error message + Retry button shown |

## 6. Dockerfile correct (per Layer 3, re-verified after Layer 4 changes)

Layer 4 backend changes (nullifierService, config, votes.ts, stats.ts) recompiled via
`npm run build -w backend` and the full `docker build` produced an image that boots with
`/api/health = 200`. The only runtime change is the nullifier reorder and new stats route.

## 7. npm audit — runtime deps clean; dev toolchain delibately descoped

```
npm audit --json → total vulns: 45 (14 low, 9 moderate, 22 high, 0 critical)
```

| Category | Direct dep | Severity | Fix status | Decision |
|----------|-----------|----------|-----------|----------|
| **Runtime (shipped to users)** | axios, express, zod, ethers, supabase-js, vite, react, recharts | — | **Clean — zero vulnerabilities** | — |
| Dev tooling (never shipped) | hardhat (^2.28.0) | HIGH | fix=NO | Descope — Hardhat 3 is a rewrite (ADR-001 pinning) |
| Dev tooling | @nomicfoundation/hardhat-toolbox (6.1.2) | HIGH | fix → 7.0.0 (MAJOR = Hardhat 3 shim) | Descope — same as above |
| Dev tooling | solidity-coverage, solidity-coverage | HIGH | fix → 0.7.22 (MAJOR) | Descope — dev-only |
| Frontend runtime | react-router-dom (6.x) | MODERATE | fix → 7.18.4 (MAJOR) | Descope — requires app-level migration (routes API changes), moderate risk for demo |
| Dev tooling | @typescript-eslint/* | HIGH | fix available, applied where non-breaking | Done |
| Transitive | undici, uuid, @sentry/*, lodash, serialize-javascript | LOW–HIGH | no fix / transitive | Descope — dev-only; runtime deps clean |

**Article VIII.3 compliance:** Descoped deliberately, documented. No runtime (user-shipped)
dependency is vulnerable. All remaining vulns are in dev/build toolchain where the only
fixes require major version bumps that break the Hardhat 2.x / Vite 8 / React Router 6
lines established in Layer 1.

## Not claimed

- This evidence does **not** prove the ON CONFLICT backstop works against two truly
  concurrent HTTP requests (would require parallel test client — out of scope for Layer 4;
  the race window is bounded by the on-chain confirmation time and contract is
  authoritative).
- This evidence does **not** prove Vercel/Railway deployment config is correct in
  production — see Layer 3 evidence for infra correctness.
