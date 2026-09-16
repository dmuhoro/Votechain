# Evidence: Layer 1 — Dependency Alignment + All Quality Gates Green

Date: 2026-09-16
Project: VoteChain monorepo
Scope: `packages/contracts`, `packages/backend`, `packages/frontend`

## Command / step

```bash
# 1. Dependency realignment (ethers v6, hardhat 2.x, toolbox hh2 line)
npm install

# 2. Contract compile + suite (after fixing seed-election.ts signature, deploy.ts run import, test typing)
cd packages/contracts && npx hardhat compile
cd packages/contracts && npx hardhat test
cd packages/contracts && npx tsc --noEmit

# 3. Backend
cd packages/backend && npm run build
cd packages/backend && npm run test

# 4. Frontend
cd packages/frontend && npm run build
cd packages/frontend && npm run lint
```

## Observed result

- `npm install`: `added 954 packages, audited 958 packages` — resolver accepted the
  tree without `--force`, `--legacy-peer-deps`, or warnings about ethers v5 vs v6.
- `hardhat compile`: `Compiled 1 Solidity file successfully (evm target: paris)`.
- `hardhat test`: **20 passing (5s), 0 failing**.
- `tsc --noEmit` (contracts): exit 0.
- `backend build`: `tsc` emitted `dist/` with no type errors (after src/artifacts sync).
- `backend test`: 1 test file, **6 tests passed**.
- `frontend build`: `✓ built in 4.51s` (tsc clean, vite 8.3.0).
- `frontend lint`: ESLint exit 0, **0 warnings** (`--max-warnings 0`).

## Roots causes fixed

1. `hardhat ^3.7.0` / `ethers ^5.8.0` in all packages was an invalid combo —
   `@nomicfoundation/hardhat-ethers@3.1.3` peer-requires `ethers ^6.14.0` +
   `hardhat ^2.28.0`. Pinned contracts to those; backend/frontend code already used
   ethers v6 API.
2. `@nomicfoundation/hardhat-toolbox@7.x` (latest tag) is a Hardhat-3 migration
   shim that `process.exit(1)`s under Hardhat 2. Pinned to the `hh2` line (`6.1.2`).
3. `@vitejs/plugin-react@4.x` does not peer-support `vite@8`; bumped to `6.1.1`.
4. Backend had no `tsconfig.json`; created strict, `rootDir=src`, `resolveJsonModule`.
5. Backend imported contract ABI from `../../contracts/artifacts/...` which breaks
   `rootDir=src`; added `scripts/sync-artifact.mjs` to copy the compiled ABI into
   `src/artifacts/` before dev/build.
6. Contract `scripts/seed-election.ts` called 4-arg `createElection` (contract has
   6-arg signature); rewrote with explicit names/parties/start/end.
7. `scripts/deploy.ts` used `ethers.network.name` (ethers v5) — now v6 API.
8. Contract test relied on typechain delegate `.candidates()` on a mapping struct —
   ethers v6 returns plain struct without mapping accessors; rewrote assertion via
   `getResults()`.

## Gates table

| Gate | Command | Observed | Status |
|------|---------|----------|--------|
| Contract suite | `npm run test -w contracts` | 20 passing | PASS |
| Contract typecheck | `tsc --noEmit` (contracts) | exit 0 | PASS |
| Backend build | `npm run build -w backend` | dist/ emitted, no errors | PASS |
| Backend tests | `npm run test -w backend` | 6 passed | PASS |
| Frontend build | `npm run build -w frontend` | ✓ built in 4.51s | PASS |
| Frontend lint | `npm run lint -w frontend` | 0 warnings | PASS |

## Not claimed

- These gates prove compile/time-structure correctness only. They do **not** prove a
  live end-to-end vote (chain + Supabase + auth).
- Backend unit tests exercise `nullifierService` against a stubbed Supabase client;
  they do not prove Supabase RLS/table behavior.
- Full stack has not been run against the live Supabase project or a live chain.