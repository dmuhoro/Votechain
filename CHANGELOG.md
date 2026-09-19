
## [1.2.1] — 2026-09-19

### Fixed

- **Verified/admin flags were never loaded in the frontend.** A Supabase session proves identity but
  does not carry `is_verified`/`is_admin`, and nothing called the existing `GET /api/auth/me`; both
  `AuthCallbackPage` and `authStore.initialize` hardcoded them to `false`. Every user was treated as
  unverified, which **disabled the dialer's Bind phone action** (`DialerPage`) and hid/blocked the
  Admin surface (`MobileBottomNav`, `AdminPage`). Added `lib/auth.getProfile()` + `toVoter()` and
  hydrate on both sign-in paths; new `lib/auth.test.ts` (2 tests).

### Verified (on-device, physical Android)

- Full dialer flow from the phone UI: bind `+254700009920` → PIN `504864` →
  `VOTE 1 1 504864` → receipt `V0B30046FCCB4` verified in-app; Sepolia `VoteCast` block
  **11737270**; replay → `no_active_code`. Evidence:
  `docs/evidence/2026-09-19_dialer-ondevice-and-profile-hydration.md`.
- Gates: contracts `20/20`; backend build clean + `53/53`; frontend build clean + lint `0 warnings`
  + `28/28`.

---

## [1.2.0] — 2026-09-19

### Sprint 5 — Feature-Phone Dialer Reachability (ADR-009)

#### Added

- **Dialer vote intake** — `POST /api/dialer/sms` (carrier-gateway webhook shape) parses
  `VOTE <electionCode> <candidateId> <pin>` and `RECEIPT <voteCode>`, then runs the **same**
  `voteService.castVote` as online/offline — nullifier (boundary a) → relayer → chain
  (boundary b) → `vote_records`. No second counting authority (Constitution Article II).
- **One-time 6-digit auth PIN** — CSPRNG, SHA-256 digest stored, one active per (voter, election)
  enforced by a partial unique index, expiring with the election; rotates in place when lost and
  refuses after the vote is consumed. `POST /api/dialer/codes`, `GET|POST /api/dialer/phone`.
- **Receipt codes** — `vote_records.vote_code` is a STORED generated column
  (`V` + first 12 hex of the tx hash), so it can never drift; `RECEIPT` SMS and
  `GET /api/dialer/receipts/:code` verify a vote with no voter identity.
- **Audit** — every inbound command writes an explicit outcome to `sms_intake_log` (no silent
  drops, Article I.6).
- **Gateway seam** — `SmsGateway` interface + `SimulatedSmsGateway` default; Twilio / Africa's
  Talking are explicit stubs that throw until configured. Physical delivery is honestly gated on
  a carrier subscription + credits.
- **Frontend `/dialer`** — bind a phone, provision a one-time PIN, copy the exact SMS command, and
  verify a vote by receipt code; wired into routes and the mobile bottom nav.
- **Migration** — `20260919090000_dialer_sms.sql` applied to prod Supabase (`voters.phone_number`,
  `elections.dial_code`, `dialer_codes`, `sms_intake_log`, `vote_records.vote_code`, RLS).

#### Verified

- Live drill on the deployed backend: `VOTE 1 1 246810` → `voted`, receipt `V2E6A8BBA1009`, tx
  `0x2e6a8bba…8295`, block **11737079**, `VoteCast(uint256,uint256,bytes32)`; PIN rotated and
  replayed → `duplicate`, no second transaction.
- Contracts `20/20`; backend build clean + `53/53`; frontend build clean + lint `0 warnings`
  + `26/26`. Deployed: Railway `1e4bdc1e`, Vercel `votechain-ivory.vercel.app`.
- Evidence: `docs/evidence/2026-09-19_dialer-sms-migration.md`,
  `docs/evidence/2026-09-19_dialer-sms-live-drill.md`.

#### Known boundaries

- Physical SMS/USSD radio delivery requires a carrier gateway subscription + credits — the intake
  and vote path are live and proven; only the radio hop is pending procurement.

---

## [1.1.0] — 2026-09-18

### Sprint 4 — Offline Ballot Capture (ADR-008, full device pass)

- **Device PASS (physical Android)** — signed voucher issued → airplane-on
  capture (device vault only) → reconnect auto-submit → server voucher
   → VotedCast on Sepolia (block 11731807). Full evidence:
  docs/evidence/2026-09-18_sprint4-offline-device-pass.md
- supabase migration  (voucher table + RLS,
  applied)
- backend offline ballot service + routes (,
  ) — shared cast path (ADR-008 Layer 1)
- frontend offline vault + OfflineSync global mount (auto-submit on
  reconnect from any page) + BallotPage first-capture signed-voucher fix

# Changelog

> All notable changes to VoteChain. Follows
> [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) conventions. Newest first.

---

## [1.1.0] — 2026-09-18

### ADR-008 — Offline ballot capture (full device pass)

- Physical-device **PASS** (Sprint 4, Sprint-4-offline-device-pass evidence): route captured offline offline via voucher first-capture, auto-submit on reconnect, server voucher `consumed`, Relaychain `VotedCast(tx 0x41264…)` on Sepolia.
- Global `OfflineSync` mount so reconnect auto-sync runs from any page.

## [Unreleased]

### Sprint 3 — Mobile-First Anti-Fragility (Smart-Phone PWA)

#### Added

- **Installable Android PWA** — `vite-plugin-pwa` (devDep, build-time) with workbox
  `generateSW`: 19-entry app-shell precache, `navigateFallback` to `/index.html`,
  navigateFallbackDenylist for `/api/*`, and a runtime cache for **read-only GET**
  `/api/*` paths (NetworkFirst, 5 s timeout, 7-day expiry). The `isApiReadOnlyRequest`
  matcher is self-contained (workbox stringifies it), excludes same-origin + dev server
  (an HTML shell can never masquerade as a JSON API response), and never matches
  vote/admin writes — writes are network-only (`66e2b3e`).
- **PWA assets** — `icon.svg` → 192/512/maskable/apple images + favicon (was a 404),
  manifest (standalone display, theme/background colors), `viewport-fit=cover`,
  `theme-color`, `apple-mobile-web-app` meta; `registerSW({ immediate: true })`.
- **Anti-fragility core** — top-level `ErrorBoundary` (recovery card, no blank
  Android screen), `lib/storage.ts` safe-storage wrapper (private-mode WebView can't
  white-screen the app), hardened `lib/api.ts` (15 s timeout, retry-once for idempotent
  GETs skipped while offline, typed `ApiError` offline/timeout/http/network/aborted,
  `toErrorMessage`, 401 routed via `votechain:unauthorized` event instead of a hard
  reload), lazy Supabase client (module-scope env throw removed), `authStore.initialize`
  try/catch/finally, `AuthCallbackPage` 20 s timeout + error card, `networkStore` +
  `useNetworkStatus` + global `OfflineBanner`, `useResults` polling pause while
  hidden/offline with overlap/abort guard.
- **Mobile-first UI** — `PageShell` (shared chrome + per-route titles), `MobileBottomNav`
  (Home/Elections/Admin, 44 px targets, safe-area), `Button` fixes (`type="button"`
  default fixed a silent admin-form submit; `disabled`/`isLoading` compose), scrollable
  `Modal` (Escape/backdrop close), responsive `ResultsChart` (h-64 mobile + table
  fallback), transparent tap-highlight + `touch-action: manipulation` (`a5713cf`).
- **Offline truth-telling + vote guard** — `useVote` in-flight ref (rapid double-taps
  can't fire two `/votes/cast`), offline pre-check returns "reconnect to vote" (no silent
  drop, Article I.6), `useElection` auto-refetch on reconnect, cached-data "stale" labels
  on Elections/Results/Receipt (`923d01a`).
- **Frontend vitest suite** (was: `vitest` failed with "no test files found") —
  `vitest.config.ts` (jsdom + react) and **13 tests** covering storage
  (`Storage.prototype` spy simulates the private-mode WebView throw path), API error
  classification, and the network store's StrictMode-safe listener registration
  (`d5918e7`). New devDep `jsdom` (peer of vitest).
- **`VITE_SEPOLIA_EXPLORER`** env on Vercel production so the results explorer link is
  live on phones; separate from the bundle's main API wiring.
- **Docs** — `docs/sprints/sprint-3-mobile-anti-fragility.md`, Android PWA test runbook
  (`docs/runbooks/android-pwa-test.md`), ADR-007, evidence file.

#### Fixed

- **Frontend had zero tests**: `test` script failed ("no test files found") — now
  vitest runs a real suite (13/13).
- **`favicon.ico` 404** — ImageMagick-generated set from `icon.svg`; all install icons
  verified 200 over HTTPS.
- **Admin form silently submitting with Enter** — `Button` defaulted to `type="submit"`;
  now `type="button"` (create buttons explicitly `type="submit"`).
- **Module-scope Supabase env throw** could white-screen on a misconfig — lazy client.
- **Casting with connectivity drop** previously could hang without feedback — offline +
  in-flight guards make it fail fast with an explicit reason.
- **201-module `ResultsChart`** was unusable on phones — responsive height + tick labels
  + table fallback.
- **Cast timeout too short (15 s default)** read as "Request timed out" on-device while the
  relayer confirmed; the vote actually landed. `useVote.ts` now casts with `timeout: 60000`;
  the follow-up device vote completed with an explicit confirmed state.
- **`/api/auth/verify-otp` rejected valid prod OTPs** — prod GoTrue emits 8-digit codes
  (dev/local: 6); the `token.length > 6` heuristic misrouted them into the magiclink branch
  ("Email link is invalid or has expired"). `isNumericOtp = /^\d{6,8}$/` fixes detection in
  `packages/backend/src/routes/auth.ts`; verified 200 against prod and deployed.
- **Vercel CLI `--prod` deploy silently dropped `VITE_` envs** (bundle pointed at
  `localhost:3001`). Recipe: `vercel env pull` → `packages/frontend/.env.local` → build
  locally → `vercel build --prod` + `vercel deploy --prebuilt --prod` + `vercel alias set`.
- **Results polling wedge on offline PWA boot** from a cold standalone start (`5858f7f`).

#### Changed

- Frontend bundles the mobile shell: bottom nav on phones, consistent `PageShell` chrome
  across Elections/Ballot/Results/Receipt/Admin.
- Network/error vocabulary is now uniform (`toErrorMessage`) across pages.

#### Verified

- `npm run test -w frontend` → **13 passed** (new)
- `npm run build -w frontend` → `tsc && vite build`, precache 19 entries
- `npm run lint -w frontend` → 0 warnings
- `npm run test -w contracts` → 20 passed
- `npm run test -w backend` → 8 passed; `npm run build -w backend` → clean
- Deploy: `vercel deploy --prod` → aliased **https://votechain-ivory.vercel.app**;
  manifest + `sw.js` + all icons 200 over HTTPS; bundle wires the live Railway API
  (evidence: `docs/evidence/2026-09-18_sprint3-mobile-pwa-anti-fragility.md`)
- **On-device Android pass (2026-09-18)** — installed WebAPK standalone: 11-point
  function matrix PASS, offline cold boot from SW precache + "Reconnect to vote" fail-fast,
  reconnect recovery, zero exceptions on final sweep, **two real on-chain votes cast from
  the phone** (B @ `0x4e4c177e…876c7`/11730996, C @ `0x6e194960f98c…`/11731055);
  deployed `/verify-otp` re-verified 200 with a fresh prod OTP
  (evidence: `docs/evidence/2026-09-18_sprint3-phone-device-pass.md` + `2026-09-18_device-test/`)

#### Known boundaries

- Offline ≠ offline voting. Casting requires connectivity (nullifier + chain path);
  offline this sprint is cached browsing + honest stale labels + reconnect-to-vote
  (ADR-007). Offline ballot packs (ADR-006 Option B) are the next-level milestone.
- Physical Android install/browse/recovery behaviour is covered by
  `docs/runbooks/android-pwa-test.md`; **device pass completed 2026-09-18**.
- Broader device matrix (older Android, iOS, private-mode WebView, low-memory devices)
  remains ongoing validation, not product scope for this milestone.
- SMS/USFD feature-phone channels remain ADR-006 Option A scope, not yet built.

---

#### Added

- **CI workflow fixed (was instant-failing)** — GitHub Actions rejected `ci.yml` at
  validation (0 jobs, `404: logs not found`) because unquoted `0x…` hex env values parsed
  as YAML integers. Quoted every hex string, bumped checkout/setup-node to `@v5`.
  Frontend, Backend, Contracts all green (`2026-09-16_runtime-bugs-and-infra.md`).
- **Sepolia deployer = OWNER, not relayer** — hardhat `sepolia` accounts now use
  `PRIVATE_KEY` (owner) and pass `RELAYER_ADDRESS` to the contract constructor,
  enforcing ADR-003 key separation (`88499ea`).
- **Live Supabase grants migration applied** — `20260916110000_grant_postgrest_access.sql`
  applied via management API + recorded in `schema_migrations`
  (`2026-09-16_supabase-migration-live.md`).
- **Infura Sepolia RPC adopted** — user project key validated alive on mainnet + sepolia;
  `SEPOLIA_RPC_URL` uses `https://sepolia.infura.io/v3/<key>` in gitignored env
  (`2026-09-17_layer5-sepolia-and-preview-infra.md`).
- **Railway backend service staged** — service `backend`, domain
  `https://backend-production-64d05.up.railway.app`, all non-contract env set.
  Deploy gated on the real `CONTRACT_ADDRESS` (zod fail-closed, Article IV.2).
- **Frontend LIVE on Vercel** — `https://votechain-ivory.vercel.app`; env set via CLI,
  rootDirectory via REST API, `vercel.json` moved into `packages/frontend` so SPA
  rewrites apply (`ae59936`).
- **Production Docker image verified boots** — "uncaught exception" during smoke was
  `EADDRINUSE :::3001` (local backend under `--network host`); boots on `PORT=3999`
  with `/api/health = 200`.
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
- **Layer 5 LIVE on Sepolia** — `VoteChain.sol` deployed (owner-deployer, relayer separate) at
  `0x672a1D837c5C0992218205b0E81492a07D7C5EB5`; election #1 "General Election 2027 - Presidential"
  seeded on-chain + mirrored in live Supabase.
- **Backend LIVE on Railway** — `packages/contracts/hardhat.config.ts` now loads `dotenv` (was
  silently empty → `HH117` on sepolia deploys). Railway deploy moved from deprecated `railway.json`
  to `.railway/railway.ts` IaC (Railpack build+start commands). Domain
  `https://backend-production-64d05.up.railway.app` serves `/api/health`, `/api/stats`, elections,
  candidates (on-chain backing).
- **End-to-end vote PROVEN live** — probe voter registered → admin verified via the real
  `/api/admin/voters/:id/verify` path → vote cast → relayer (`0xdb38…`) submitted → Sepolia tx
  `0xb1d3f344…` SUCCESS, block `11724916`; results endpoint shows Candidate A: 1; duplicate vote
  attempt correctly blocked with HTTP 409.
- **Railway `railway.json` → IaC** — `railway.json` (deprecated, ignored by `railway up`) replaced
  with `.railway/railway.ts` (`service("backend")` with build/start/healthcheck).

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