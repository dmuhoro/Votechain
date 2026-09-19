# Sprint 5 — Feature-Phone Dialer Reachability (ADR-009)

## Theme
Vote from the phone a voter already owns — **no browser, no data** — through the **dialer**:
SMS shortcode / USSD-style commands (`VOTE <electionCode> <candidate> <pin>`). The vote still runs
through the **same real cast path** (`voteService.castVote` = nullifier → relayer → chain → DB) so
the chain remains the only tally. This is the final reachability frontier after Sprint 4 (offline
smartphone capture).

## Design contract (ADR-009)
- **Dialer = convenience channel for already-verified voters.** A phone is bound to a verified
  voters row (RLS-protected); it never creates an anonymous identity.
- **One-time auth PIN** (6-digit, server-random, SHA-256 digest stored, issued per (voter, election),
  expiring) — the dialer analogue of the ADR-008 voucher. Eligibility at provision, one submission
  total via the existing two-boundary nullifier.
- **Intake runs the exact shared path.** `POST /api/dialer/sms` → `voteService.castVote`. No direct
  vote writes, no second counting authority (Constitution Article II; ADR-006 §3 constraint).
- **No silent drops (Article I.6).** Every inbound command logs to `sms_intake_log` with an explicit
  outcome and an explicit reply (accepted / duplicate / expired / invalid-pin / unknown).
- **Receipt codes.** `RECEIPT <voteCode>` re-verifies a past vote on any phone / shared terminal.
- **Gateway adapter seam.** `SmsGateway` interface + `SimulatedSmsGateway` default. Twilio / AT
  adapters are explicit stubs until a carrier subscription exists — we never claim SMS delivery we
  cannot provide.

## Layers
1. ADR-009 + architecture gaps update + sprint-5 file + ADR README.
2. Migration `sms_intake_log`, `voters.phone_number`, `elections.dial_code`,
   `vote_records.vote_code` (applied to prod Supabase with evidence).
3. Backend: `dialerService` (grammar, PIN lifecycle, gateway seam) + `sms command parsing`,
   `routes/dialer.ts` + unit tests (real-path wiring: relayer never called on invalid PIN).
4. Frontend: `DialerPage` (how-to + provision a code + verify a receipt by code) + route + tests.
5. Gates, deploy (Railway + Vercel), live **simulated-gateway drill on-chain** (real voter, real
   election, real Sepolia receipt), evidence, docs, commits, push.

## Result
Filled in Layer 5 with evidence links.