# Evidence — 2026-09-17: Layer 5 LIVE end-to-end (Sepolia deploy + Railway + Vercel + Supabase)

Scope: full-stack production wiring — fund wallets, deploy VoteChain.sol to Sepolia, seed
the demo election, correct the Railway deploy path (IaC), sync Supabase, and prove a real
vote through the live public URLs, including double-vote rejection.

## 1. Wallets funded (unblocks all remaining work)

Owner + relayer each funded 0.005 SepoliaETH via the no-auth faucet
`https://sepolia-faucet-service.vercel.app/api/faucet` (POST
`{"address": "…", "network": "sepolia"}`). Balances confirmed on-chain through Infura:

```
owner    0x5FB9161fAF27E4B41F8A2A8a4bC03b3A10429e54 => 0.003516 ETH after deploy ✔ FUNDED
relayer  0xdb38aa5c58adA28F1A3c6fBB9CD9110118fDacB4 => 0.005000 ETH ✔ FUNDED
```

Claim txs: owner `0xb0fcbf869d53040c5bc8351ec8683a833d87b6cd8fb4be8ac6f058c88758805a`,
relayer `0x91bb9099d69a174a45ecd81aa69fe17ca610f62431727e30d6c4dcbb4195cb3c`.

Web faucets (Alchemy, Infura, QuickNode, pk910) were confirmed dead ends for fresh wallets
(mainnet-balance eligibility walls, verified in Alchemy/QuickNode docs).

## 2. Contract deployed to Sepolia

Blocker found: `hardhat.config.ts` read `process.env.SEPOLIA_RPC_URL` but nothing loaded
`.env`, so every sepolia run failed `HH117: Empty string for network or forking URL`.
Fixed by `import "dotenv/config"` + `dotenv` devDependency.

```
cd packages/contracts && npx hardhat run scripts/deploy.ts --network sepolia
Deploying contracts with the account: 0x5FB9161fAF27E4B41F8A2A8a4bC03b3A10429e54   <- owner (ADR-003)
Using relayer address: 0xdb38aa5c58adA28F1A3c6fBB9CD9110118fDacB4                    <- separate
VoteChain deployed to: 0x672a1D837c5C0992218205b0E81492a07D7C5EB5
```

On-chain reads through the Infura-backed provider:

```
electionCount: 1
relayer: 0xdb38aa5c58adA28F1A3c6fBB9CD9110118fDacB4
owner:   0x5FB9161fAF27E4B41F8A2A8a4bC03b3A10429e54
election #1: "General Election 2027 - Presidential", isActive=true, 3 candidates
window: 2026-09-17T15:50:24Z → 2026-09-24T15:50:24Z
```

(Election ids are 1-indexed — `getElection(0)` reverts as designed.)

## 3. Demo election seeded + Supabase row synced

```
CONTRACT_ADDRESS=0x672a1D837c5C0992218205b0E81492a07D7C5EB5 npx hardhat run scripts/seed-election.ts --network sepolia
Seeding an election...
Election created successfully!
```

Seed writes only on-chain; the Supabase `elections` row is the app's read model, so a
matching row was created via the service role REST API:

```
POST /rest/v1/elections  => 201
{"id":1,"chain_election_id":1,"title":"General Election 2027 - Presidential",...,
 "start_time":"2026-09-17T15:50:24+00:00","end_time":"2026-09-24T15:50:24+00:00",
 "is_active":true,"contract_address":"0x672a1D837c5C0992218205b0E81492a07D7C5EB5"}
```

(Window later PATCHed to match the chain's authoritative start/end timestamps — honesty
rule: the DB read model must not drift from the chain.)

## 4. Railway backend deployed (IaC correction + deploy)

Bug found: `railway.json` (Config-as-Code) is deprecated and **ignored by `railway up`** for
new services (Railpack ran instead and failed "No start command detected" in the monorepo).
An accidental `railway up` from the unlinked repo root also created a duplicate project
(service `votechain`) — deleted after recreating it. Correct path used:

```
railway link -p 8cca875b-0f6f-423e-a299-439695bce486 -s backend
railway variables set CONTRACT_ADDRESS=0x672a1D837c5C0992218205b0E81492a07D7C5EB5 \
  CORS_ORIGIN=https://votechain-ivory.vercel.app          # fixed (was the Railway URL)
# .railway/railway.ts IaC (had to install `railway` SDK for the CLI to evaluate TS;
#   local Node 22 lacks TS support — used /tmp/opencode/node24/bin/node)
railway config plan   # 2 changes: build/start/healthcheck only, no destructive ops
railway config apply --yes
railway up -y -d -s backend
Build queued → BUILDING → DEPLOYING → SUCCESS  (deployment cd13c991-086a-40f6-91d0-0c85aa5b9a8f)
```

Health + reachability on the public domain:

```
curl https://backend-production-64d05.up.railway.app/api/health
{"status":"UP","timestamp":"2026-09-17T16:28:15.280Z"}

curl -H "Origin: https://votechain-ivory.vercel.app" -D - api/stats  =>
  HTTP/2 200
  access-control-allow-origin: https://votechain-ivory.vercel.app
```

## 5. End-to-end vote through live URLs

Auth via real Supabase magic-link (generated with the service role `admin.generateLink`,
token used through the backend's `/verify-otp` — no inbox needed for the probe):

```
POST /api/auth/verify-otp        => 200 Successfully verified OTP (session)
POST /api/auth/register-voter    => 201 Voter registered (id 96dfd0c2-ef1a-4375-bd59-6a45ca7b1123)
GET  /api/auth/me                => 200 is_verified=false
POST /api/admin/voters/:id/verify (logged in AS the admin email) => 200 Voter verified
POST /api/votes/cast  {"electionId":1,"candidateId":1} => 200
  {"message":"Vote cast successfully",
   "txHash":"0xb1d3f3446150fac47b93bb10194c321b86787062feb71fd7bc0f8219ef46f8bf",
   "blockNumber":11724916,"explorerUrl":"https://sepolia.etherscan.io/tx/0xb1d3f344…"}
```

On-chain verification:

```
GET /api/elections/1/results  => [Candidate A: 1, Candidate B: 0, Candidate C: 0]
GET /api/votes/receipt/0xb1d3f344… => 200 Vote verified successfully (candidate A, block 11724916)
provider.getTransactionReceipt(0xb1d3f344…) => status 1 (SUCCESS), from relayer 0xdb38…, to contract
```

Double-vote protection (Constitution Article II, boundary a — live):

```
POST /api/votes/cast {"electionId":1,"candidateId":2} (same voter) => 409
  {"message":"Voter has already cast a vote in this election."}
```

## 6. Public URLs (all 200)

| Layer | URL | Verified |
|-------|-----|----------|
| Frontend | https://votechain-ivory.vercel.app | `/` 200, `/elections` 200 |
| Backend  | https://backend-production-64d05.up.railway.app | `/api/health` 200, CORS OK |
| Contract | 0x672a1D837c5C0992218205b0E81492a07D7C5EB5 (Sepolia) | reads via Infura |
| Database  | https://gldfsjoikqydjxcarffr.supabase.co | elections/vote_records/voters |

## Status

**PASS.** Wallets funded, contract deployed + seeded on Sepolia, backend live on Railway
(IaC-managed), frontend live on Vercel, Supabase read model synced, and a full
register → verify → cast → on-chain-confirm → double-vote-reject cycle proven against the
public URLs. Remaining (cosmetic, not blocking): Etherscan source verification (no API
key yet), CodeRabbit install (needs user's GitHub click).

## Not claimed

- Contract source is NOT verified on Etherscan (no `ETHERSCAN_API_KEY`); the bytecode is
  deployed and readable on-chain, but "Verify & Publish" is outstanding.
- Faucet funding used 0.005 SEP each, not the 0.5 SEP target — enough to deploy + seed +
  cast; the relayer balance is finite and will need topping up under real load.
- The live stack runs on the **Sepolia testnet** (test ETH); no mainnet deployment.