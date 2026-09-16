# Changelog

> All notable changes to VoteChain. Follows
> [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) conventions. Newest first.

---

## [Unreleased]

### Sprint 2 — Hardening and Readiness

#### Added

- **`/api/stats` endpoint** — returns `activeElections`, `totalVotes`, `registeredVoters` via
  count queries on Supabase. Landing page now shows live stats with loading skeleton and error
  fallback (`2026-09-16_layer4-vote-path-hardening.md`).
- **`OTP_RATE_LIMIT` env** — configurable per-IP send-otp rate limit; default `5` per 15 min
  (conservative, per Article IV.4).
- **`coderabbit.yaml`** — assertive PR review profile, auto-review on main; install requires
  user's GitHub click at https://github.com/apps/coderabbit/installations/new.
- **`.dockerignore`** — excludes node_modules/artifacts/cache/dist from Docker build context.
- **`nullifierService.isAlreadyVotedError()`** — detects the contract `"Already voted"` revert
  string from ethers and maps to HTTP 409.

#### Fixed

- **Article II.3 nullifier-burn bug (CRITICAL):** `checkAndStoreNullifier` inserted the DB nullifier
  row BEFORE `relayerService.submitVote`. A failed on-chain tx permanently locked the voter out.
  Fixed by splitting into `checkNullifier` (SELECT only) and `storeNullifier` (upsert with
  `onConflict: 'nullifier_hash', ignoreDuplicates: true`), reordered after on-chain success.
- **On-chain double-vote mapped to 409:** contract revert `"Already voted"` now returns HTTP 409
  with explicit message (was 500), satisfying Article I.6 (no silent drops).
- **Config zod defaults were dead:** `envSchema.parse(process.env)` result was discarded;
  `process.env` was destructured directly, so all zod defaults (SEPOLIA_EXPLORER, OTP_RATE_LIMIT)
  never applied. Now destructures the parse result.
- **Dockerfile was broken:** did not copy `hardhat.config.ts`; `npx hardhat compile` failed in the
  build stage. Now copies the full `packages/contracts` tree. Also removed copy of non-existent
  `packages/backend/node_modules` (workspace hoisting puts deps at root).
- **vercel.json monorepo:** added `rootDirectory: "packages/frontend"` — without it, Vercel would
  look for `dist` at repo root, not `packages/frontend/dist`.

#### Changed

- **Error/loading states on frontend pages:** ElectionsPage shows spinner + retry on error;
  BallotPage surfaces `useVote` error in a red card; ResultsPage shows error + retry button.
- **OTP rate limit** on `/auth/send-otp`: changed from hardcoded `limit: 100` to
  `limit: OTP_RATE_LIMIT` (configurable, default 5).

#### Verified

- `npm run test -w contracts` → 20 passed
- `npm run build -w backend` → `tsc` clean
- `npm run test -w backend` → **8 passed** (was 6; new upsert + isAlreadyVotedError tests)
- `npm run build -w frontend` → `tsc && vite build` green
- `npm run lint -w frontend` → 0 warnings
- Full 13/13 e2e re-run after Article II.3 fix → all pass
- Docker build → `votechain-backend:layer3` image boots with `/api/health = 200`
- `npm audit`: 45 vulns (all dev/build toolchain); runtime deps clean (axios, express, vite,
  zod, ethers, supabase-js, recharts — zero vulnerabilities)

---

### Sprint 1 — Engineering Foundation + Deployment Readiness

#### Added

- **Engineering governance stack** — `docs/engineering/CONSTITUTION.md` (8 Articles, vote-integrity
  invariant), root `AGENTS.md` (10 hard rules for agents), `docs/architecture.md`, `docs/current-state.md`,
  ADR-001 (relayer pattern), ADR-002 (two-boundary nullifier), ADR-003 (key separation), ADR-004
  (deployment topology), sprint scaffold + evidence README.
- **Backend build pipeline** — `packages/backend/tsconfig.json` (strict, outDir `dist`); vitest
  harness; `.env.example` updated to the real contract (adds `OWNER_PRIVATE_KEY`, `SEPOLIA_EXPLORER`).
- **Hardening** — rate limit on `POST /auth/send-otp` (OTP flood guard).
- **Infra manifests** — backend `Dockerfile` (multi-stage, Node 22 Alpine), `railway.toml`,
  `vercel.json` (SPA rewrite), GitHub Actions CI (`ci.yml`) running contract tests + frontend/backend
  builds on push/PR.
- **Auth callback** — `AuthCallbackPage.tsx` + `/auth/callback` route; `authStore.initialize` now
  restores the Supabase session on page load.
- **Supabase schema as versioned migration** — `supabase/migrations/20260916102353_initial_schema.sql`
  (voters/elections/vote_records/nullifiers + RLS); applied/recorded on the live project.
- **Evidence** — `docs/evidence/2026-09-16_layer1-dependency-and-gates.md`,
  `2026-09-16_runtime-bugs-and-infra.md`.

### Fixed

- **Dependency root cause:** `hardhat ^3.7.0` + `ethers ^5.8.0` across all packages — pinned to
  `hardhat ^2.28.0`, `ethers ^6.14.0`; `hardhat-toolbox` pinned to `hh2` line (`6.1.2`); backend
  had no `tsconfig.json` (created). `@vitejs/plugin-react` bumped to `^6.1.1` (vite-8 compatible).
- **Vote-path runtime bugs:** admin routes now sign owner-gated calls with `OWNER_PRIVATE_KEY` (was
  relayer → would revert `Only owner can call` on-chain); `electionId` out-of-scope ReferenceError
  in `votes.ts:151` fixed; `transactionReceipt.timestamp` (ethers v5) replaced by block-fetch;
  `ethers.EthersError.UNPREDICTABLE_GAS_LIMIT` (v5) replaced by string comparison; `elections()
  .candidates()` v5-ism rewritten to `getResults()`.
- `scripts/seed-election.ts` rewritten from 4-arg to the real 6-arg `createElection` signature.
- `scripts/deploy.ts`: `ethers.network.name` (v5) → `provider.getNetwork()` (v6).
- `src/vite-env.d.ts` added (fixes 5× `TS2339 import.meta.env` errors in frontend).
- Unused imports / destructured vars cleaned across backend + frontend (strict TS pass).
- `package-lock.json` regenerated to resolve root `ethers@5.8.0` stale snapshot.

### Tests

- Contract: **20 tests** green on local hardhat network (deploy, owner-only create/close, relayer-only
  vote, duplicate-nullifier, invalid candidate, started/ended windows, relayer update, election
  details, results, 6-arg seed).
- Backend: unit suite for `nullifierService` (determinism, double-vote rejection, supabase read/write
  error surfacing) — **6 tests** green via vitest.
- Frontend: `tsc` + `vite build` + `eslint --max-warnings 0` all green.

### Verified

- `npm run test -w contracts` → 20 passed
- `npm run build -w backend` → emits `dist/` without type errors
- `npm run test -w backend` → 6 passed
- `npm run build -w frontend` → `tsc && vite build` green (152 kB JS, 13 kB CSS)
- `npm run lint -w frontend` → 0 warnings

### Documented

- `docs/adr/*` (4 ADRs), `docs/sprints/README.md`, `docs/evidence/README.md`, `docs/architecture.md`,
  `docs/current-state.md`.
- `docs/sprints/sprint-1-engineering-foundation.md` — sprint result, evidence table, honest
  boundaries.

---

<!-- Baseline: initial MVP scaffold (single commit 10f7531, 2026-09-15) -->