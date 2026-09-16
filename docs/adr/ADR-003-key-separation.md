# ADR-003: Key Separation — Owner vs Relayer vs Admin Wallets

**Status:** Accepted
**Date:** 2026-09-15
**Deciders:** Daniel Muhoro (product owner)

## Context

`VoteChain.sol` has two privileged roles with different blast radii:

- **owner** — `createElection`, `closeElection`, `updateRelayer`. Mutating *meta-structure*.
- **relayer** — `castVote`. Mutating *vote state*.

The original scaffold (`deploy.ts`) defaulted to using the deployer as relayer when
`RELAYER_ADDRESS` was unset, and `routes/admin.ts` used the **relayer wallet** to call
`createElection`/`closeElection` — which are `onlyOwner`. With a single key, the deployer/relayer/
admin are indistinguishable, and the admin code path would revert on-chain (`Only owner can call`).

## Decision

**Three separate keys, matching the three responsibilities:**

| Role | Key | Used for |
|------|-----|----------|
| **deployer / owner** | `PRIVATE_KEY` (contracts `.env`) | Deploy + `createElection` / `closeElection` / `updateRelayer` |
| **relayer** | `RELAYER_PRIVATE_KEY` | `castVote` only |
| **backend admin (HTTP layer)** | `OWNER_PRIVATE_KEY` (backend `.env`) | Admin REST endpoints that sign owner-gated contract calls |

- `deploy.ts` always deploys with an explicit relayer address (`RELAYER_ADDRESS` env) — never
  defaults to deployer.
- `routes/admin.ts` uses a dedicated **owner-signing client** constructed from `OWNER_PRIVATE_KEY`,
  not the relayer wallet.
- The backend carries two distinct providers/wallets: read-only `provider` + `relayer` (cast) +
  `owner` (admin).

## Consequences

**Positive**
- A leaked relayer key can cast votes but cannot create/close elections or change the relayer.
- A leaked owner key cannot submit votes (it's not the relayer).
- Matches the on-chain modifiers exactly — no more silent `revert` in the admin path.

**Negative**
- Three keys to provision/secure. For a demo, two (owner + relayer) with the same backing wallet is
  operationally acceptable *only if* `castVote` stays relayer-gated.

## Alternatives rejected

- **Same key for everything** — rejected: breaks the contract's own role model; turns a "trusted
  relayer" claim into a joke (Article I).
- **On-chain admin role** — deferred; contract already gets what it needs from `onlyOwner`.