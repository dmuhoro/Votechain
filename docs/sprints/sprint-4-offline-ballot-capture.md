# Sprint 4 — Offline Ballot Capture + Reconciliation (ADR-008)

## Theme
Turn the smartphone into a **full polling station, online AND offline**: a verified voter who
loses connectivity can still review the ballot, make a choice, and have it **counted** once
connectivity returns — without weakening the two-boundary vote-integrity invariant and with an
explicit, auditable state for every captured ballot (no silent drops).

## Design contract (ADR-008)
- Offline = **capture + durable local staging**, never autonomous casting.
- Submission reuses the **exact real vote path** (`voteService.castVote` =
  nullifier → relayer → chain → DB), shared with `POST /api/votes/cast`.
- One-time, server-signed **voucher** binds voter + election + candidate-set (HMAC, key derived
  from `SERVER_SECRET`); `offline_ballots` row records issued/consumed/rejected, `UNIQUE
  (voter_id, election_id)`.
- Outcomes are explicit: `voted` (receipt) / `duplicate` / `expired` / `rejected` / `pending`.
- Honest boundaries recorded: weaker offline coercion-resistance (paper-like), device can flip a
  capture (same as online client), no SMS/USSD channel.

## Layers
1. ADR-008 + architecture gaps update.
2. Migration `offline_ballots` (applied to prod Supabase with evidence).
3. Backend: `voteService` (shared cast path), `offlineBallotService`, offline routes + unit tests.
4. Frontend: `offlineBallots` capture store (fail-closed), `useOfflineSync`,
   BallotPage offline capture UI, `/offline` page + nav, store tests.
5. Gates, deploy (Railway + Vercel prebuilt recipe), on-device offline vote proof, docs, commits.

## Result
Filled in Layer 5 with evidence links.