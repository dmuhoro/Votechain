# Evidence: Layer 1 — Runtime Bugs Fixed + Infra Manifests Added

Date: 2026-09-16
Project: VoteChain monorepo

## Scope of changes

### A. Backend runtime bugs (verified via `tsc --noEmit` / full build + test)

| Bug | File | Root cause | Fix |
|-----|------|-----------|-----|
| Owner wallet used for onlyOwner calls | `routes/admin.ts:14-15` | Relayer key signed `createElection`/`closeElection` → would revert on-chain ("Only owner") | Switched to `OWNER_PRIVATE_KEY`; added key to config schema |
| `electionId` not in scope (ReferenceError) | `routes/votes.ts:151` | Refers to undeclared `electionId`; should use `voteRecord.election_id` | Changed to `voteRecord.election_id` |
| `receipt.timestamp` (v5 property) | `routes/votes.ts:169` | ethers v6 `TransactionReceipt` has no `.timestamp`; need block timestamp | Fetch block via `provider.getBlock(receipt.blockNumber)` |
| `process.env.VITE_SEPOLIA_EXPLORER` server-side | `votes.ts:79,170` | Vite-prefixed env var used in backend | Added `SEPOLIA_EXPLORER` to config schema; import from config |
| `ethers.EthersError.UNPREDICTABLE_GAS_LIMIT` | `relayerService.ts:89` | Not a v6 API | Changed to string comparison `error.code === "UNPREDICTABLE_GAS_LIMIT"` |
| `voteChainContract.elections().candidates()` v5-ism | `elections.ts:125`, `votes.ts:152` | Mapping-struct delegate not available in ethers v6 | Rewrite to use `getResults()` (names/parties) |
| `AuthenticatedRequest extends Request` (global DOM) | `votes.ts:14` | Unimported `Request` resolved to lib.dom, not `express.Request` | Added `import { Request } from 'express'` |
| Missing `/auth/callback` route | `App.tsx` + `LoginPage.tsx:26` | Magic link redirects to `/auth/callback` but no route existed | Created `AuthCallbackPage.tsx`; wired route |
| `authStore.initialize` doesn't restore session | `store/authStore.ts:33` | Only reads localStorage token, never calls Supabase `getSession()` | Added `supabase.auth.getSession()` call |
| Unused imports across 6 files | Various `TS6133` | Dead imports left from earlier scaffolding | Removed |

### B. Infra manifests added

| File | Purpose |
|------|---------|
| `packages/backend/Dockerfile` | Multi-stage Node 22 Alpine image |
| `railway.toml` | Railway deploy config with healthcheck |
| `vercel.json` | SPA rewrite for Vite frontend |
| `.github/workflows/ci.yml` | CI: contracts test, backend test+build, frontend lint+build |
| `packages/frontend/.eslintrc.cjs` | ESLint config for eslint 8 + TS + react-hooks |
| `packages/frontend/src/vite-env.d.ts` | Vite `import.meta.env` type declarations |
| `packages/backend/test/` | vitest unit tests (nullifierService) |
| `packages/backend/vitest.config.mts` | Vitest config with env setup file |

## Build + test results

All 5 gates green (same session as 2026-09-16_layer1-dependency-and-gates.md):

| Gate | Command | Result |
|------|---------|--------|
| Contract suite | `npm run test -w contracts` | 20 passing |
| Backend build | `npm run build -w backend` | tsc clean |
| Backend tests | `npm run test -w backend` | 6 passed |
| Frontend build | `npm run build -w frontend` | vite 8.3.0 built |
| Frontend lint | `npm run lint -w frontend` | 0 warnings |

## Not claimed

- This evidence does not prove the backend boots (requires real env vars).
- No live Supabase RLS behavior is exercised.
- No on-chain transaction is executed.