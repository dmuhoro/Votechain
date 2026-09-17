# ADR-006 — Mobile & OTP reachability (feature phones, online + offline)

**Status:** Proposed (impact assessment; no code written yet)
**Date:** 2026-09-17
**Decision:** Extend reachability to SMS/USSD feature phones first (online), and evaluate
offline ballot packs as a follow-on only if the online SMS path proves operational demand.

---

## 1. The question

Can VoteChain be made functional and usable:

- on **feature phones** (no browser/app store, no GPRS/3G data) via **OTP**, and
- on any **mobile device**, **online** and **offline**, in a way that still proves the
  election result numbers cannot be tampered with?

## 2. What is reachable today

Current architecture (ADR-004): Vercel (React SPA) → Railway (Express) → Supabase
(auth + read model + nullifiers) → Sepolia via relayer. Authentication is email OTP
(Supabase Auth magic link / 6-digit code). The **lead layer (auth) already uses OTP** —
Supabase emits the same 6-digit code to email today, and GoTrue supports SMS OTP (Twilio)
as a drop-in channel.

So "OTP" is not a new concept here; the missing pieces are:

1. an **SMS/USSD delivery + voting channel** for phones with no browser, and
2. an **offline path** so votes can be recorded when there is no connectivity at all.

## 3. Architecture impact — by option

### Option A — Online SMS/USSD voting (feature phones, network required)

Voting under Option A is SMS/USSD-hybrid: voter sends a shortcode vote (`VOTE <election> <candidate>` or a
USSD menu), the carrier gateway (e.g. Africa's Talking, Twilio) forwards it to a new
backend intake endpoint that runs the *identical* vote path (nullifier check → relayer →
chain). The voter gets back a vote code they can later verify on a shared/borrowed phone
or a public results terminal.

**Does it change the architecture? Partially — it extends the front-door, not the core:**
the contract, relayer, nullifier, and read model are untouched. The new surface is a
back-end intake route + a carrier-gateway subscription + an SMS OTP source (phone number,
already supported by GoTrue). The two-boundary nullifier invariant (Article II) is
preserved because the vote still goes through `relayerService.submitVote`.

**Critical constraint (honesty rule):** a phone number is *not* a verified voter identity
the way a national ID is. SMS-based voting must be explicitly staged as "voter convenience
channel for already-verified voters" and must NOT weaken the registration/verification
process.

### Option B — Offline voting (no connectivity)

An official "ballot pack" is provisioned in advance (like printed ballots): the backend
issues per-voter signed, encrypted ballot cards (QR or shortcodes) while online; the voter
selects a candidate on the phone offline; the local app signs the vote and queues it;
results are synced when connectivity returns. The chain remains the final, authoritative,
non-tamperable record.

**This DOES change the architecture** in three ways:

1. **Ballot provisioning service** — pre-issued, non-reusable ballot keys (new service,
   must mirror the two-boundary nullifier so a provisioned offline ballot cannot be
   replayed after sync).
2. **Offline client state** — a local-first component (adds measurable complexity to a
   browser SPA, or a new thin client for feature phones with local storage).
3. **Reconciliation layer** — synced ballots must match voter eligibility, the offline
   count, and the on-chain count; this is a genuine new integrity surface (what happens
   when a phone is lost, a ballot pack leaks, or sync conflicts with an online vote the
   same voter cast). This is not "the same code, offline" — it is a new trust model.

## 4. 80/20 estimate (the demands to bring it to life)

Applied to "voting on the devices humans actually have, without anyone tampering with
result numbers":

**The 20% of work that delivers ~80% of the value:**

| Task | Effort (part-time, seasoned dev) | Notes |
|------|--------------------------------|-------|
| SMS OTP on login (GoTrue Twilio/SMS source) | ~2–4 days | Channel swap, no auth redesign |
| SMS intake endpoint (shortcode → vote path) | ~3–5 days | Reuses `submitVote` + nullifiers verbatim |
| Feature-phone friendly vote code/hash receipt | ~2–3 days | SMS back the receipt + verify-on-demand |
| Carrier gateway integration (AT/Twilio) + rate limits/extrusion guards | ~1 week | Ops, not core logic |
| Mobile-first hardening of existing SPA (PWA install, offline no-op UI) | ~3–5 days | Reach every smartphone |
| **Subtotal — Option A (online SMS + feature phones + mobile)** | **~4–6 weeks** | Delivers majority of reach value today |

**The 80% of work that delivers the remaining ~20% (offline):**

| Task | Effort | Notes |
|------|--------|-------|
| Ballot pack provisioning + non-reusable ballot keys | ~2–3 weeks | New integrity surface |
| Offline client/local queue + tamper-evidence | ~2–3 weeks | Local-first component |
| Sync + reconciliation (offline count vs chain count vs eligibility) | ~3–4 weeks | Hardest part |
| Loss/theft/replay/mix-of-online+offline scenarios | ~2 weeks | New trust model, needs a design ADR first |
| Feature-phone local storage (shortcodes/QR on 2G handsets) | ~2–4 weeks | Constrained-device UI |
| **Subtotal — Option B (offline)** | **~3–4 months** | New subsystem, must be its own sprint |

**Overall:** Option A (online, via SMS/USSD on feature phones + mobile/PWA on smartphones)
is roughly **4–6 weeks** and does **not** change the core architecture (it widens the
front door). Option B (offline any-place voting) is **2–3× that, ~3–4 months**, and
**does** change the architecture — it is a new ballot-provisioning + reconciliation
subsystem with its own trust model. Both still use the same chain/relayer/nullifier core,
so the "the numbers in the official result cannot be tampered with" proof carries through
because the chain remains the authoritative tally.

## 5. Recommended sequencing (80/20)

1. **Ship Option A** as ADR-006 scope: SMS OTP + SMS/USSD vote intake + mobile PWA feel.
   Target: roughly 4–6 weeks. Proof goal: "vote from the phone in your pocket, feature or
   smart, online in under a minute."
2. Google-header honesty: we must state clearly that **offline voting requires a
   deliberately designed trust model** — it must NOT be bolted on as "send votes in the
   dark and trust sync." Only a design ADR (ballot pack + reconciliation) after Option A
   is live should unlock Option B.
3. If Option B is a hard requirement for the product's claim ("elections on devices
   humans have, even with no signal"), add a **separate sprint** for the ballot-pack
   subsystem and treat it as a new subsystem per the repo's governance rule 9
   (feature freeze while P0s open — none currently open).

## 6. Decisions captured

- **Yes**: extend the front door with SMS/USSD outside the SPA (Option A) without touching
  the vote core — enables feature phones + OTP online.
- **Not now**: offline ballot packs (Option B) change the architecture (new provisioning +
  reconciliation subsystem); phased after Options A's success; requires its own ADR + sprint.
- **Invariant kept**: all channels must run through `relayerService.submitVote` + the
  two-boundary nullifier; no channel may write votes directly.