# Current State — VoteChain

> Orientation doc. Read `docs/architecture.md` and `docs/engineering/CONSTITUTION.md` first.
> Capabilities marked **ASPIRATIONAL** are not yet proven live.

## As of Sprint 2 (hardening and readiness)

**The stack compiles, the contract is tested on a local network, the backend is proven
against a real local Supabase + Hardhat node (13/13 e2e), and the Docker image builds and
boots. Vote-path integrity is hardened per Constitution Article II.3. What is NOT yet done:
Sepolia contract deployment, live Supabase wiring, and public URLs.**

### ASPIRATIONAL (not yet proven live)

- Vote end-to-end on Sepolia (needs deployed contract + funded relayer/owner)
- Backend auth against live Supabase (needs service-role + anon keys in env)
- Public frontend URL (needs Vercel deploy + VITE_API_URL)
- Public backend URL (needs Railway deploy)

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
- Deployment manifests: Dockerfile (multi-stage), railway.toml, vercel.json, CI workflow

### P0 open

See `docs/architecture.md` gap table — Sepolia deploy, live Supabase wiring, public URLs.
Phase 2 (Sepolia on-chain) deferred until user provides credentials.