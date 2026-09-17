# Current State — VoteChain

> Orientation doc. Read `docs/architecture.md` and `docs/engineering/CONSTITUTION.md` first.
> Capabilities marked **ASPIRATIONAL** are not yet proven live.

## As of 2026-09-17 (Sprint 2 — Layer 5 LIVE)

**The full stack is live and proven end-to-end on Sepolia.** The contract is deployed and
seeded on Sepolia, the backend runs on Railway, the frontend runs on Vercel, live Supabase
holds the read model, and a real vote was cast through the public URLs and confirmed
on-chain — including live double-vote rejection (HTTP 409).

| Layer | Service | URL / Address | Evidence |
|-------|---------|---------------|----------|
| Frontend | Vercel | https://votechain-ivory.vercel.app | `docs/evidence/2026-09-17_layer5-sepolia-and-preview-infra.md` |
| Backend | Railway | https://backend-production-64d05.up.railway.app | `docs/evidence/2026-09-17_layer5-live-end-to-end.md` |
| Contract | Sepolia | `0x672a1D837c5C0992218205b0E81492a07D7C5EB5` | same |
| Database | Supabase | `gldfsjoikqydjxcarffr` | same |

### DONE (with evidence in `docs/evidence/`)

- Workspace governance (Constitution, AGENTS.md, ADRs, sprints, evidence, CHANGELOG)
- Build repaired: frontend `tsc && vite build`, backend `tsc`, contract `hardhat compile` all green
- Contract tests green on local hardhat network (20 tests)
- Backend unit tests green (8 tests) — nullifierService split + isAlreadyVotedError coverage
- Full 13/13 e2e proven against real local Supabase + Hardhat (Layer 2)
- **Article II.3 nullifier reorder** — DB nullifier row written only after on-chain success;
  ON CONFLICT DO NOTHING atomic backstop for concurrent identical votes (Layer 4)
- On-chain `"Already voted"` revert mapped to HTTP 409 with explicit message (Layer 4)
- Config defaults now applied (zod parse result used directly, not discarded) (Layer 4)
- OTP rate limit env-tunable with conservative default of 5/15 min (Layer 4)
- `/api/stats` endpoint returning live counts; landing page shows real stats (Layer 4)
- Error/loading states on Election, Ballot, Results pages (Layer 4)
- Dockerfile builds and boots (`/api/health = 200`) — proven locally (Layer 3)
- `vercel.json` rootDirectory set for monorepo (Layer 3)
- `coderabbit.yaml` created (PR review automation; install pending user's GitHub click)
- npm audit: runtime deps zero vulnerabilities; 45 dev-toolchain vulns deliberately descoped
  with rationale documented per Article VIII.3
- Supabase schema (4 tables + RLS) as a versioned migration in `supabase/migrations/`
- Deployment manifests: Dockerfile (multi-stage), `.railway/railway.ts` (IaC), vercel.json,
  CI workflow
- **Wallets funded on Sepolia** — owner `0x5FB9161fAF27E4B41F8A2A8a4bC03b3A10429e54` and
  relayer `0xdb38aa5c58adA28F1A3c6fBB9CD9110118fDacB4`, balances confirmed on-chain
- **Contract deployed on Sepolia** — owner-deployer, relayer separate (ADR-003); election #1
  seeded on-chain with matching Supabase row
- **Backend live on Railway (IaC)** — `.railway/railway.ts` build/start/healthcheck; corrected
  `CORS_ORIGIN` to the Vercel origin
- **Live end-to-end vote** — register → admin verify → cast → Sepolia tx `0xb1d3f344…`
  (block 11724916, SUCCESS); results show Candidate A: 1; duplicate vote blocked (409)

### ASPIRATIONAL (not yet proven live)

- Etherscan source verification of the deployed contract (no `ETHERSCAN_API_KEY` yet)
- Mainnet / production-network deployment (live stack runs on the Sepolia testnet)
- Real voter volume / load on the live endpoints (single probe vote only)
- Mobile & offline reachability (SMS/USSD channels, offline ballot packs) —
  see `docs/adr/ADR-006-mobile-and-otp-reachability.md`
- CodeRabbit PR review (install needs the user's GitHub click at
  https://github.com/apps/coderabbit/installations/new)

### P0 open

None from the Layer 5 golive are open. Remaining items are non-P0 enablers listed above
(Etherscan verify, CodeRabbit) plus any future sprint scope.