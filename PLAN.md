# VoteChain — Execution Plan: Scaffold → Live Sepolia Demo

> Status: **Phase 1 (local E2E proof) GREEN — 13/13 PASS.** Next: Phase 2 (Sepolia mirror).
> Source of truth for "what's broken": `AUDIT.md`
> Strategy: **prove the flow locally FIRST, then mirror to Sepolia, then host.**

---

## Strategy (why this order)

1. **Fix the builds first.** Everything else (contract compile, backend boot, frontend dev) is blocked by ~10 config/dependency defects. Cheapest work, unblocks everything.
2. **Prove the real path locally before paying for anything.** Get a full green E2E against a **local Hardhat chain + a free hosted Supabase project** while iteration cost is zero. Per our operating rules: *proof must exercise the real path* — a vote via the relayer, nullifier recorded, results readable. If we can't make that work locally, no amount of hosting fixes it.
3. **Swap local → Sepolia.** It's an env-var swap plus funding the relayer wallet. Nothing structural.
4. **Host.**
5. **Harden only what a stranger could break during the demo.** Skip portfolio polish.

Division of labor: **I do all code + config + wiring.** **You do only credentialed account ops** (creating the Supabase project, funding the wallet, hosting accounts). Everything you do is listed explicitly in Phase 2/4 marked **[YOU]**.

---

## Phase 0 — Fix build foundations (~2 hours, me)

Goal: `npm install`, frontend `tsc+build`, backend `tsc+build`, `hardhat compile` all exit 0.

| # | Task | Check |
|---|------|-------|
| 0.1 | Pin `hardhat` to `^2.22.15` (stable) in contracts + remove `hardhat`/`@nomicfoundation/*`/`@nomiclabs/*` from frontend and backend package.json (audit evidence: v3.7.0 doesn't exist; deps are hoisted cruft) | `npm ls hardhat` clean |
| 0.2 | Add `react-router-dom` to frontend deps; add `vite-env.d.ts` (`/// <reference types="vite/client" />`) | Fixes all 16 TS errors |
| 0.3 | Create `packages/backend/tsconfig.json` (strict, ES2020, commonjs, outDir dist, resolveJsonModule) | `tsc` emits `dist/` |
| 0.4 | Resolve ethers mismatch: **upgrade backend to ethers v6** (code already uses v6 APIs — `JsonRpcProvider`, `EthersError`, `Interface`). Pin `ethers ^6.13.4`; confirm contract tests still run under hardhat's bundled ethers | Backend boots; contract tests pass |
| 0.5 | Add `@supabase/supabase-js` to backend deps; remove vite/vitest from contracts deps; add `@types/node` fix if needed; `npm audit` to record (not fix) remaining unfixables | `npm install` clean |
| 0.6 | Fix compile-blocking TS: receipt `timestamp`, unused imports/destructures, `src/ui/` orphan dir | frontend build exit 0 |
| 0.7 | `hardhat compile` then **run contract tests to green** (must create `typechain-types` first) | `npm run test -w contracts` passes |
| 0.8 | Fix `seed-election.ts` signature mismatch (4-arg call vs 6-arg contract fn) | Script runs |

**Exit gate:** `npm run build -w frontend` + `npm run build -w backend` + contract tests all pass; `npm run dev` boots both servers.

---

## Phase 1 — Local E2E proof (DONE — 13/13 PASS)

Goal: **a stranger-shaped user can, on localhost, register → get verified → vote → see results read from the chain.** No cloud infrastructure other than Supabase's free tier.

| # | Task | Check |
|---|------|-------|
| 1.1 | **[YOU]** Create a free Supabase project → give me URL + service-role key + anon key. Enable email provider on Supabase Auth | Keys in a local `.env` (never committed) |
| 1.2 | Apply `supabase_migrations.sql` via Supabase SQL editor or CLI; verify RLS policies exist | Tables `voters`, `elections`, `vote_records`, `nullifiers` exist |
| 1.3 | `hardhat node` + `deploy:local` → get LOCAL contract address; deploy relayer = a local test wallet | `deployments/localhost.json` exists |
| 1.4 | Fix the 3 runtime bugs from the audit: admin uses relayer wallet for `onlyOwner` fns (use deployer/admin wallet or add owner-signed path); `votes.ts:151` out-of-scope `electionId`; `explorerUrl` env missing | Code-level, reviewed before merge |
| 1.5 | Add auth callback route (`/auth/callback`) + populate user after magic-link redirect (`authStore` calls `GET /api/auth/me`) | Login → user in store → admin sees voters |
| 1.6 | Register a voter, admin-verify them, create an election via admin (owner wallet), cast a real vote via relayer, read results from contract | Full happy path green on localhost |
| 1.7 | Negative tests on localhost: double-vote rejected, non-verified voter rejected, unauthenticated rejected | 3 manual checks pass |

**Exit gate:** ✅ GATE MET — end-to-end vote works on localhost with on-chain nullifier + results. Evidence: `docs/evidence/2026-09-16_layer2-local-vote-path.md` (13/13 PASS).

---

## Phase 2 — Sepolia mirror (~1.5–2 hours, you + me)

Goal: same code, real testnet.

| # | Task | Check |
|---|------|-------|
| 2.1 | **[YOU]** Get Sepolia ETH for a fresh relayer wallet (testnet faucet); give me the funded private key | Wallet has >0.1 Sepolia ETH |
| 2.2 | Deploy contract to Sepolia (`deploy:sepolia`); verify on Etherscan | `deployments/sepolia.json` + verified contract URL |
| 2.3 | Swap `.env` to Sepolia values: RPC, contract address, relayer key | Backend boots pointing at Sepolia |
| 2.4 | Create a production Supabase project (or reuse) + seed a demo election | API lists a live election |
| 2.5 | Smoke test the full flow on Sepolia | A real vote lands on Sepolia Etherscan |

---

## Phase 3 — Host it (~2–3 hours, me + account access)

Goal: public URL, shareable.

| # | Task | Check |
|---|------|-------|
| 3.1 | Backend: `render.yaml`/`railway`/`fly` config + Dockerfile; set all env vars in platform | `GET /api/health` from public URL |
| 3.2 | Frontend: Netlify/Vercel build config; set `VITE_*` env; CORS origin → deployed frontend URL | `npm run build` in CI, deploys |
| 3.3 | Update production `CORS_ORIGIN` + `ADMIN_EMAILS` to real values | Admin login works remotely |
| 3.4 | **[YOU]** Optional custom subdomain (`voting.yourname.com`) for demo credibility | URL shareable |
| 3.5 | Full E2E smoke test from a clean browser on the public URL | Register→vote→receipt→results |

---

## Phase 4 — Harden for the demo window (~2 hours, me)

Only what a stranger could break or what the demo will be judged on:

| # | Task | Priority logic |
|---|------|----------------|
| 4.1 | Rate-limit `/send-otp` (email-flood protection) | A stranger will spam it if omitted |
| 4.2 | Nullifier race → `INSERT ... ON CONFLICT DO NOTHING` backstop | Double-tap risk live |
| 4.3 | Error/loading states on vote + receipt + results pages (the three a stranger sees) | Never show raw error text |
| 4.4 | Landing page stats from API, not hardcoded zeros | Demo credibility |
| 4.5 | `npm audit` mitigation where non-breaking (axios upgrade, vite) | Known-high CVEs on a public URL look bad |

**Explicitly skipped (P2):** frontend test suite, E2E automation, multi-election UX depth, full a11y, motion design. Not on the critical path to a shareable demo.

---

## P0 Timeline (honest)

```
Day 1  (≈6h):  Phase 0 build fixes → Phase 1 local E2E green   ✅ DONE (13/13)
Day 2  (≈4h):  Phase 2 Sepolia → Phase 3 hosting → smoke test   ← NEXT (needs user creds)
Day 2.5 (≈2h): Phase 4 hardening
```

**~12 focused hours to a live, shareable Sepolia demo**, gated by Phase 1 (now green) and then by user-held credentials (live keys, funded relayer wallet) for Phase 2.

---

## When would Claude/ChatGPT actually be worth bringing in

- **In Phase 4/portfolio polish** — if after the demo works you want a genuinely premium look (illustration, motion, brand system beyond Tailwind defaults). That's discretionary, not blocking.
- **Never mid-build** — splitting frontend work during Phase 0–3 creates API-contract drift and slows the whole thing. The PNG of the work is small; the coordination cost outweighs it.

## What blocks me vs. what blocks you

| In my hands | Only you can do |
|-------------|-----------------|
| All code, configs, deploy manifests, SQL, fixes | Create Supabase project + hand over keys |
| ~~Local E2E verification~~ ✅ DONE (13/13) | Fund Sepolia relayer wallet |
| Rendering/hosting configs | Hosting account creation (or credentials so I can) |
| Demo URL + env wiring | Final domain choice |