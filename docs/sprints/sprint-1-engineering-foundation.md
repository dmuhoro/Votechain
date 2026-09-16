# Sprint 1 — Engineering Foundation + Deployment Readiness

## Theme
Turn the VoteChain monorepo from "scaffold that never built" into a deployable,
gate-checked stack: dependency alignment, green build/tests, real infrastructure
manifests, and honest engineering evidence.

## Result
- All five quality gates pass (contracts, backend build/test, frontend build/lint).
- 20 contract tests, 6 backend unit tests green.
- Every package now builds painlessly from `npm install` at the root.
- Infra manifests for Railway + Vercel + GitHub Actions CI added.

## Summary table

| Capability | Status | Evidence |
|------------|--------|----------|
| Monorepo dependency alignment (ethers v6, hardhat 2.x) | ✅ | 2026-09-16_layer1-dependency-and-gates.md |
| Contract compile + 20-test suite | ✅ | 2026-09-16_layer1-dependency-and-gates.md |
| Backend build + 6 unit tests | ✅ | 2026-09-16_layer1-dependency-and-gates.md |
| Frontend build + lint (0 warnings) | ✅ | 2026-09-16_layer1-dependency-and-gates.md |
| Vote-path runtime bugs fixed | ✅ | 2026-09-16_runtime-bugs-and-infra.md |
| Dev/CI infra present (Railway, Vercel, Actions) | ✅ | 2026-09-16_runtime-bugs-and-infra.md |
| Live Supabase schema verified + migration tracked | ✅ | 2026-09-16_supabase-migration-live.md |
| Local End-to-End vote path proven (13/13) — Layer 2 | ✅ | 2026-09-16_layer2-local-vote-path.md |

## Part sections

### Work-stream 1 — Dependency alignment

**Root cause:** The original manifest pinned `hardhat@^3.7.0` + `ethers@^5.8.0`
everywhere. `@nomicfoundation/hardhat-ethers@3.1.3` requires `ethers ^6.14.0` +
`hardhat ^2.28.0`, and the backend already used the ethers v6 API — so the two
bundles were irreconcilable. Separately, `hardhat-toolbox@7.x` is a Hardhat-3
migration shim that exits immediately under Hardhat 2; the `hh2` tag (`6.1.2`)
is the correct line.

**Solution:** Pin `hardhat ^2.28.0`, `ethers ^6.14.0`, `hardhat-toolbox 6.1.2`,
add `@vitejs/plugin-react@^6.1.1` (vite-8 compatible), add backend
`@supabase/supabase-js`, `express-rate-limit`, `vitest`. Add a backend
`tsconfig.json`, `vite-env.d.ts`, and an artifact-sync script to keep
`rootDir=src` clean.

**Files:** `packages/contracts/package.json`, `packages/backend/package.json`,
`packages/frontend/package.json`, `packages/contracts/tsconfig.json`,
`packages/backend/tsconfig.json`, `packages/frontend/src/vite-env.d.ts`,
`packages/backend/scripts/sync-artifact.mjs`.

### Work-stream 2 — Real vote-path bugs

**Root cause:** Contract scripts and backend routes were written against ethers
v5 / an older ABI: 4-arg `createElection` call in `seed-election.ts`,
`ethers.network.name`, `receipt.timestamp`, `voteChainContract.elections()
.candidates()` mapping delegates, and `ethers.EthersError` — none exist in v6.
Critically, admin routes signed `onlyOwner` calls with the relayer key (an
ADR-003 violation that would revert every admin action on-chain).

**Solution:** Rewrote the v5-isms to the v6 API, moved owner-only admin writes to
`OWNER_PRIVATE_KEY`, fixed the out-of-scope `electionId` in `votes.ts`, switched
explorer URLs to `SEPOLIA_EXPLORER` from config, added the `/auth/callback`
route and session restore in `authStore.initialize`.

**Files:** `packages/contracts/scripts/seed-election.ts`,
`packages/contracts/scripts/deploy.ts`, `packages/backend/src/routes/admin.ts`,
`packages/backend/src/routes/votes.ts`, `packages/backend/src/routes/elections.ts`,
`packages/backend/src/config/index.ts`,
`packages/backend/src/services/relayerService.ts` (error-code check),
`packages/frontend/src/pages/AuthCallbackPage.tsx`,
`packages/frontend/src/store/authStore.ts`.

### Work-stream 3 — Infra + CI

**Solution:** Backend `Dockerfile` (multi-stage, hardhat-compile inside build),
`railway.toml` (health-check `/api/health`, restart policy), `vercel.json` SPA
rewrite for the Vite frontend, and a `.github/workflows/ci.yml` that runs all
five gates on every push/PR.

**Files:** `packages/backend/Dockerfile`, `railway.toml`, `vercel.json`,
`.github/workflows/ci.yml`.

## Verification Evidence

| Suite | Target | Result | Status |
|-------|--------|--------|--------|
| Contract tests | `packages/contracts` | 20 passing | ✅ |
| Backend unit | `packages/backend` | 6 passing | ✅ |
| Backend build | `tsc dist/` | exit 0 | ✅ |
| Frontend build | `vite build` | success | ✅ |
| Frontend lint | `eslint --max-warnings 0` | 0 warnings | ✅ |
| TSC (contracts) | `tsc --noEmit` | exit 0 | ✅ |

## Status checklist

- [x] Root `npm install` resolves clean without `--force`
- [x] `npm run test -w contracts` green (20)
- [x] `npm run build -w backend` green
- [x] `npm run test -w backend` green (6)
- [x] `npm run build -w frontend` green
- [x] `npm run lint -w frontend` green (0 warnings)
- [x] Vote-path runtime bugs fixed and typechecked
- [x] Infra manifest files created
- [x] CI workflow exists (not yet run remotely)

## Honest boundaries / Next steps

- **Proven:** live end-to-end vote path works against the **local** stack (OTP
  auth → registration → admin-verified → on-chain election → relayer cast →
  receipt → double-vote blocked at both boundaries), 13/13 PASS.
- **Not yet proven:** Sepolia — no contract deployed to testnet, no hosted
  backend/frontend, no live smoke test. CI has not run on GitHub.
- **Next (Sprint 2 → Sprint 2 file):** Deployment readiness (Dockerfile fix, vercel.json)
  + vote-path hardening (Article II.3 nullifier reorder, 409 mapping, error states,
  /api/stats). Sepolia deploy deferred to last (needs user credentials).
- **Credentials held by the user** (live anon/service-role keys, Sepolia RPC,
  relayer & owner keys, Etherscan key) are required before the live-deploy steps.
  Grants migration is manual-applied on live (20260916110000).