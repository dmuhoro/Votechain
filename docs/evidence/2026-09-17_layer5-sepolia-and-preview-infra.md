# Evidence — 2026-09-17: Sepolia & preview-infra provisioning (Layer 5)

Scope: validate user-provided Infura credentials, adopt a reliable Sepolia RPC, stage
Railway, deploy the frontend to Vercel, and verify the production Docker image boots.

## 1. Infura credentials validated (2 networks)

Command run against the user-provided project key (key value never written to a
committed file):

```
curl -s -o /tmp/opencode/inf-main.txt -w "http=%{http_code}\n" \
  -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  https://mainnet.infura.io/v3/<KEY>

curl -s -o /tmp/opencode/inf-sep.txt -w "http=%{http_code}\n" \
  -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  https://sepolia.infura.io/v3/<KEY>
```

Observed output:

```
=== Infura MAINNET ===  http=200   result=0x18cb0e9
=== Infura SEPOLIA ===  http=200   result=0xb2e513
```

Conclusion: the key is active on both networks. Adopted
`https://sepolia.infura.io/v3/<KEY>` as `SEPOLIA_RPC_URL` in the gitignored
`packages/contracts/.env` and in `/tmp/opencode/split-funds.mjs` +
`/tmp/opencode/check-funders.sh` (replaced PublicNode).

Post-adoption balance check through the Infura-backed provider:

```
owner    0x5FB9161fAF27E4B41F8A2A8a4bC03b3A10429e54 => 0.000000 ETH ✘ unfunded
relayer  0xdb38aa5c58adA28F1A3c6fBB9CD9110118fDacB4 => 0.000000 ETH ✘ unfunded
```

## 2. Railway backend staged

```
railway add --service backend
> backend created (service ID ce115af3-a95f-4e3c-95f5-53558fa57220)

railway domain -p 3000
> URL: https://backend-production-64d05.up.railway.app  (Sync status: ACTIVE)

railway variables set NODE_ENV=production PORT=3000 SUPABASE_URL=... \
  SUPABASE_SERVICE_ROLE_KEY=... RELAYER_PRIVATE_KEY=... OWNER_PRIVATE_KEY=... \
  SEPOLIA_RPC_URL=... ADMIN_EMAILS=... SERVER_SECRET=<rand hex> OTP_RATE_LIMIT=100 \
  CORS_ORIGIN=https://backend-production-64d05.up.railway.app
> Set variables NODE_ENV, PORT, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, \
  RELAYER_PRIVATE_KEY, OWNER_PRIVATE_KEY, SEPOLIA_RPC_URL, ADMIN_EMAILS, \
  SERVER_SECRET, OTP_RATE_LIMIT, CORS_ORIGIN
```

Not deployed yet: `CONTRACT_ADDRESS` is intentionally unset because the backend's zod
config refuses to boot on a placeholder (Article IV.2 fail-closed). Wallets are not yet
funded (blocked on faucet).

## 3. Vercel frontend LIVE

```
vercel link --yes --project votechain          # linked dmuhor01/votechain
vercel env add VITE_SUPABASE_URL production
vercel env update VITE_SUPABASE_ANON_KEY production --value <anon> --type config -y
vercel env add VITE_API_URL production         # https://backend-production-64d05.up.railway.app

# rootDirectory moved to project settings (REST API) because current CLI rejects
# vercel.json property:  PATCH /v9/projects/prj_* => rootDirectory=packages/frontend
# then vercel.json relocated into packages/frontend so SPA rewrites apply

vercel deploy --prod --yes
> Production  https://votechain-jml001ceo-dmuhor01.vercel.app
> Aliased     https://votechain-ivory.vercel.app
> Ready in 29s
```

Verification against the production alias:

```
curl -s -o /dev/null -w "/: %{http_code}"   https://votechain-ivory.vercel.app/   => 200
curl -s -o /dev/null -w "/elections: %{http_code}" https://votechain-ivory.vercel.app/elections => 200
# SPA rewrite now applies after vercel.json moved into packages/frontend

grep bundle https://votechain-ivory.vercel.app =>
  https://backend-production-64d05.up.railway.app   (VITE_API_URL baked)
  https://gldfsjoikqydjxcarffr.supabase.co          (VITE_SUPABASE_URL baked)
```

## 4. Production Docker image boots

The earlier smoke-test "Uncaught Exception" was diagnosed as a port collision, not a
code fault:

```
Error: listen EADDRINUSE: address already in use :::3001
```

Cause: container ran with `--network host` (publish flags ignored) and the host's local
backend already owned port 3001. Re-run with `PORT=3999`:

```
docker run -d --name votechain-prod-test --network host -e PORT=3999 ... votechain-backend:prod
[Relayer initialized with address: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8]
[Interacting with contract at: 0x5FbDB2315678afecb367f032d93F642f64180aa3]
[Server running on port 3999 in production mode]
[Server running on port 3999 in production mode]  <- health
curl -s -o /dev/null -w "health=%{http_code}" http://127.0.0.1:3999/api/health  => 200
GET /api/stats => {"activeElections":5,"totalVotes":2,"registeredVoters":7}
```

Test container removed afterward.

## 5. Frontend local build still green (pre-deploy gate)

```
npm run build -w frontend
✓ built in 2.89s
dist/assets/index-0jJj3sfd.js  152.21 kB │ gzip: 50.07 kB
```

## Current blockers (external to code)

- Sepolia wallets not yet funded (owner + relayer); requires a faucet claim (or user-held
  funded wallet). Funding unlocks contract deploy → Railway env (CONTRACT_ADDRESS) → e2e.
- CodeRabbit GitHub App install still requires the user's click.

## Status

All work that can run without external credentials is complete, committed (SSH-signed),
and pushed to `main`. The sole remaining task is faucet funding.