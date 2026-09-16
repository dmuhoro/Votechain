# ADR-002: Two-Boundary Double-Vote Prevention via Auction-Style Nullifiers

**Status:** Accepted
**Date:** 2026-09-15
**Deciders:** Daniel Muhoro (product owner)

## Context

A voter must be able to vote **exactly once** per election. The platform has two stores with
different trust properties:

- **Supabase (`nullifiers` table)** — fast, off-chain, but only as trustworthy as the service-role
  key. A compromised key or a TOCTOU bug could silently allow a double vote here.
- **The chain (`VoteChain.nullifiers`, `mapping(bytes32 => bool)`)** — slow, immutable, and
  authoritative once the relayer submits.

If the platform only checked Supabase, a backend bug could let a voter cast twice. If the platform
only checked the chain, it would still work, but gas is spent on every rejection attempt and the
fast pre-check is lost.

## Decision

**Enforce double-vote prevention at two independent boundaries (Article II of the Constitution):**

1. **Off-chain pre-check (Supabase):** `nullifierService.checkAndStoreNullifier` does a SELECT
   (reject if present) then INSERT into `nullifiers`. The table has `UNIQUE (election_id,
   nullifier_hash)`, so a concurrent duplicate insert is rejected by the DB (the race backstop).
   This gate catches the 99% case cheaply and *before* spending gas.
2. **On-chain authoritative gate (contract):** `castVote` reverts with `"Already voted"` if
   `election.nullifiers[nullifier]` is true. This is the final, immutable authority. Even if the
   off-chain layer is bypassed or corrupted, the chain refuses the second vote.

A nullifier is deterministic: `0x` + `SHA-256("${voterId}-${electionId}-${SERVER_SECRET}")`. The same
voter + same election always yields the same nullifier at both boundaries.

## Consequences

**Positive**
- A single compromised layer cannot create a double vote (the other layer still blocks it).
- Cheap rejections (no gas) for the common duplicate case.
- Voter identity never stored on-chain — only the nullifier hash.

**Negative**
- Two stores must stay consistent. If the on-chain tx fails *after* the Supabase INSERT, the
  nullifier is burned (voter locked out). Mitigation is tracked as a P1 (reconciliation / release
  of the off-chain nullifier when the on-chain submission fails with a known reason).
- The off-chain gate is a speed optimization, not a security boundary on its own; we never claim
  otherwise.

## Alternatives considered

- **Supabase-only** — rejected (Article I: a gate that can pass while the real path stays
  unguarded is a safety hazard, not a safety).
- **Chain-only** — rejected: every duplicate vote costs gas and the fail path is slow.