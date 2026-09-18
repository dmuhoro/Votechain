# Current State — VoteChain

> Orientation doc. Read `docs/architecture.md` and `docs/engineering/CONSTITUTION.md` first.
> Capabilities marked **ASPIRATIONAL** are not yet proven live.

## As of 2026-09-18 (Sprint 3 — Mobile-First Anti-Fragility)

**The full stack is live and proven end-to-end on Sepolia.** The contract is deployed and
seeded on Sepolia, the backend runs on Railway, the frontend runs on Vercel as an
**installable PWA**, live Supabase holds the read model, and **three real votes were cast
through the public URLs and confirmed on-chain** — including two cast from the actual
Android phone this session, plus live double-vote rejection (HTTP 409).

| Layer | Service | URL / Address | Evidence |
|-------|---------|---------------|----------|
| Frontend (PWA) | Vercel | https://votechain-ivory.vercel.app | `docs/evidence/2026-09-18_sprint3-mobile-pwa-anti-fragility.md` |
| Backend | Railway | https://backend-production-64d05.up.railway.app | `docs/evidence/2026-09-17_layer5-live-end-to-end.md` |
| Contract | Sepolia | `0x672a1D837c5C0992218205b0E81492a07D7C5EB5` | same |
| Database | Supabase | `gldfsjoikqydjxcarffr` | same |

### DONE (Sprint 3 — with evidence in `docs/evidence/`)

- **Installable Android PWA** — manifest, icons, theme color, workbox precache (19
  entries), `navigateFallback`, read-only GET runtime caching; verified live over HTTPS
  (manifest + `sw.js` + all icons 200; bundle wired to the live Railway API)
- **Anti-fragility core** — `ErrorBoundary`, safe-storage wrapper, hardened `api.ts`
  (15 s timeout, retry-once, typed errors, router-based 401), lazy Supabase client,
  try/catch boot, `AuthCallbackPage` timeout + error card, online/offline store +
  `OfflineBanner`, polling pause while hidden/offline
- **Mobile-first UI** — `PageShell`, `MobileBottomNav` (44 px targets, safe-area),
  scrollable modals, responsive `ResultsChart` + table fallback, tap-highlight/touch fixes
- **Offline truth-telling + vote guard** — cached-data "stale" labels, reconnect-to-vote
  fail-fast, in-flight double-submit guard on the vote path
- **Frontend vitest suite green (13 tests)** — storage (incl. private-mode WebView throw
  simulation), API error classification, network store
- **On-device Android pass (2026-09-18)** — installed WebAPK standalone, offline cold
  boot from SW precache + cached browse + "Reconnect to vote" fail-fast, banner-clear on
  reconnect, zero exceptions on the final sweep, and **two real votes cast from the phone**
  (B @ block 11730996, C @ block 11731055; tallies now A=1, B=1, C=1)
- **Device-round fixes shipped** — cast timeout 15 s → 60 s (`useVote.ts`),
  `/api/auth/verify-otp` 8-digit OTP detection (`packages/backend/src/routes/auth.ts`,
  re-verified 200 against prod), Vercel CLI VITE-env loss (prebuilt deploy recipe in
  the runbook)
- **All gates green** — contracts 20/20, backend 8/8 + build, frontend build + lint
  (0 warnings) + 13/13
- Docs: sprint-3 file, Android runbook (with completed results table), ADR-007,
  evidence files

### DONE (Sprint 2 — carried forward)

- Contract deployed on Sepolia (owner-deployer, relayer separate, ADR-003); election #1
  seeded on-chain with matching Supabase row
- Backend live on Railway (IaC); live end-to-end vote + duplicate-vote 409 proven
- Two-boundary nullifier reorder (DB row written only after on-chain success)
- `/api/stats`, configurable OTP rate limit, Dockerfile boots, CI green
- Supabase schema as a versioned migration; deployment manifests; wallets funded

### ASPIRATIONAL (not yet proven live / not yet built)

- **Offline ballot-pack voting** (ADR-006 Option B) — a new provisioning + reconciliation
  subsystem with its own trust model; requires a design ADR + its own sprint (ADR-007
  boundary)
- **SMS/USSD feature-phone voting** (ADR-006 Option A backend) — carrier gateway + SMS
  OTP channel, not built
- **Broad device matrix** — the Sprint 3 accept bar (one Android phone, installed PWA
  offline/recovery/vote) passed 2026-09-18; older Android / iOS / private-mode WebView /
  low-memory devices are ongoing validation
- Etherscan source verification of the deployed contract (no `ETHERSCAN_API_KEY` yet)
- Real voter volume / load on the live endpoints (three votes to date)
- CodeRabbit PR review (install needs the user's GitHub click at
  https://github.com/apps/coderabbit/installations/new)

### P0 open

None from the Sprint 3 golive are open. Remaining items are non-P0 enablers + the
next-level milestone (offline ballot packs / SMS-USSD) listed above.