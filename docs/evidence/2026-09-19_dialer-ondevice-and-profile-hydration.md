# Sprint 5 — On-Device Dialer Pass + Profile-Hydration Fix

Date: 2026-09-19
Status: PASS
Related: ADR-009, [sprint-5-dialer-reachability.md](../sprints/sprint-5-dialer-reachability.md),
[2026-09-19_dialer-sms-live-drill.md](2026-09-19_dialer-sms-live-drill.md)
Evidence type: on-device (physical Android phone) + deployed backend + Sepolia on-chain
Raw artifacts: [2026-09-19_dialer-device/](2026-09-19_dialer-device/)

## Claim (what we set out to prove)

On a **physical Android phone** running the deployed VoteChain PWA, a verified voter can drive the
whole dialer provisioning flow — bind a phone, issue a one-time PIN, read the exact SMS command — and
then verify their vote by receipt code after the intake runs on the deployed backend and lands a
`VoteCast` event on Sepolia.

## Bug found on-device (and fixed in this change)

**Symptom.** A voter who is verifiably `is_verified: true` in prod still saw the amber
“available to verified voters only” banner, and the **Bind phone** button was permanently disabled.

**Root cause.** The frontend never loads the voter's authorization flags. The Supabase session proves
identity but does not carry `is_verified` / `is_admin`; `AuthCallbackPage` and `authStore.initialize`
both hardcoded `is_verified: false, is_admin: false`, and nothing ever called the existing
`GET /api/auth/me`. The DialerPage gates the bind action on `user.is_verified`
(`DialerPage.tsx:112,137`), so the dialer UI was unreachable for every user. The same flags feed the
Admin nav item (`MobileBottomNav.tsx:23`) and the AdminPage redirect (`AdminPage.tsx:25`), so admin
surfaces were likewise dead.

**Fix.**

- New `packages/frontend/src/lib/auth.ts`: `getProfile()` calls `GET /api/auth/me`; `toVoter()`
  normalizes the response.
- `authStore.initialize()` hydrates the profile after restoring the session (offline-tolerant).
- `AuthCallbackPage` hydrates the profile after sign-in.
- New `packages/frontend/src/lib/auth.test.ts` (2 tests).

Raw before/after: `2026-09-19_dialer-device/01-auth-hydration-before.txt` and
`02-auth-hydration-after.txt`.

## Environment under test

- **Device**: `49IZ6DJ7SONNQOBE` (Android, USB; Chrome for Android, CDP over ADB `tcp:9222`).
- **Frontend**: `https://votechain-ivory.vercel.app` — post-fix bundle `index-DRmLaM44.js`.
- **Backend**: `https://backend-production-64d05.up.railway.app`
- **DB**: Supabase prod `gldfsjoikqydjxcarffr`; migration `20260919090000_dialer_sms` applied.
- **Chain**: Sepolia, contract `0x672a1d837c5c0992218205b0e81492a07d7c5eb5`.
- **Voter**: `20a83dd0-59b1-4dc4-be2c-cf7f7bb26577` (verified, fresh for this drill).

## Steps (captured live)

| Step | Action on device | Observable result |
|------|------------------|-------------------|
| 1 | Inject verified session, clear SW+caches, load `/dialer` (post-fix bundle) | Verified-only banner **gone**; bind button disabled only while the phone field is empty |
| 2 | Type `+254700009920`, tap **Bind phone** | Bind button enables; “Bound: +254700009920” (screenshot `02-phone-bound.png`) |
| 3 | Tap **Issue PIN** | Device shows PIN `504864` and command `VOTE 1 1 504864` (screenshot `03-pin-issued.png`) |
| 4 | Simulate the carrier webhook with that exact command | `outcome:"voted"`, receipt `V0B30046FCCB4`, tx `0x0b30046f…44b6` |
| 5 | Type receipt code, tap **Verify** | Device shows “Vote verified successfully” + tx `0x0b30046f…44b6` (screenshot `04-receipt-verified.png`) |

## On-chain + replay verification

- `GET /api/dialer/receipts/V0B30046FCCB4` → block **11737270**.
- Sepolia receipt: `status 0x1`, `to 0x672a1d83…`, 1 log, topic0
  `0x96c313364ec07441c94195f44ed1e5f2656059c98a7c0c68466dac90c6fd8bf9` = `VoteCast(uint256,uint256,bytes32)`.
- Replaying the same `VOTE` command → `{"outcome":"no_active_code"}`, no second transaction.

## Result

**PASS.** The profile-hydration fix restores the verified-voter paths (dialer bind + admin nav), and
the dialer flow works end-to-end from a real phone UI through the deployed backend to Sepolia.

## Honest boundary (unchanged)

- The **carrier radio hop is simulated**: no SMS gateway subscription/credits are configured
  (`SmsGateway` default is `SimulatedSmsGateway`). The webhook payload used here is the exact shape a
  Twilio/Africa's Talking gateway posts; everything down-range of it is the real production path.
- Physical delivery and USSD menu navigation remain a procurement/enablement step, not code.
