# VoteChain — State Audit & Deployment Gap Analysis

> **Date:** 2026-09-15
> **Git state:** Single commit `10f7531 feat: initial VoteChain MVP scaffold` on `main`
> **Repo root:** `/home/daniel-muhoro/workspace/projects/votechain`

---

## 1. Current Build Health

### Frontend (React + Vite + TypeScript)

**Build: FAILS.** `npm run build` (`tsc && vite build`) produces **16 TypeScript errors**:

| Error | Files | Root Cause |
|-------|-------|------------|
| `TS2307: Cannot find module 'react-router-dom'` | 7 files (App, all pages) | `react-router-dom` is **not installed** — not in `package.json` deps, not in `node_modules` |
| `TS2339: Property 'env' does not exist on 'ImportMeta'` | 3 files (api.ts, supabase.ts, ResultsPage.tsx) | No `src/vite-env.d.ts` file — standard Vite type shim is missing |
| `TS6133: 'formatDate' declared but never read` | ElectionCard.tsx | Unused import |
| `TS6198: All destructured elements are unused` | LoginPage.tsx | Dead destructure |
| `TS2339: Property 'timestamp' does not exist on type 'VoteReceipt'` | ReceiptPage.tsx:94 | Type mismatch — `VoteReceipt` interface has no `timestamp` field |

**Verdict:** The frontend cannot compile at all. The `react-router-dom` missing dependency is the primary blocker; the rest are type-safety issues that `strict: true` correctly catches.

### Backend (Express + TypeScript)

**Build: FAILS.** `npm run build` runs bare `tsc`, which **prints help and exits 1** because `packages/backend/tsconfig.json` does not exist. There is no TypeScript config for the backend at all — despite `build: tsc` and `start: node dist/index.js` in the scripts.

**Additional compile blockers** (would surface once tsconfig exists):
- `ethers` v5.8.0 is installed but all code uses **ethers v6 APIs** (`JsonRpcProvider`, `EthersError.UNPREDICTABLE_GAS_LIMIT`, `new Interface(...)`, etc.). The backend will crash at runtime.
- `@supabase/supabase-js` is not declared as a dependency — resolves only by accident via workspace hoisting from the frontend's copy.
- Hardhat-related deps (`@nomicfoundation/hardhat-toolbox`, `@nomiclabs/hardhat-etherscan`, `vite`, `vitest`) are listed in the backend's `package.json` — clearly copy/paste from the contracts package.

### Smart Contracts

**Compile: UNTESTED** (no `artifacts/`, `cache/`, or `typechain-types/` directories exist). The `hardhat compile` command hasn't been run. The backend imports artifacts at `../../contracts/artifacts/contracts/VoteChain.sol/VoteChain.json`, so the backend literally cannot start without compiled artifacts.

### npm audit

```
59 vulnerabilities (17 low, 18 moderate, 24 high)
```

Notable unfixable/high-severity items:
- `hardhat` → `adm-zip` (high, no fix available)
- `elliptic` (no fix)
- `undici` (high, no fix)
- `ws` via `@ethersproject/providers` (fix requires ethers v6 upgrade)
- `serialize-javascript` / `bn.js` (fix requires `solidity-coverage` major bump)
- `axios` (high, fix available via upgrade)

### Local dev setup

- `.env.example` files exist in all 3 packages — **accurate for their respective packages**.
- No actual `.env` files committed (correctly gitignored).
- **README (`LOCAL_SETUP.md`) won't work** as-is because `npm run build` and `npm run dev` both fail due to the issues above.
- No `docker-compose` files exist.
- The `supabase_migrations.sql` file exists at repo root but there are **no instructions** on how to apply it (no Supabase CLI setup, no migration directory, no seed script guidance).

---

## 2. Smart Contract Status

### What's deployed on Sepolia

**Nothing.** Evidence:
- No `deployments/` directory (the deploy script would create it, but it hasn't run).
- No `.env` files with a `CONTRACT_ADDRESS` containing a real `0x...` address.
- No contract address referenced anywhere in the codebase — only `deployed_contract_address` placeholders in `.env.example`.
- No `artifacts/` directory — the contract has never been compiled locally either.

### What's in the Hardhat config

- `hardhat` (default in-memory network)
- `localhost` (http://127.0.0.1:8545)
- `sepolia` — configured with `SEPOLIA_RPC_URL` and `RELAYER_PRIVATE_KEY` from env. **Ready to deploy once env vars are set.**

### Relayer pattern implementation status

**Fully implemented in code, untested end-to-end.** The chain is:

1. Frontend → `POST /api/votes/cast` (authenticated, verified voter)
2. Backend `nullifierService` → generates deterministic SHA-256 nullifier, checks/inserts into Supabase `nullifiers` table
3. Backend `relayerService` → submits `castVote(electionId, candidateId, nullifier)` to the on-chain contract via the relayer wallet
4. Backend inserts `vote_records` row into Supabase
5. Returns `txHash`, `blockNumber`, `explorerUrl` to frontend

The relayer service includes nonce management with force-refresh, 3-attempt retry with 2s backoff, and 20% gas buffer. The contract's `castVote` is `onlyRelayer` — voters never need MetaMask. This is architecturally complete.

### Nullifier-tracking logic

**Fully implemented, with known race condition.**
- On-chain: `mapping(bytes32 => bool) nullifiers` per election, checked in `castVote` modifier.
- Off-chain: `checkAndStoreNullifier` does SELECT then INSERT into Supabase `nullifiers` table. The DB `UNIQUE` constraint is the backstop, but two concurrent requests for the same voter can both pass the SELECT (TOCTOU race). The INSERT would fail for the second, but the error message is generic.
- **Known gap (acknowledged in code comments):** If `checkAndStoreNullifier` succeeds but the on-chain tx fails, the nullifier is permanently burned — the voter can never vote in that election. There's no rollback mechanism.

### TODOs / mock / placeholder / broken logic

| Issue | Severity | Location |
|-------|----------|----------|
| `seed-election.ts` calls `createElection(title, description, candidates, duration)` — a **4-arg signature that doesn't match the contract's 6-arg signature** (`title, description, string[], string[], uint, uint`). Will compile-error. | High | `scripts/seed-election.ts` |
| `hardhat ^3.7.0` — this version **does not exist**. Hardhat stable is 2.x. The published latest is 2.22.x. The `^3.7.0` in package.json may resolve to nothing or an incompatible prerelease. | Critical | All 3 `package.json` files |
| `admin.ts` uses the **relayer wallet** for `createElection` and `closeElection` — but the contract's `createElection` is `onlyOwner`, not `onlyRelayer`. The deployer/owner and relayer are different addresses. Admin election creation will revert with "Only owner can call this function". | Critical | `routes/admin.ts:37` |
| `votes.ts` receipt handler (line 151) references `electionId` which is out of scope — `voteRecord.election_id` is used elsewhere but `electionId` is the destructured request param from a different handler. Will throw `ReferenceError` at runtime. | High | `routes/votes.ts:151` |
| `votes.ts` returns HTTP 200 with a success message even when the Supabase `vote_records` insert fails. The voter sees success but the audit trail is broken. | Medium | `routes/votes.ts:73` |
| `VITE_SEPOLIA_EXPLORER` env var used server-side in `votes.ts` but not in backend `.env.example`. The `explorerUrl` will be `undefined/tx/{hash}`. | Medium | `routes/votes.ts:81` |
| Contract tests import `VoteChain` type from `../typechain-types` which doesn't exist (never compiled). Tests will fail. | High | `test/VoteChain.test.ts:4` |

---

## 3. Supabase / Voter Identity Layer

### Is it wired to a live instance?

**No.** The code is structurally complete but connects to nothing:
- `supabase_migrations.sql` exists at repo root but there are **no instructions or tooling** to apply it.
- No Supabase project URL or keys are configured (only placeholders in `.env.example`).
- The backend creates a Supabase client with the **service role key** (full admin access) — this is correct for a backend service but means the backend bypasses all RLS.
- The frontend uses the **anon key** — correct for client-side, but RLS policies must be properly configured for this to be secure.

### Auth / access-control gaps

| Gap | Risk | Detail |
|-----|------|--------|
| `protect` middleware calls `supabase.auth.getUser(token)` — this is the correct pattern for Supabase JWT validation | Low | Properly implemented |
| `adminProtect` checks `ADMIN_EMAILS` from env — simple but effective for a demo | Low | Fine for demo; no role table |
| **Two separate Supabase clients** created with service role key (one in `supabaseService.ts`, one in `authMiddleware.ts`) | Low | Wasteful, not a security issue |
| `protect` middleware has **non-returning error paths** — if `authorization` header is missing, the code falls through to `if (!token)` which sends a response but doesn't `return`, so `next()` could theoretically be called after the response | Medium | Express will send "headers already sent" error |
| `authMiddleware.ts` imports `jsonwebtoken` but never uses it — JWT verification is delegated to Supabase's `getUser` | Low | Dead dependency |
| **No rate limiting** on auth endpoints — `send-otp` could be abused for email flooding | Medium | Not critical for demo |
| RLS on `vote_records` is `USING (true)` — anyone (even anon) can read all vote records including nullifier hashes. This is **by design** for audit transparency but means nullifier hashes are public. | Low | Acceptable for demo |

---

## 4. Test Coverage

### Contract tests

**1 file, ~270 lines.** `packages/contracts/test/VoteChain.test.ts` covers:
- Deployment (owner, relayer, electionCount)
- Election creation (owner-only, invalid times)
- Voting (relayer-only, duplicate nullifier, invalid candidate, not-started, ended)
- Election closing (owner-only, already-closed, votes-after-close)
- Results and details (correct data, relayer update)

**Status:** Will not run — imports `VoteChain` from `../typechain-types` which doesn't exist, and `hardhat ^3.7.0` may not resolve. Once dependencies are fixed and contracts compiled, these tests look structurally sound.

### Backend tests

**Zero.** `packages/backend/package.json` test script is literally:
```json
"test": "echo \"Error: no test specified\" && exit 1"
```

No test files exist. No test framework is configured. The critical vote-casting path, nullifier logic, auth middleware, and admin flows are all untested.

### Frontend tests

**Zero.** `vitest` is in devDependencies and `test: vitest` is in scripts, but:
- No `.test.ts` / `.test.tsx` / `.spec.ts` files exist
- No `vitest.config.ts` exists
- No `__tests__/` directories

### Summary

| Layer | Tests exist? | Pass? | What's covered |
|-------|-------------|-------|----------------|
| Contracts | Yes (1 file) | No (dep issues) | Core contract logic thoroughly |
| Backend | No | N/A | Nothing |
| Frontend | No | N/A | Nothing |

---

## 5. Gap-to-Deployable-Demo

Target: **Public, shareable Sepolia-testnet demo URL.** Not production-grade. Not audited. Just: a stranger can visit, register, vote, see results on-chain.

### P0 — Blocks any working demo

| # | Task | Evidence | Est. |
|---|------|----------|------|
| 1 | **Fix `hardhat` version** — pin to `^2.22.0` (stable) in contracts `package.json`. Current `^3.7.0` likely resolves to nothing or broken prerelease. | All `package.json` files | 15 min |
| 2 | **Install `react-router-dom`** in frontend package — currently not declared or installed. Frontend won't compile without it. | 7 TS2307 errors | 5 min |
| 3 | **Add `src/vite-env.d.ts`** with `/// <reference types="vite/client" />` — fixes 5 `import.meta.env` type errors. | TS2339 errors | 2 min |
| 4 | **Create `packages/backend/tsconfig.json`** — without it `tsc` just prints help. Need at minimum `{ "compilerOptions": { "target": "ES2020", "module": "commonjs", "outDir": "./dist", "rootDir": "./src", "esModuleInterop": true, "strict": true, "resolveJsonModule": true }, "include": ["src"] }`. | Backend build failure | 10 min |
| 5 | **Fix ethers version mismatch** — backend code uses ethers v6 APIs (`JsonRpcProvider`, `EthersError`, `Interface`) but `package.json` declares `^5.8.0`. Either upgrade to ethers v6 (breaking API changes) or rewrite backend to use ethers v5 API. **Recommended: upgrade to ethers v6** and update the contract artifact import. | Runtime crash | 30 min |
| 6 | **Compile the smart contract** (`hardhat compile`) and verify `artifacts/` are generated. Backend imports them at module level. | Missing artifact files | 5 min |
| 7 | **Create a Supabase project**, apply `supabase_migrations.sql`, configure RLS policies, and set env vars. No live Supabase = no auth, no nullifier tracking, no election storage. | No Supabase project exists | 30 min |
| 8 | **Deploy contract to Sepolia** — fund a relayer wallet with Sepolia ETH, set env vars, run `deploy:sepolia`. No contract on any network = no voting. | No deployed addresses | 20 min |
| 9 | **Set all `.env` files** with real values (Supabase URL/keys, Sepolia RPC URL, relayer private key, contract address, server secret, admin emails, CORS origin). | No `.env` files exist | 15 min |
| 10 | **Fix `admin.ts` owner vs relayer bug** — admin route uses `relayerWallet` for `createElection` but the contract requires `msg.sender == owner`. Either use the deployer wallet for admin ops or add an `admin` role to the contract. | `routes/admin.ts:37`, contract `onlyOwner` | 20 min |
| 11 | **Fix `votes.ts` receipt `electionId` ReferenceError** — `electionId` is out of scope at line 151. Replace with `voteRecord.election_id`. | `routes/votes.ts:151` | 5 min |
| 12 | **Fix `VITE_SEPOLIA_EXPLORER` env var leak** — add `SEPOLIA_EXPLORER` to backend `.env.example` and use `process.env.SEPOLIA_EXPLORER` in `votes.ts`. | `routes/votes.ts:81` | 5 min |
| 13 | **Fix missing `react-router-dom` type errors in AdminPage, BallotPage, etc.** — covered by #2 above. | 7 TS2307 errors | (included in #2) |
| 14 | **Wire auth callback route** — `LoginPage.tsx` sends magic link redirect to `/auth/callback` but no such route exists in `App.tsx`. Need to add a callback route that extracts the Supabase auth token from the URL hash and stores it. | `LoginPage.tsx:26`, `App.tsx` | 30 min |
| 15 | **Populate user state after login** — `authStore.initialize()` only restores the token, not the user object. After magic-link redirect, the user is "authenticated" but `user` is null. Need to call `GET /api/auth/me` with the token and populate the store. | `authStore.ts`, `AdminPage.tsx` | 20 min |
| 16 | **Add missing `@supabase/supabase-js` to backend `package.json`** — currently resolves by hoisting accident from the frontend's copy. | `services/supabaseService.ts`, `middleware/authMiddleware.ts` | 2 min |
| 17 | **Remove dead deps from backend** — `vite`, `@nomicfoundation/hardhat-toolbox`, `@nomiclabs/hardhat-etherscan`, `@typechain/hardhat` don't belong in the backend. | `packages/backend/package.json` | 5 min |
| 18 | **Remove dead deps from frontend** — `ethers`, `hardhat`, `@nomicfoundation/hardhat-toolbox`, `@nomiclabs/hardhat-etherscan`, `@typechain/hardhat` don't belong in the frontend. | `packages/frontend/package.json` | 5 min |
| 19 | **Fix `ReceiptPage.tsx` type error** — `receipt.timestamp` doesn't exist on `VoteReceipt`. Either add `timestamp` to the interface or remove the reference. | `ReceiptPage.tsx:94` | 5 min |
| 20 | **Fix unused variable TS errors** — `ElectionCard.tsx` unused `formatDate` import, `LoginPage.tsx` unused destructure. | TS6133, TS6198 | 5 min |
| 21 | **Set up backend hosting** — the backend (Express API) needs to be hosted somewhere accessible (Railway, Render, Fly.io, etc.) for a public demo. Currently only runs locally. | No hosting config | 1 hr |
| 22 | **Set up frontend hosting** — deploy `dist/` to Vercel/Netlify/Cloudflare Pages with env vars configured. | No hosting config | 30 min |
| 23 | **Configure CORS for production** — backend `CORS_ORIGIN` must point to the deployed frontend URL, not `http://localhost:5173`. | `.env.example` | 5 min |
| 24 | **Seed a demo election** — after deploy, create an election via admin panel or fix `seed-election.ts` (currently has signature mismatch with contract). | `scripts/seed-election.ts` | 15 min |

**P0 total estimated effort: ~7–8 hours of focused work.**

### P1 — Needed for a credible portfolio demo

| # | Task | Est. |
|---|------|------|
| 1 | Fix `protect` middleware non-returning paths (add `return` before error responses) | 10 min |
| 2 | Add rate limiting to auth endpoints (e.g., `express-rate-limit`) | 30 min |
| 3 | Fix the nullifier TOCTOU race — use a DB transaction or `INSERT ... ON CONFLICT DO NOTHING` with a check on the affected row count | 30 min |
| 4 | Add a revert/cleanup mechanism when on-chain tx fails after nullifier is stored | 1 hr |
| 5 | Fix `seed-election.ts` to match contract's actual `createElection` signature | 15 min |
| 6 | Add basic backend tests (at minimum: vote casting happy path, double-vote rejection, auth middleware) | 3 hrs |
| 7 | Add `vite-env.d.ts` for proper `import.meta.env` typing in frontend | 2 min |
| 8 | Clean up dead code: `formatDate`/`formatTime` imports, `AuthSession` type, unused `jwt` import, empty `src/ui/` dir | 15 min |
| 9 | Populate `LandingPage` stats from API instead of hardcoded zeroes | 30 min |
| 10 | Add loading/error states to all pages (many pages have no error boundary) | 1 hr |
| 11 | Add Etherscan "View on Explorer" link to contract address on the landing page or elections page | 15 min |
| 12 | Fix ethers v5/v6 mismatch in contract tests (tests use `ethers.keccak256`, `ethers.toUtf8Bytes` — v6 API, but tests run under Hardhat which may provide its own ethers) | 30 min |

**P1 total: ~7 hours.**

### P2 — Nice-to-have

- Frontend test suite (vitest + React Testing Library)
- E2E tests (Playwright or Cypress for full voting flow)
- Transaction gas cost estimation display in the ballot UI
- Multiple simultaneous elections support testing
- Admin dashboard with voter count graphs
- Dark mode toggle
- Mobile-responsive optimization
- Accessibility audit (WCAG 2.1 AA)
- Rate limiting on vote submission
- Admin notification when a voter registers
- Etherscan badge / verified contract display

---

## 6. Time Estimate (P0 Only)

**Honest range: 6–10 hours of focused, sequential build time.**

Breakdown of the critical path:

| Phase | What | Hours |
|-------|------|-------|
| **Fix the build** | Install missing deps, fix versions, create tsconfig, fix ethers mismatch, add vite-env.d.ts, fix type errors | 1.5–2 |
| **Infrastructure** | Create Supabase project, apply migrations, deploy contract to Sepolia, fund relayer wallet | 1–2 |
| **Wire the app** | Set env vars, fix auth callback, wire user state, fix admin owner bug, fix receipt bug | 1.5–2 |
| **Deploy** | Host backend (Railway/Render), host frontend (Vercel/Netlify), configure CORS, seed demo election | 1.5–2 |
| **Polish** | Fix remaining TS errors, clean dead deps, verify end-to-end flow | 0.5–1 |

**Biggest risk:** The ethers v5→v6 migration in the backend. If the backend code needs significant rewrites to work with ethers v5 (the installed version), add 1–2 hours. The cleanest path is upgrading to ethers v6 everywhere and updating the Hardhat toolchain accordingly.

**Second biggest risk:** The `hardhat ^3.7.0` version — if this doesn't resolve to anything, the entire contracts package toolchain needs version pinning, which could cascade into other dep conflicts.

---

## Overall Gap Assessment

### Where the project actually stands

This is a **well-architected scaffold** with a clear vision: meta-transaction voting where voters never need crypto wallets, backed by on-chain nullifier tracking and off-chain Supabase identity management. The code structure is clean, the component organization is logical, and the relayer pattern is correctly designed.

**However, it's a scaffold that has never been run.** The single git commit is labeled "initial MVP scaffold" and that's exactly what it is. Nothing compiles. Nothing deploys. No infrastructure exists. The code has multiple runtime bugs that would surface even if the build issues were fixed.

### The real distance to a working demo

The gap is **medium-sized but well-defined**. This isn't a "needs a rewrite" situation — it's a "needs someone to actually run it, fix what breaks, and deploy it" situation. The architecture is sound. The code is ~80% correct. The remaining 20% is:

1. **Build plumbing** (missing deps, wrong versions, missing configs) — tedious but straightforward
2. **Infrastructure** (Supabase project, Sepolia deployment, hosting) — requires external account setup, not code changes
3. **Runtime bugs** (ethers version mismatch, admin owner/relayer confusion, receipt variable scope) — each individually small, but collectively blocking

### The 80/20 compression

Using the 80/20 principle, the **single highest-leverage action** is:

> **Fix the build, deploy the contract, create the Supabase project, and host the backend+frontend — then test end-to-end and fix what breaks in the live environment.**

Specifically:
- **20% of the work** (fixing ~10 config/dependency issues + deploying infrastructure) will get you **80% of the way** to a working demo
- The remaining **80%** (polish, tests, error handling, race conditions, rate limiting) covers the **last 20%** of demo quality

The fastest path to a working demo is:
1. Fix `hardhat` version → `2.22.x` (15 min)
2. Install `react-router-dom` (2 min)
3. Add `vite-env.d.ts` (2 min)
4. Create backend `tsconfig.json` (10 min)
5. Upgrade ethers to v6 in backend OR downgrade APIs to v5 (30 min)
6. Compile contracts (5 min)
7. Create Supabase project + apply SQL (30 min)
8. Deploy to Sepolia (20 min)
9. Set all env vars (15 min)
10. Fix the 3 runtime bugs (admin owner, receipt scope, explorer URL) (30 min)
11. Add auth callback route + wire user state (50 min)
12. Deploy backend + frontend (1.5 hr)
13. Seed demo election + smoke test (30 min)

**Total: ~6 hours to a live, shareable Sepolia demo.**
