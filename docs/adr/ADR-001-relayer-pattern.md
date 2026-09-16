# ADR-001: Relayer Pattern — Voters Never Hold a Wallet

**Status:** Accepted
**Date:** 2026-09-15
**Deciders:** Daniel Muhoro (product owner)

## Context

VoteChain's identity layer is email + Supabase OTP. The target voter (a Kenyan citizen in the 2027
general-election narrative) has an email, maybe a phone, and *no crypto wallet*. Requiring MetaMask
would exclude the majority of the electorate and violate the product's founding constraint.

## Decision

The smart contract introduces a **relayer**: a trusted backend wallet that is the only account
allowed to call `castVote`. The flow is:

1. Voter authenticates with Supabase OTP and registers (national-ID hash).
2. Backend generates a deterministic nullifier and submits `castVote` on behalf of the voter via the
   relayer wallet (`onlyRelayer`).
3. The contract records `(candidateId, nullifier)` on-chain. The voter never signs anything.

This is a **meta-transaction / gas-abstraction** pattern: the platform pays gas, the voter pays
nothing and never touches the chain.

## Consequences

**Positive**
- 99% of users require zero crypto education.
- Vote append-only + tamper-evident because storage is on-chain.
- Single point of submission makes double-vote rejection enforceable at the contract level.

**Negative**
- The relayer is a trusted party; if its private key leaks, an attacker can cast unlimited votes.
  Mitigation: separate relayer + owner keys (see ADR-003), key in env only, nonce-discipline in
  `relayerService`.
- **Centralization risk**: the platform is the sole submitter. Acceptable for the testnet demo and
  for a transparent platform-run model; not a fully decentralized vote.

## Alternatives considered

- **Direct MetaMask voting** — rejected: excludes non-crypto voters, contradicts product identity.
- **On-chain registration, no relayer (`castVote` open)** — rejected: no way to bind votes to
  verified identities; open call would let anyone vote.
- **Zero-knowledge private voting** — deferred to P2; nullifiers give unlinkability, not privacy.