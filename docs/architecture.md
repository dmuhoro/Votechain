# VoteChain — System Architecture

> Companion doc to `docs/engineering/CONSTITUTION.md`. Read both before building.
> Status: reflects what is **implemented in code** vs **ASPIRATIONAL** (not yet proven live).
> Voter-facing status as of 2026-09-18: online voting live on Sepolia; **offline ballot
> capture + reconciliation** (ADR-008) shipped Sprint 4.

---

## 1. Product

**VoteChain** is a blockchain-backed voting platform where **voters never need a crypto wallet**.
A backend **relayer** submits votes to the smart contract on the voter's behalf. Every vote is
recorded on-chain with a deterministic **nullifier** (SHA-256 over `voterId-electionId-SERVER_SECRET`)
so double-voting is prevented at two independent boundaries while voter identity never touches
the chain.

Demo target: public **Sepolia** testnet demo (not production mainnet voting).

## 2. Architecture (as-built)

```
┌──────────────┐  fetch/render  ┌──────────────────────────────┐
│  React/Vite  │ ◄────────────► │  Express API (backend)       │
│  frontend    │  POST /votes   │  routes/ votes.ts            │
│  (no wallet) │                │  services/ nullifierService  │
└──────┬───────┘                │  services/ relayerService    │
       │ supabase-js (anon)     │  services/ supabaseService   │
       ▼                        └───────┬───────────────┬──────┘
┌──────────────┐   service role key      │  est. gas    │  castVote (onlyRelayer)
│  Supabase    │ ◄───────────────────────┘  broadcast   ▼
│  voters      │                          ┌──────────────────────────┐
│  elections   │                          │  VoteChain.sol (Sepolia) │
│  vote_records│                          │  Elections{        }     │
│  nullifiers  │                          │  nullifiers mapping      │
└──────────────┘                          └──────────────────────────┘
```

### The vote path (real chain, no mocks): `routes/votes.ts → nullifierService → relayerService → VoteChain.castVote`

1. `POST /api/votes/cast` — `protect` middleware validates the Supabase JWT.
2. `is_verified_voter` gate — unverified voters get 403.
3. `nullifierService.generateNullifier(userId, electionId)` → deterministic `0x…` SHA-256.
4. `nullifierService.checkAndStoreNullifier` → SELECT against `nullifiers` (fast pre-check) then
   INSERT. DB `UNIQUE (election_id, nullifier_hash)` is the backstop.
5. `relayerService.submitVote` → nonce-managed, gas-buffered `castVote(electionId, candidateId,
   nullifier)` signed by the relayer wallet; 3 attempts / 2s backoff.
6. Contract asserts `onlyRelayer`, election active, nullifier not already used (authoritative gate).
7. Backend writes `vote_records` (tx hash, nullifier, block number) for the receipt page.

### The offline vote path (ADR-008): capture offline → reconcile through the SAME real cast path

1. `POST /api/offline/ballots` (online) — verified voter provisions a **one-time voucher**
   (HMAC over `voter+election+candidate-fingerprint`) for an open election; row in
   `offline_ballots` (status `issued`, `UNIQUE (voter_id, election_id)`).
2. Offline — voter selects a candidate on-device; the ballot is stored **durably** on the device
   (safe storage) in explicit `pending` state ("saved — submits on reconnect"). No vote exists
   anywhere server-side yet.
3. `POST /api/offline/ballots/submit` (on reconnect) — validates the voucher signature + binding,
   then calls the **shared `voteService.castVote`** — the identical code path as step 1–7 above —
   and marks the voucher `consumed` on success. First submission wins via the nullifier
   (both boundaries); every outcome is explicit (`voted`/`duplicate`/`expired`/`rejected`).

The offline path adds **provisioning** (vouchers) + **local staging** (device queue) +
**reconciliation** (voucher consumption vs nullifier vs chain) — it does NOT add a second counting
authority. The chain + `vote_records` remain the only tallies.

### The admin path (owner-gated on-chain): `routes/admin.ts`

- `POST /api/admin/elections/create` — on-chain `createElection` (**owner** wallet), then Supabase row.
- `POST /api/admin/elections/:id/close` — on-chain `closeElection` (**owner** wallet), then DB update.
- `GET /api/admin/voters`, `PATCH /api/admin/voters/:id/verify` — voter verification (Supabase).

### Auth

- `supabase.auth.signInWithOtp` (magic link / OTP). Frontend holds the session; backend validates
  the JWT via `supabase.auth.getUser(token)` per request. Admin determined by `ADMIN_EMAILS`.

---

## 3. Component inventory (as-built)

| Layer | Files | Boundary |
|-------|-------|----------|
| Contract | `packages/contracts/contracts/VoteChain.sol` | Owner (create/close/relayer) + Relayer (castVote) |
| Deploy | `packages/contracts/scripts/deploy.ts`, `seed-election.ts` | `deployments/<network>.json` (gitignored) |
| API | `packages/backend/src/routes/{auth,elections,votes,admin,offline}.ts` | Zod-validated, Supabase-backed |
| Services | `relayerService.ts`, `nullifierService.ts`, `voteService.ts`, `offlineBallotService.ts`, `supabaseService.ts` | Private keys in env only |
| Offline (frontend) | `packages/frontend/src/lib/offlineBallots.ts`, `hooks/useOfflineSync.ts`, `pages/OfflinePage.tsx` | Durable safe-storage staging; submits via the real path |
| Identity | Supabase `voters`, `nullifiers`, `elections`, `vote_records` | RLS per `supabase/migrations/` |
| Frontend | `packages/frontend/src/pages/*`, `hooks/*`, `store/*`, `lib/*` | Reads backend; no wallet |

## 4. Configuration contracts (env)

- **backend `.env`**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RELAYER_PRIVATE_KEY`,
  `OWNER_PRIVATE_KEY`, `SEPOLIA_RPC_URL`, `CONTRACT_ADDRESS`, `SERVER_SECRET`, `ADMIN_EMAILS`,
  `CORS_ORIGIN`, `PORT`, `SEPOLIA_EXPLORER`.
- **contracts `.env`**: `SEPOLIA_RPC_URL`, `PRIVATE_KEY` (owner/deployer), `RELAYER_PRIVATE_KEY`,
  `ETHERSCAN_API_KEY`, `CONTRACT_ADDRESS`.
- **frontend `.env`**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`,
  `VITE_CONTRACT_ADDRESS`, `VITE_SEPOLIA_EXPLORER`.

---

## 5. Gaps / risk table (honest, as of 2026-09-18 — Sprint 4)

| Gap | Severity | Status | Open? |
|-----|----------|--------|-------|
| Contract deployed on Sepolia | P0 (demo blocker) | ✅ Done (`0x672a1D837c5C0992218205b0E81492a07D7C5EB5`) | no |
| Supabase project wired + migrations applied | P0 | ✅ Done (`gldfsjoikqydjxcarffr`, 3 migrations incl. `offline_ballots`) | no |
| Backend live against live Supabase | P0 | ✅ Done (Railway) | no |
| Frontend reachable at public URL | P0 | ✅ Done (Vercel PWA, installed on device) | no |
| Live end-to-end votes + HTTP 409 double-vote | P0 | ✅ Done (3 votes on-chain, receipt path live) | no |
| Android PWA install/offline/recovery on a physical device | P1 | ✅ Done (Sprint 3 device pass) | no |
| **Offline ballot capture + reconciliation (ADR-008)** | P1 | ✅ Done (Sprint 4; vouchers + on-reconnect submit through the real cast path) | no |
| Voter email-in demonstration | P2 | ✅ Works via OTP/magic-link (prod session, on-device) | no |
| SMTP/OTP rate limit | P1 | ✅ Done (`OTP_RATE_LIMIT`, express-rate-limit) | no |
| Results/loading error states | P1 | ✅ Done (Sprint 3 anti-fragility core) | no |
| Nullifier SELECT-then-INSERT race (TOCTOU) | P1 | ✅ DB UNIQUE backstop + graceful failure (ADR-002) | no |
| Backend unit tests | P1 | ✅ Done (nullifier, voucher/path) | no |
| Frontend component/unit tests | P2 | ✅ 14 vitest tests (incl. offline capture store) | no |
| SMS/USSD feature-phone channel (ADR-006 Option A) | P2 | Not built — external carrier gateway credits needed | yes |
| Etherscan source verification | P2 | Not done — needs `ETHERSCAN_API_KEY` | yes |
| Broad multi-device hardware matrix (older Android/iOS/private WebView) | P2 | Ongoing after single-device accept bar | yes |
| CodeRabbit PR review | P2 | Pending user GitHub app install click | yes |
| Offline coercion-resistance (receipt-freeness) | P2 | **Inherently weaker offline** (ADR-008 §4) — design constraint, not a task | no |
| Relayer nonce race under high concurrency | P2 | Documented; single-instance retry on failure (acceptable testnet demo, ADR-004) | no |

Nothing in this table is claimed complete unless it is marked done with evidence in
`docs/evidence/` (constitution: never narrative alone).

## 6. Explicit non-goals for the demo

- No mainnet/mainnet-adjacent deployment.
- No zk-proof privacy layer (nullifiers are public-unlinkable hashes, not zero-knowledge).
- No MetaMask/self-custody flow — relayer pattern only.
- No production-grade resilience (single relayer instance is acceptable for a testnet demo).
- No offline autonomous casting (ADR-008: offline captures reconcile through the same live path).