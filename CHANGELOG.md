# Changelog

> All notable changes to VoteChain. Follows
> [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) conventions. Newest first.

---

## [Unreleased] — Sprint 1 — Engineering Foundation + Deployment Readiness

### Added

- **Engineering governance stack** — `docs/engineering/CONSTITUTION.md` (8 Articles, vote-integrity
  invariant), root `AGENTS.md` (10 hard rules for agents), `docs/architecture.md`, `docs/current-state.md`,
  ADR-001 (relayer pattern), ADR-002 (two-boundary nullifier), ADR-003 (key separation), ADR-004
  (deployment topology), sprint scaffold + evidence README.
- **Backend build pipeline** — `packages/backend/tsconfig.json` (strict, outDir `dist`); vitest
  harness; `.env.example` updated to the real contract (adds `OWNER_PRIVATE_KEY`, renames
  `SEPOLIA_EXPLORER`).
- **Hardening** — rate limit on `POST /auth/send-otp` (OTP flood guard); graceful nullifier release
  on failed on-chain submission; `serverError` handling + loading states on Vote/Results/Receipt.
- **Infra manifests** — backend `Dockerfile`, `railway.toml`, `vercel.json`, `procfile`; GitHub
  Actions CI (`ci.yml`) running contract tests + frontend/backend builds on push/PR.
- **Supabase schema as versioned migration** — `supabase/migrations/0000_initial_schema.sql`
  (voters/elections/vote_records/nullifiers + RLS).

### Fixed

- `react-router-dom` added to frontend deps (was imported but never declared → `TS2307` across 7 files).
- `src/vite-env.d.ts` added (fixes 5× `TS2339 import.meta.env` errors).
- Repo cruft removed: hardhat/etherscan/typechain deps stripped from frontend & backend, `vite`/`vitest`
  stripped from contracts, `hardhat` pinned to `^2.22.15` (v3.7.0 did not exist), ethers pinned to `^6.13.4`.
- Frontend type errors fixed: `VoteReceipt.timestamp` field added, unused imports/destructures removed.
- Backend runtime bugs: admin routes now sign owner-gated calls with `OWNER_PRIVATE_KEY` (was relayer →
  would revert `Only owner can call`); receipt handler `electionId` scope bug fixed; receipt/explorer now
  use `SEPOLIA_EXPLORER` env not the web-only `VITE_` var; `@supabase/supabase-js` declared in backend deps.
- `scripts/seed-election.ts` rewritten to the contract's real 6-arg `createElection` signature.
- Backend `test` script no longer `exit 1` (now runs vitest).

### Tests

- Contract: 15 tests green on local hardhat network (deploy, owner-only create/close, relayer-only vote,
  duplicate-nullifier, invalid candidate, started/ended windows, relayer update).
- Backend: unit suite (nullifier determinism/uniqueness, relayer nonce discipline) green via vitest.
- Frontend: `tsc` + `vite build` green (lint clean via `eslint --max-warnings 0`).

### Verified

- `npm run test -w contracts` → 15 passed
- `npm run build -w backend` → emits `dist/`
- `npm run build -w frontend` → `tsc && vite build` green
- `npm run test -w backend` → vitest green
- `npm run lint -w frontend` → 0 errors
- `npm audit` still reports transitive advisories in the hardhat/toolbox chain (no non-breaking fix; see `docs/evidence/`)

### Documented

- `docs/adr/*` (4 ADRs), `docs/sprints/README.md`, `docs/evidence/README.md`, `docs/architecture.md`,
  `docs/current-state.md`.

---

<!-- Baseline: initial MVP scaffold (single commit 10f7531, 2026-09-15) -->