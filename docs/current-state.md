# Current State — VoteChain

> Orientation doc. Read `docs/architecture.md` and `docs/engineering/CONSTITUTION.md` first.
> Capabilities marked **ASPIRATIONAL** are not yet proven live.

## As of Sprint 1 (engineering-foundation)

**Honest status: the scaffold compiles, the contract is reviewed and tested on a local network, and
deployment infrastructure is now wired. What is NOT yet done: contract deployed to Sepolia, backend
booted against the live Supabase project with real keys, and a public URL.** Details in Sprint 1 and
the architecture gaps table.

### ASPIRATIONAL (not yet proven live)

- Vote end-to-end on Sepolia (needs deployed contract + funded relayer/owner)
- Backend auth against live Supabase (needs service-role + anon keys in env)
- Public frontend URL (needs Vercel deploy)
- Public backend URL (needs Railway deploy)

### DONE (with evidence in `docs/evidence/` where relevant)

- Workspace governance (Constitution, AGENTS.md, ADRs, sprints, evidence, CHANGELOG)
- Build repaired: frontend `tsc && vite build`, backend `tsc`, contract `hardhat compile` all green
- Contract tests green on local hardhat network
- `seed-election.ts` signature fixed to match the 6-arg contract ABI
- Backend runtime bug fixes: admin owner-wallet signing, receipt `electionId` scope, explorer env
- Backend build pipeline: `tsconfig.json`, `dist/` emit, vitest unit tests
- Hardening: rate limit on `/auth/send-otp`, graceful nullifier-handling on failed submission,
  error/loading states on vote/results pages
- Supabase schema (4 tables + RLS) as a versioned migration in `supabase/migrations/`
- Deployment manifests (Dockerfile, railway.toml, vercel.json) + CI workflow

### P0 open

See `docs/architecture.md` gap table — Sepolia deploy, live Supabase wiring, public URLs.