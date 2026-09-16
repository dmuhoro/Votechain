# ADR-004: Deployment Topology — Vercel (frontend) + Railway (backend) + Supabase + Sepolia

**Status:** Accepted
**Date:** 2026-09-15
**Deciders:** Daniel Muhoro (product owner)

## Context

VoteChain is a three-process system: React/Vite frontend, Express API backend, and a Hardhat-deployed
contract. To give the product owner a **public, shareable testnet URL** we need managed hosting with
free tiers, env-var support, and per-repo builds. The owner specified preference for Vercel
(frontend) + Railway (backend).

## Decision

| Concern | Provider | Why |
|---------|----------|-----|
| Frontend (static SPA) | **Vercel** | Native SPA deploys, free tier, `VERCEL_TOKEN` + `vercel deploy --prod` from CI, env vars per-preview, git integration. Owner preference. |
| Backend (Express API) | **Railway** | Long-running Node service, Docker build, env vars, `RAILWAY_TOKEN` + `railway up` / CI deploy, healthcheck. Owner preference. |
| Identity + Postgres | **Supabase** | Auth (OTP), `voters`/`elections`/`nullifiers`/`vote_records` tables, RLS, service-role + anon keys. Already provisioned (`gldfsjoikqydjxcarffr`). |
| Chain | **Sepolia testnet** | Free Faucet ETH; contract verified via Etherscan. Production mainnet is a non-goal. |

Backend and frontend are deployed as **separate services** (no monolith) because Railway is a long
running process and Vercel is static. `CORS_ORIGIN` on the backend points at the deployed Vercel URL.

## Consequences

**Positive**
- Each piece deploys independently; a frontend-only change doesn't bounce the relayer.
- Free tier is sufficient for a demo election.
- `CORS_ORIGIN` becomes the only cross-service trust boundary we must keep in sync.

**Negative**
- Three platforms = three sets of credentials; a demo writeup must document each console.
- Railway free-tier cold starts add ~1-2s latency to the first vote after inactivity.

## Alternatives rejected

- **Backend on Vercel serverless** — rejected: Express runs as a single long-lived process with
  in-memory nonce state in `relayerService`; serverless evaporation would void nonce-caching.
- **Single Railway service hosting both** — rejected in practice: Vercel frontend is the owner's
  stated preference and keeps static hosting free.
- **Supabase Edge Functions for the relayer** — rejected: no persistent nonce, cold JS runtime for
  ethers, harder key handling than a Dockerized Node process.