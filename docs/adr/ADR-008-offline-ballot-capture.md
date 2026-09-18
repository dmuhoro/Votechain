# ADR-008 — Offline ballot capture with one-time vouchers + on-reconnect reconciliation

**Status:** Accepted
**Date:** 2026-09-18
**Deciders:** Daniel Muhoro (product owner)
**Supersedes:** ADR-006 §3 "Option B — Offline voting (no connectivity)" sequencing note (this
ADR is the required design ADR for Option B; it does NOT supersede ADR-006 Option A — SMS/USSD
remains as scoped there, unbuilt).

---

## 1. The question

Deliver the **smart-phone offline slice of ADR-006 Option B**: a voter with no connectivity can
still act like a full polling station — review the ballot, make their choice, and have it counted
— without weakening the vote-integrity invariant (Constitution Article II) and without a single
silent drop (Article I.6).

## 2. Why a naive "cast offline, trust sync" is forbidden

Double-vote prevention is enforced at **two live boundaries**: the Supabase `nullifiers` table
(fast pre-check) and the contract's `mapping(bytes32=>bool) nullifiers` (authoritative). Both are
consulted at **submission time** (`nullifierService → relayerService → VoteChain.castVote`). A
would-be offline path that "casts the vote into a local queue and later bulk-writes it" cannot
consult those boundaries at the moment of the voter's action — it would be a claim of protection
the code does not provide (Article I.1). Therefore ADR-008 never stages a vote that bypasses the
submission path.

## 3. Decision: offline capture + reconciliation through the REAL vote path

**The word "offline" here means capture and durable local staging — never autonomous casting.**

1. **Provisioning (online).** A **verified** voter may provision a one-time offline ballot for an
   open election. The backend returns a **server-signed voucher** binding `{voter, election,
   candidate-set fingerprint}`. The signature is an HMAC-SHA256 over the canonical payload keyed
   by a domain-separated secret derived from `SERVER_SECRET` (never exposed to clients). A
   `offline_ballots` Supabase row records the vouchers as `issued`. A voter gets at most one
   issued voucher per election (`UNIQUE (voter_id, election_id)`).
2. **Capture (offline).** The device displays the cached/provisioned ballot. The voter selects a
   candidate and confirms. The device stores the captured ballot **durably** (safe-storage
   wrapper; if storage is unavailable the capture is refused with a clear reason — fail closed)
   in status `pending`, and shows "Your vote is saved. It will be submitted automatically when
   you're back online." This is an explicit, auditable local state, not a silent write.
3. **Reconciliation (on reconnect).** An offline sync loop picks up `pending` ballots and submits
   them via `POST /api/offline/ballots/submit`, which **first validates the voucher, then runs the
   identical submission code as online `POST /api/votes/cast`** (shared `voteService.castVote`).
   Outcomes are explicit:
   - `voted` → on-chain receipt (tx + block + explorer link) shown from the receipt;
   - `duplicate` → the nullifier boundary refused a replay (voter already voted); the device shows
     the honest reason, never a fake success;
   - `expired` / `rejected` → clear reason (election closed before sync, invalid candidate,
     invalid voucher), never silent.
4. **Bookkeeping.** On successful submission the voucher is marked `consumed`. The chain tally and
   `vote_records` remain the authoritative counts — this subsystem introduces no parallel counting
   surface.

## 4. Honest boundaries (what this does and does not claim)

- **Not a new counting authority.** The chain + `vote_records` stay authoritative; first
  submission wins via the existing nullifier (both boundaries).
- **Receipt-freeness offline is weaker.** A `pending` capture can be shown to a coercer before
  submission — inherent to any offline recording (the same property as paper ballots). This does
  not affect count integrity; it is documented and accepted for this milestone.
- **A compromised device can flip a capture.** The client records the choice; server-side checks
  pin voter + election + candidate-set but cannot read the voter's intent back out of a hostile
  device. Same residual risk as the online client (mitigated by the on-screen confirmstep), plus
  the coercion note above.
- **No SMS/USSD channel.** ADR-006 Option A remains future work; nothing here wires a carrier
  gateway.

## 5. Consequences

**Positive:** smartphones become a full offline polling station for already-verified voters;
eligibility is established at provision time (fail-fast, no surprise at sync); every captured
ballot has an explicit lifetime state and a reconciliation outcome; no dependency on a new
package (Node `crypto` HMAC + existing axios/safe-storage patterns); the contract is untouched.

**Negative / deferred:** provision requires a one-time connection (vouchers cannot be minted
offline); coercion-resistance of pending captures is weaker than online; lost-phones leak only a
`pending` capture that still requires the voter's session to submit (no path to mint votes).

## 6. API surface

- `POST /api/offline/ballots  { electionId }` — provision one-time voucher (verified voter, open
  election).
- `GET /api/offline/ballots` — current voucher state for reconciliation UI.
- `POST /api/offline/ballots/submit  { voucher, electionId, candidateId }` — validate voucher →
  `voteService.castVote` (identical code to `/api/votes/cast`) → consume voucher.

## 7. Verification

Unit tests for voucher integrity/tamper/one-time, real-path assertions (relayer called ⇔ voucher
valid), and the frontend capture store; live deploy + on-device offline capture→reconnect→receipt
proof documented in `docs/evidence/` (Sprint 4).