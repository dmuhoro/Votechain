# Device evidence — Android PWA full pass with real on-chain votes

Date: 2026-09-18
Device: Xiaomi ("dew"), Android 16, Chrome 152.0.7977.82, driven over adb/CDP
Prod URLs under test:
- Frontend (PWA): https://votechain-ivory.vercel.app (bundle `index-CSpFMtXi.js`)
- Backend API: https://backend-production-64d05.up.railway.app
- Supabase: https://gldfsjoikqydjxcarffr.supabase.co
- Contract: `0x672a1D837c5C0992218205b0E81492a07D7C5EB5` (Sepolia)

Raw snapshots: `docs/evidence/2026-09-18_device-test/01…18`.

## Result: all function-test steps PASS on the installed PWA

| # | Check | Result |
|---|-------|--------|
| 01 | Online elections list | PASS |
| 02 | Online results + votes | PASS |
| 03 | Online receipt (tx + block) | PASS |
| 04 | Online ballot renders candidates | PASS |
| 05 | Login page (magic-link, no wallet) | PASS |
| 06 | PWA install: WebAPK, standalone, icon | PASS |
| 07 | Installed-PWA offline cold boot (SW precache) | PASS |
| 08 | Offline cached elections browse | PASS |
| 09 | Offline cast fail-fast ("Reconnect to vote") | PASS |
| 10 | Reconnect clears banner, results refetch | PASS |
| 11 | Navigation sweep: zero exceptions, zero failed loads | PASS |
| 12 | **Real on-device votes land on chain** (2 votes this session) | PASS |

## Votes (Work Election 2027, id 1)

| Voter | nationalId | Candidate | tx | block |
|-------|-----------|-----------|----|-------|
| hellodannymuhoro@gmail.com (operator, admin-verified) | DEV-ONPHONE-2026 | B | `0x4e4c177ed1dcca6769c1cb27c00320ab992842c3d8ce1ff35ef9ddbe760876c7` | 11730996 |
| alice@local.votechain (verified via operator admin token) | DEV-SECOND-2026 | C | `0x6e194960f98c…` (full hash on device receipt) | 11731055 |

Final tallies on device: A=1, B=1, C=1 (total 3). The two device votes are the two
newest on-chain. NationalId hashes verified server-side; raw values not repeated here.

## Fixed this session (all live in prod)

1. **Cast timeout too short (15s)** — relayer confirm takes longer than the old
   `api.ts` default; device showed "Request timed out" while the vote actually landed.
   Fix: `useVote.ts` casts with `timeout: 60000`. Re-cast completed "Vote confirmed" —
   no timeout (commit `…`).
2. **Vercel CLI deploy wipes VITE_ envs** — a `vercel --prod` from the frontend dir
   produced a bundle pointing at `localhost:3001` (fell back to local API on phone).
   Working recipe: pull prod env, write `^VITE_` lines to `packages/frontend/.env.local`,
   build locally, `vercel build --prod` + `vercel deploy --prebuilt --prod` + `vercel alias
   set … votechain-ivory.vercel.app`. Prod now serves the correct bundle.
3. **`/verify-otp` rejects valid 8-digit prod OTPs** — `token.length > 6` heuristic
   misrouted prod's numeric codes into the magiclink branch. Fixed with a
   `^\d{6,8}$` format check; verified 200 against prod, deployed via Railway.
4. **Results polling wedge on offline PWA boot** — fixed previously (`5858f7f`); the
   on-device offline cold-boot pass confirms it.

## Commands that produced the observed state

- Fast-mount env (no network e2e needed):
  `node get-prod-session.mjs <email>` — prod service-role `generateLink` +
  `verifyOtp({email, token: otp, type:"email"})` → real session JSON
  (browser login = Supabase client, so a browser-valid session is correct).
- Session injection: `localStorage['sb-gldfsjoikqydjxcarffr-auth-token'] = <session>`
  then `/auth/callback` (AuthCallbackPage reads browser session).
- Voter verify: supabase `auth.admin.updateUserById` PATCH `{last_sign_in_at?: …}` per
  route semantics (is_verified = admin PATCH on the voter row) as operator admin.
- Offline boot: `adb shell svc wifi disable + svc data disable`, `am force-stop
  com.android.chrome`, relaunch icon; check `navigator.onLine`, banner text, cached data.
- Final sweep: CDP session with zero `Runtime.exceptionThrown` / zero failed loads.

## Caveats

- Device casts went through admin-verified test identities; votes are real but in the
  test election. Same path as live users (relayer). No wallet keys on the device.
- `probe-verify@local.votechain` / `probe-fix@local.votechain` auth rows were created in
  prod Supabase while probing the OTP route — not voters, not linked to any election.
- Full hashes/blocks: Candidate B tx is exact above; Candidate C full hash + block are
  on the on-device receipt (prefix `0x6e194960f98c`).