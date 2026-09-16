# Sprint 2 — Deployment Readiness + Vote-Path Hardening

## Theme
Make the stack deployable on first try (Layer 3) and harden the vote path against
real failure modes (Layer 4). Deliberately deferred Sepolia on-chain swap (Phase 2)
until the user provides credentials.

## Result
- Docker image builds from scratch and boots with `/api/health = 200`.
- Article II.3 nullifier-burn bug fixed: DB nullifier row is no longer written
  before the on-chain transaction succeeds.
- Contract `"Already voted"` revert mapped to HTTP 409 with explicit message.
- OTP rate limit made env-tunable with conservative default (5/15 min).
- `/api/stats` endpoint returns live counts; landing page shows real data.
- Election, ballot, results pages surface loading/error states.
- Config defaults now work (zod parse result used directly, not discarded).
- Runtime npm audit: zero vulnerabilities (all dev toolchain).
- CodeRabbit config created (install requires user's GitHub click).

## Summary table

| Capability | Status | Evidence |
|------------|--------|----------|
| Docker image builds and boots | ✅ | 2026-09-16_layer3-deployment-readiness.md |
| vercel.json rootDirectory for monorepo | ✅ | 2026-09-16_layer3-deployment-readiness.md |
| Article II.3 nullifier reorder + ON CONFLICT backstop | ✅ | 2026-09-16_layer4-vote-path-hardening.md |
| 409 mapping for "Already voted" contract revert | ✅ | 2026-09-16_layer4-vote-path-hardening.md |
| Config defaults now apply (zod parse result) | ✅ | 2026-09-16_layer4-vote-path-hardening.md |
| OTP rate-limit env-tunable, conservative default | ✅ | 2026-09-16_layer4-vote-path-hardening.md |
| /api/stats endpoint + real landing page stats | ✅ | 2026-09-16_layer4-vote-path-hardening.md |
| Error/loading states (Elections/Ballot/Results) | ✅ | 2026-09-16_layer4-vote-path-hardening.md |
| npm audit: runtime deps clean | ✅ | 2026-09-16_layer4-vote-path-hardening.md |
| CodeRabbit config | ✅ (install pending) | coderabbit.yaml |
| Full 13/13 e2e re-run after Article II.3 fix | ✅ | 2026-09-16_layer4-vote-path-hardening.md |
| Backend unit tests: 8 pass (was 6) | ✅ | `npx vitest run` |

## Key fixes (Sprint 2)

### Layer 3 — Deployment readiness

1. **Dockerfile was broken** — only copied `packages/contracts/contracts` (Solidity
   source) but not `hardhat.config.ts`. Added `COPY packages/contracts packages/contracts`
   so compile succeeds. Removed copy of non-existent `packages/backend/node_modules`
   (workspace hoisting puts deps at root). Created `.dockerignore` to exclude
   node_modules/artifacts/cache.
2. **vercel.json missing rootDirectory** — at repo root, `buildCommand: "npm run build"`
   runs the root build (frontend via workspace), but `outputDirectory: "dist"` resolved
   at root, not at `packages/frontend/dist`. Fixed by adding `rootDirectory: "packages/frontend"`.

### Layer 4 — Vote-path hardening

3. **Article II.3 nullifier burn** — `checkAndStoreNullifier` inserted the DB row BEFORE
   on-chain submission. Split into `checkNullifier` (SELECT only) + `storeNullifier`
   (upsert with `onConflict: 'nullifier_hash', ignoreDuplicates: true`). Order in
   `votes.ts` is now: pre-check → submit on-chain → store nullifier (atomic ON CONFLICT
   backstop) → store vote_record. Failed on-chain transactions no longer burn nullifiers.
4. **On-chain "Already voted" mapped to 409** — `isAlreadyVotedError()` helper detects
   the contract revert string from ethers and returns HTTP 409 with explicit message
   (Article I.6 — no silent drops).
5. **Config zod defaults were dead** — `envSchema.parse(process.env)` was called but
   `process.env` was destructured directly, so all defaults (SEPOLIA_EXPLORER,
   OTP_RATE_LIMIT) never applied. Fixed to destructure the parse result.
6. **OTP rate limit env-tunable** — `OTP_RATE_LIMIT` env var with default `5` per 15 min
   (Article IV.4 — conservative default). Local e2e sets `100` in gitignored `.env`.
7. **Landing page stats from API** — new `/api/stats` endpoint; stats section shows real
   counts with loading skeleton and graceful error fallback.
8. **Error/loading states** — ElectionsPage spinner + retry; BallotPage surfaces useVote
   error; ResultsPage shows error + retry button.
9. **npm audit** — runtime deps clean. 45 remaining vulns all in dev toolchain
   (hardhat line, solidity-coverage, react-router-dom major, undici). Deliberately
   descoped per Article VIII.3.

## Remaining work (Phase 2 — deferred until user provides credentials)

- Deploy contract to Sepolia (needs user's private key + funded relayer wallet ≥0.1 ETH)
- Railway deploy (needs live Supabase keys + Sepolia RPC + Etherscan key in Railway env)
- Vercel deploy (needs Vercel project linked, VITE_API_URL set to Railway backend URL)
- CodeRabbit install (needs user's GitHub click at the install link)

## CodeRabbit install

```bash
# 1. Install the GitHub App (requires your GitHub authorization)
# Visit: https://github.com/apps/coderabbit/installations/new

# 2. After install, CodeRabbit will automatically review PRs on this repo
# config: coderabbit.yaml (repo root)
```
