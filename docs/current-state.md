# Current State — VoteChain

> Orientation doc. Read `docs/architecture.md` and `docs/engineering/CONSTITUTION.md` first.
> Capabilities marked **ASPIRATIONAL** are not yet proven live.

## As of 2026-09-19 (Sprint 5 — Feature-Phone Dialer Reachability)

**The full stack is live and proven end-to-end on Sepolia, now across three channels.** The
contract is deployed on Sepolia, the backend runs on Railway, the frontend runs on Vercel as an
installable PWA, and live Supabase holds the read model. Votes have been cast through:
(1) the **online** path, (2) the **offline** smartphone path (captured on a physical Android
device, auto-submitted on reconnect), and (3) the **dialer** path (a texted `VOTE` command on the
deployed backend). Double-vote prevention holds on every channel.

| Layer | Service | URL / Address | Evidence |
|-------|---------|---------------|----------|
| Frontend (PWA) | Vercel | https://votechain-ivory.vercel.app | `docs/evidence/2026-09-18_sprint3-mobile-pwa-anti-fragility.md` |
| Backend | Railway | https://backend-production-64d05.up.railway.app | `docs/evidence/2026-09-17_layer5-live-end-to-end.md` |
| Contract | Sepolia | `0x672a1D837c5C0992218205b0E81492a07D7C5EB5` | same |
| Database | Supabase | `gldfsjoikqydjxcarffr` | `docs/evidence/2026-09-19_dialer-sms-migration.md` |

### DONE (Sprint 5 — dialer / feature-phone reachability, ADR-009)

- **Dialer intake on the shared cast path** — `POST /api/dialer/sms` parses
  `VOTE <electionCode> <candidate> <pin>` / `RECEIPT <voteCode>`, binds phone → verified voter,
  verifies a one-time 6-digit PIN (SHA-256 digest, one active per voter+election, expiring), then
  calls the **same** `voteService.castVote` as online/offline. No second counting authority.
- **One-time PIN lifecycle** — provision / rotate-in-place / consume / refuse-after-consumed;
  partial unique index is the fail-closed backstop. `POST /api/dialer/codes`, `GET|POST /api/dialer/phone`.
- **Receipt codes** — `vote_records.vote_code` is a Postgres **generated** column
  (`V` + first 12 hex of tx hash), so it can never drift from the tx it certifies; `RECEIPT` SMS
  and `GET /api/dialer/receipts/:code` verify with no voter identity.
- **No silent drops** — every inbound command is audited to `sms_intake_log` with an explicit
  outcome (voted / duplicate / receipt / invalid_pin / expired / …).
- **Gateway seam** — `SmsGateway` + `SimulatedSmsGateway` default; Twilio / Africa's Talking are
  explicit stubs that fail loudly until configured. No claim of delivery without carrier credits.
- **Frontend** `/dialer` page — bind phone, provision a PIN, show the exact SMS to send, verify a
  receipt by code.
- **Live drill** — on the deployed backend: `VOTE 1 1 246810` → `voted`,
  receipt `V2E6A8BBA1009`, tx `0x2e6a8bba…8295`, block **11737079**, event
  `VoteCast(uint256,uint256,bytes32)`; PIN rotated + replayed → `duplicate`, no second tx.
- **Gates green** — contracts 20/20, backend 53/53 + build, frontend 26/26 + build + lint (0 warnings).

### DONE (Sprint 4 — offline ballot capture, ADR-008)

- **Signed-voucher offline capture** — a voter downloads a signed ballot online, captures the vote
  in the device vault while offline, and it auto-submits on reconnect through the **same** cast path.
- **Physical Android device PASS** — airplane-on capture → reconnect auto-submit → server voucher
  `consumed` → `VoteCast` on Sepolia (block 11731807).
  Evidence: `docs/evidence/2026-09-18_sprint4-offline-device-pass.md`.
- Backend `offlineBallotService` + `routes/offline.ts`; frontend vault + global `OfflineSync`.

### DONE (Sprint 3 — mobile-first anti-fragility, carried forward)

- Installable Android PWA (workbox precache, offline cold boot), anti-fragility core
  (`ErrorBoundary`, safe storage, hardened `api.ts`, router-based 401), mobile-first UI
  (bottom nav, `PageShell`, responsive results), offline truth-telling + vote guard.
- Two real votes cast from the physical phone; `/api/auth/verify-otp` 8-digit fix.

### DONE (Sprints 1–2, carried forward)

- Contract on Sepolia (owner-deployer, relayer separate, ADR-003); election #1 seeded on-chain +
  Supabase; backend live on Railway (IaC); two-boundary nullifier reorder (DB row only after
  on-chain success); `/api/stats`; versioned Supabase migrations; CI green.

### ASPIRATIONAL (not yet proven live / not yet built)

- **Physical SMS/USSD delivery** — the dialer intake and vote path are live and proven, but the
  radio hop needs a carrier gateway subscription + credits (Twilio / Africa's Talking). Procurement
  step, not code. This is the single remaining gap to real feature-phone reach.
- **Broad device matrix** — one Android accept bar passed; older Android / iOS / private-mode
  WebView / low-memory devices are ongoing validation.
- **Etherscan source verification** — needs `ETHERSCAN_API_KEY`.
- **Real voter volume / load** on the live endpoints (six votes to date on election 1).
- **CodeRabbit PR review** — pending user GitHub app install click.
- **Offline coercion-resistance (receipt-freeness)** — inherently weaker offline (ADR-008 §4);
  design constraint, not a task.

### P0 open

None. No new subsystem will start while any P0 from `docs/architecture.md` is open.
