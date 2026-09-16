# VoteChain — System Architecture

> Companion doc to `docs/engineering/CONSTITUTION.md`. Read both before building.
> Status: reflects what is **implemented in code** vs **ASPIRATIONAL** (not yet proven live).

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
| API | `packages/backend/src/routes/{auth,elections,votes,admin}.ts` | Zod-validated, Supabase-backed |
| Services | `relayerService.ts`, `nullifierService.ts`, `supabaseService.ts` | Private keys in env only |
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

## 5. Gaps / risk table (honest, as of engineering-foundation sprint)

| Gap | Severity | Status | Open? |
|-----|----------|--------|-------|
| Contract deployed on Sepolia | P0 (demo blocker) | **Not done** — no funded relayer/owner key yet | yes |
| Supabase project wired (URL + keys) | P0 | **Partial** — project exists (`gldfsjoikqydjxcarffr`); migrations applied; anon/service-role keys not yet loaded into local env | yes |
| Backend boots against live Supabase | P0 | Not yet run live | yes |
| Frontend reachable at a public URL | P0 | ASPIRATIONAL — builds pending infra | yes |
| Voter email-in demonstration | P2 | Works via OTP; Demo voter seeding not automated | no |
| Relayer nonce race under concurrency | P2 | Documented; single-instance retry on failure | no |
| Rate limiting on `/auth/send-otp` | P1 | **In progress** this sprint (hardening) | |
| Error/loading states on pages | P1 | **In progress** this sprint (hardening) | |
| Nullifier SELECT-then-INSERT race (TOCTOU) | P1 | DB UNIQUE backstop exists; graceful-failure handling added in hardening | |
| Backend unit tests | P1 | **In progress** this sprint | |
| Frontend component tests | P2 | Not started | no |

Nothing in this table is claimed complete unless it is marked done with evidence in
`docs/evidence/` (constitution: never narrative alone).

## 6. Explicit non-goals for the demo

- No mainnet/mainnet-adjacent deployment.
- No zk-proof privacy layer (nullifiers are public-unlinkable hashes, not zero-knowledge).
- No MetaMask/self-custody flow — relayer pattern only.
- No production-grade resilience (single relayer instance is acceptable for a testnet demo).