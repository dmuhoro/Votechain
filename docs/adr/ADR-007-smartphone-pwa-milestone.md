# ADR-007 — Smart-phone PWA milestone (ADR-006 80/20: "mobile PWA feel" shipped)

**Status:** Accepted
**Date:** 2026-09-18
**Decision:** Ship the "mobile-first hardening of the existing SPA (PWA install, offline
no-op UI)" slice of ADR-006 now — as an installable smart-phone PWA with anti-fragile
offline behavior and **online-only voting**. Explicitly **defer** offline ballot packs
(ADR-006 Option B) and the SMS/USSD channel (ADR-006 Option A backend) to their own future
sprints.

---

## 1. Context

ADR-006 sequenced a reachability build-out: Option A (SMS/USSD online + mobile PWA feel,
~4–6 weeks) before Option B (offline ballot packs, ~3–4 months, new trust model). Sprint 3
takes the **first, self-contained slice** of that plan that needs zero changes to the vote
core: make the existing React SPA a comfortable, crash-proof Android PWA.

## 2. What was decided

1. **Installable PWA** via `vite-plugin-pwa` (build-time devDep): manifest, icons,
   theme-color, service-worker precache of the app shell, `navigateFallback` for offline
   SPA routes.
2. **Read-through offline model** (NOT offline voting): cached elections/candidates/
   results/receipts render with honest "from your saved cache" labels; voting paths fail
   fast with "reconnect to cast your vote". No vote is ever staged, queued, or written
   while offline.
3. **Vote-core invariant untouched** (Constitution Article II): casting still requires the
   Supabase auth + nullifier + relayer chain path. The vote submission path was NOT
   modified by this sprint — only the SPA UX around it (in-flight double-tap guard,
   offline pre-check).
4. **Boundary recorded, not bolted:** offline ballot packs (ADR-006 Option B) remain a
   separate subsystem requiring a provisioning + reconciliation design ADR and its own
   sprint. SMS/USSD intake (Option A backend) likewise remains unbuilt.

## 3. Consequences

- **Positive:** smartphones now get a first-class, installable experience; offline is
  truthful (no hangs, no white screens, no silent drops); vote-integrity claims are not
  weakened; smallest slice that delivers the "mobile feel" 80% of users see.
- **Negative / deferred:** feature phones (SMS/USSD) and offline ballot packs are still
  not reachable; true any-place voting without connectivity remains a separate milestone.
- **Integrity question descoped:** the offline reconciliation trust model (lost phone,
  leaked ballot, online+offline mix) is explicitly unanswered here and must be designed in
  the Option B ADR, not inferred.

## 4. Verification

Gates + live HTTPS PWA checks: `docs/evidence/2026-09-18_sprint3-mobile-pwa-anti-fragility.md`.
App live at https://votechain-ivory.vercel.app; physical Android pass tracked via
`docs/runbooks/android-pwa-test.md`.

## 5. Supersedes / relates

- Relates to: ADR-006 (this records the delivered Step 1 of its recommended sequencing).
- Does not supersede: ADR-001..004 (vote core + topology unchanged).