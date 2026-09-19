# ADR-009 — Dialer (SMS/USSD) vote intake with one-time auth PIN

**Status:** Accepted
**Date:** 2026-09-19
**Deciders:** Daniel Muhoro (product owner)
**Relates to:** ADR-006 §3 "Option A — Online SMS/USSD voting (feature phones)" — this ADR is
the required design ADR for the dialer slice; it does NOT supersede ADR-006 or ADR-008.

---

## 1. The question

Sprint 4 delivered the smart-phone offline slice (ADR-008). The remaining reachability frontier
is the **phone a voter already owns that has no browser and no data** — a feature phone. Reach it
through the **dialer**: SMS shortcode / USSD-style text commands (`VOTE <electionCode> <candidate> <pin>`).
The vote must still run through the **exact same real cast path** (nullifier boundary a -> relayer ->
chain boundary b -> vote_record) so the chain remains the only tally.

## 2. Why a naive "text the vote to a number" is forbidden here

ADR-006 §3 flags the critical constraint: *a phone number is not a verified voter identity the way a
national ID is*. Therefore the dialer channel must be staged as **a convenience channel for
already-verified voters** and must not weaken registration/verification. Concretely:

1. A phone is bound to an existing verified voter row (RLS-protected), never a new anonymous identity.
2. To cast, the voter proves control of **their** phone (the binding) AND a **one-time auth PIN**
   provisioned to that same verified voter for that election — analogue of the ADR-008 voucher,
   not a second authentication system.
3. The intake never writes a vote directly. It calls the shared `voteService.castVote`, so the
   two-boundary nullifier (Constitution Article II) is enforced at submission time exactly as online.
4. No silent drops (Article I.6): every inbound command is recorded in `sms_intake_log` with an
   explicit outcome; the voter always gets an explicit reply (vote accepted with a receipt code,
   duplicate, expired, invalid pin, unknown command).

## 3. Decision

**Dialer/SMS intake is a new front door on the same vote core.** The carrier delivery seam
(Twilio / Africa's Talking webhook + SMS OTP) is the one documented external dependency; the intake
route, command grammar, PIN provisioning, audit log, and receipt-by-code lookup are fully built and
proven today through a simulated-gateway drill against live Railway/Supabase/Sepolia.

1. **Identity binding.** `voters.phone_number` (UNIQUE, nullable) is the dialer identity. Only a
   verified voter's row may carry a phone; the backend binding path enforces `is_verified`.
2. **Provisioning (online, SPA).** A verified voter requests a dialer code for an open election.
   Backend returns a **6-digit one-time auth PIN** (server-random; only its SHA-256 digest is
   stored), bound to `{voter, election, bound phone}`, expiring, at most one active (issued) code per
   (voter, election). This is the dialer analogue of the offline voucher: eligibility at provision
   time, one submission total via the nullifier.
3. **Intake (carrier webhook shape).** `POST /api/dialer/sms` accepts a gateway-normalized message
   `{ From, Body, MessageSid?, gateway }` and parses:
   - `VOTE <electionCode> <candidate> <pin>` — resolve election by `dial_code`, resolve the voter by
     `From` phone, verify the issued PIN (timing-safe, not consumed), verify election open + candidate
     exists, then call **the same `voteService.castVote`**. On success the PIN is consumed and the
     reply carries a short **vote code**; on failure the reply states the explicit reason.
   - `RECEIPT <voteCode>` — public on-demand verification of a past vote (no voter identity).
   - anything else — `HELP` reply with the grammar.
4. **Receipt codes.** `vote_records.vote_code` (UNIQUE) is a short, human-typable code derived from
   the transaction hash. The voter can re-verify on any phone/shared terminal: `RECEIPT <code>`.
5. **Gateway adapter seam.** `dialerService` consumes an `SmsGateway` interface. A `SimulatedSmsGateway`
   is the default (captures replies; drives tests + the live drill). Twilio / Africa's Talking
   adapters are explicit stubs that throw "not wired" until a carrier subscription + credits exist —
   we do not claim SMS delivery we cannot provide (Article I.1).

## 4. Honest boundaries

- **No SMS delivery today.** Physical shortcode delivery needs a carrier gateway subscription +
  credits (external account/money). The code to the seam is shipped; the seam itself is documented.
- **No SMS OTP.** Login stays email-OTP via Supabase (GoTrue SMS OTP is a config-time carrier topic,
  out of scope here). Dialer auth is the bound phone + one-time PIN, not an SMS OTP flow.
- **No new counting authority.** Chain + `vote_records` stay authoritative; first submission wins via
  the existing nullifier at both boundaries.
- **Phone binding is not national-ID verification.** It is an opt-in convenience binding on top of the
  required verified identity.

## 5. Consequences

**Positive:** the last reachability frontier (feature phones via the dialer) is designed and shipped
to its real boundary; the grammar, PIN lifecycle, audit log, and verification are all proven by the
simulated-gateway drill on-chain; no new runtime dependency (Node `crypto` + existing supabase/zod).

**Negative / deferred:** physical SMS + SMS OTP await carrier credits; USSD live menus await a USSD
gateway; a lost phone simply means the voter re-binds a new number (identity still their verified row).

## 6. API surface

- `POST /api/dialer/codes  { electionId }` (protect, verified, phone bound) — provision one-time PIN
  for an open election.
- `GET  /api/dialer/phone   ` (protect) — current phone binding state (nullable).
- `POST /api/dialer/sms     ` (webhook shape; not protect-gated) — gateway normalizes the inbound
  message; the PIN + phone binding are the credentials.
- `GET  /api/dialer/receipts/:code` — public receipt lookup by vote code.

## 7. Verification

Unit tests for grammar parsing, PIN lifecycle (provision/verify/consume/expire/reuse), real-path
assertions (relayer called ⇔ valid PIN + open election; never otherwise), receipt-by-code lookup, and
no-silent-drops (every intake logs an outcome). Live simulated-gateway drill on Sepolia recorded in
`docs/evidence/` (Sprint 5).