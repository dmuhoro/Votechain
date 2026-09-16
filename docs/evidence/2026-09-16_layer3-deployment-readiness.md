# Evidence — Layer 3 (Deployment Readiness)

**Date:** 2026-09-16
**Gate:** Layer 3 — Deployment infrastructure builds and boots correctly.

## Docker image build

```
docker build -f packages/backend/Dockerfile -t votechain-backend:layer3 .
```

**Observed:** `Successfully built f8d33803df04` — image tagged `votechain-backend:layer3`.

### What the build proves

| Step | Status |
|------|--------|
| Full contracts tree (hardhat.config.ts, contracts/) copied into build stage | ✅ fixed — was previously missing hardhat.config.ts, causing compile to fail |
| `npx hardhat compile` (Solidity 0.8.20) succeeds in container | ✅ |
| `npm run build` (tsc) emits `dist/` for backend in container | ✅ |
| `sync-artifact.mjs` copies VoteChain.json into dist successfully | ✅ |
| Runtime stage copies root `node_modules` (workspaces hoist), dist, package.json | ✅ — `packages/backend/node_modules` no longer copied (does not exist with workspace hoisting) |
| `.dockerignore` prevents node_modules/dist/artifacts/cache from entering context | ✅ created |
| Image boots: `curl http://127.0.0.1:3111/api/health` → `200` against real compose-Supabase | ✅ |

```
$ docker run --rm -d -p 3111:3001 --name vc-l3 \
  -e PORT=3001 \
  -e SUPABASE_URL=http://127.0.0.1:54321 \
  ... (all env vars) \
  votechain-backend:layer3

$ curl http://127.0.0.1:3111/api/health
{"status":"UP","timestamp":"..."}  → HTTP 200
```

## Vercel monorepo config

```
Before: vercel.json at repo root with outputDirectory "dist", framework "vite"
After:  added "rootDirectory": "packages/frontend"
```

**Observed:** Without `rootDirectory`, Vercel would build at repo root and look for `dist`
at root — but the frontend builds into `packages/frontend/dist`. Setting `rootDirectory`
makes Vercel treat the workspace package as the app root.

## Railway config

`packages/backend/railway.toml`: startCommand `node dist/index.js`, healthcheckPath
`/api/health`, Dockerfile builder. Railway sets PORT automatically. Config verified intact —
no changes needed.

## Not claimed

- This evidence does **not** prove the Docker image is production-secure (no security
  scan performed).
- Vercel deploy cannot be proven locally (requires `vercel deploy` or git push to the
  linked project). The config is correct per Vercel monorepo docs.
- Railway deploy cannot be proven locally (requires Railway CLI or git push to the linked
  project). The config matches Railway Dockerfile builder requirements.
- The `supabase/.gitignore` and local stack config added in Layer 2 commit `91e2ac1`
  are not re-proved here; that work was committed and verified in the prior evidence file.
