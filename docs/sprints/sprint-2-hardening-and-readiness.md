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
| CI workflow green (quoted hex env fix) | ✅ | 2026-09-16_runtime-bugs-and-infra.md |
| Sepolia deployer = owner (ADR-003) | ✅ | `88499ea` |
| Live Supabase: grants migration applied | ✅ | 2026-09-16_supabase-migration-live.md |
| Infura Sepolia RPC validated + adopted | ✅ | 2026-09-17 evidence |
| Railway backend service staged + domain | ✅ (deploy awaits contract) | Railway dashboard |
| Vercel frontend LIVE | ✅ | https://votechain-ivory.vercel.app |
| Prod Docker image boots (/api/health 200) | ✅ | 2026-09-17 evidence |

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

### Layer 5 — Production provisioning (2026-09-17)

1. **CI workflow fixed (CRITICAL)** — all GitHub Actions runs were instant-failing with
   0 jobs and `404: logs not found`. Root cause: unquoted `0x…` hex strings in `env:`
   blocks (e.g. `RELAYER_PRIVATE_KEY: 0xabcd…`) parse as integers in GitHub's YAML
   validation and reject the file before a single job runs. Fixed by quoting every hex
   env value (`"0x…"`); bumped `actions/checkout` + `actions/setup-node` to `@v5`
   (Node 20 deprecation). Final run: Frontend, Backend, Contracts all green
   (commits `e6a3005`…`e5ce565`).
2. **Hardhat sepolia deployer = OWNER, not relayer** — network account was wired to
   `RELAYER_PRIVATE_KEY`, making deployer == relayer (violates ADR-003). Now uses
   `PRIVATE_KEY` (owner/deployer) and passes `RELAYER_ADDRESS` to the constructor
   (`88499ea`).
3. **Live Supabase migrated** — grants migration `20260916110000` applied via the
   Supabase management API and recorded in `schema_migrations`; REST endpoints verified
   (200) with the anon key. Project `gldfsjoikqydjxcarffr` (eu-west-1, ACTIVE_HEALTHY).
4. **Infura credentials validated + adopted** — user-provided project key verified alive
   on `mainnet` and `sepolia` endpoints (`eth_blockNumber` 200). `SEPOLIA_RPC_URL` in the
   gitignored env now uses `https://sepolia.infura.io/v3/<key>` (replaces PublicNode) for
   the deploy + relayer. No code ships with the key; it lives only in gitignored env files
   and the Railway dashboard.
5. **Railway backend staged** — service `backend` created
   (`ce115af3-a95f-4e3c-95f5-53558fa57220`), provided domain
   `https://backend-production-64d05.up.railway.app`, and all non-contract env set
   (`NODE_ENV`, `PORT`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RELAYER_PRIVATE_KEY`,
   `OWNER_PRIVATE_KEY`, `SEPOLIA_RPC_URL`, `ADMIN_EMAILS`, `SERVER_SECRET`, `OTP_RATE_LIMIT`,
   `CORS_ORIGIN`). Deploy itself waits on the Sepolia contract address (config refuses to
   boot on a placeholder, Article IV.2).
6. **Vercel frontend live** — project linked (`dmuhor01/votechain`), env set via CLI
   (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL), rootDirectory set via REST
   API (the deprecated `vercel.json` property was rejected by the current CLI and
   removed), `vercel.json` moved into `packages/frontend` so SPA rewrites apply.
   **Production: https://votechain-ivory.vercel.app** (200, SPA rewrites OK, bundle bakes
   the Railway + Supabase URLs).
7. **Production Docker image verified boots** — earlier "uncaught exception" during smoke
   test was `EADDRINUSE :::3001` (local backend already bound the port under `--network
   host`). Re-run on `PORT=3999`: `Relayer initialized` → `Server running` →
   `/api/health = 200`.

### Layer 5 — LIVE on Sepolia (completed 2026-09-17)

8. **Hardhat env-load bug fixed (CRITICAL)** — `hardhat.config.ts` read `process.env.SEPOLIA_RPC_URL`
   but nothing loaded `.env`, so every sepolia deploy failed `HH117: Empty string for network or
   forking URL`. Added `import "dotenv/config"` + `dotenv` devDependency (`8646c64`, `dbd2c53`).
9. **Contract deployed + seeded** — owner-deployer `0x5FB9…04e54` (ADR-003), relayer
   `0xdb38…aCb4` passed to constructor. Address `0x672a1D837c5C0992218205b0E81492a07D7C5EB5`,
   election #1 (2027 Presidential) live; window 2026-09-17→24.
10. **Supabase election row created + synced** — Supabase `elections.id=1` mirrors the on-chain
    row (window corrected to match the chain's authoritative times).
11. **Railway deploy corrected** — `railway.json` (Config-as-Code) is deprecated and ignored by
    `railway up` (new services can't opt in); an accidental `railway up` from the unlinked repo
    created a duplicate project (deleted). Replaced with `.railway/railway.ts` IaC
    (`service("backend")` with build `npm run compile -w contracts && npm run build -w backend`,
    start `node packages/backend/dist/index.js`, healthcheck `/api/health`). Deployed → SUCCESS.
12. **Live E2E proven** — probe voter registered, admin-verified via `/api/admin/voters/:id/verify`,
    vote cast → relayer tx `0xb1d3f344…` (block 11724916, SUCCESS) → results show Candidate A: 1;
    duplicate attempt returned HTTP 409. All verified through the public Railway domain.
    Evidence: `docs/evidence/2026-09-17_layer5-live-end-to-end.md`.

## Remaining work (Phase 2 — Sepolia golive, blocked on faucet funding)

Everything below is staged; the only un-done step is funding the two generated wallets
(separate owner + relayer per ADR-003) via a Sepolia faucet:

- [ ] ~~**Faucet claim → owner** wallet `0x5FB9161fAF27E4B41F8A2A8a4bC03b3A10429e54` (≈0.05 SepoliaETH)~~ **DONE** (0.005 SEP via sepolia-faucet-service.vercel.app)
- [ ] ~~**Split script** (`/tmp/opencode/split-funds.mjs`, Infura-backed) → owner keeps
      deploy+seed gas, sends ≈0.45 SEP to relayer wallet `0xdb38aa5c58adA28F1A3c6fBB9CD9110118fDacB4`~~ **DONE** (both funded directly)
- [ ] ~~Deploy contract to Sepolia (`npm run deploy:sepolia -w contracts`) + Etherscan verify~~ **DONE** at `0x672a1D837c5C0992218205b0E81492a07D7C5EB5` (Etherscan verify skipped — no API key; contract readable on-chain)
- [ ] ~~Seed demo election on-chain~~ **DONE** (election #1, "General Election 2027 - Presidential", 3 candidates)
- [ ] ~~Railway deploy (real `CONTRACT_ADDRESS` is the missing env var)~~ **DONE** — contract address + corrected `CORS_ORIGIN` set; deployed via `.railway/railway.ts` IaC
- [ ] ~~Update `CORS_ORIGIN` on Railway to the frontend URL if needed~~ **DONE** → `https://votechain-ivory.vercel.app`
- [ ] ~~End-to-end proof against live URLs (`votechain-ivory.vercel.app` ↔ Railway ↔ Sepolia)~~ **DONE** — register → admin verify → cast → Sepolia tx `0xb1d3f344…` SUCCESS; results show Candidate A: 1; duplicate vote blocked (409)
- [ ] CodeRabbit install (needs user's GitHub click at the install link)
- CodeRabbit install (needs user's GitHub click at the install link)

## CodeRabbit install

```bash
# 1. Install the GitHub App (requires your GitHub authorization)
# Visit: https://github.com/apps/coderabbit/installations/new

# 2. After install, CodeRabbit will automatically review PRs on this repo
# config: coderabbit.yaml (repo root)
```
