# Android PWA Test Runbook — VoteChain v1 (Sprint 3)

Physical-device script for the user's Android phone (Chrome 90+, Android 9+).
Every step has an **expected result**; record `PASS`/`FAIL` + note in the table at the
bottom and report back so we can append it to the evidence log (AGENTS.md rule 8).

App under test: **https://votechain-ivory.vercel.app**
Backend: https://backend-production-64d05.up.railway.app (contract Sepolia
`0x672a1D837c5C0992218205b0E81492a07D7C5EB5`).

---

## A. Install as PWA

1. Turn off Wi‑Fi → use mobile data (fresh network so SW registers from this origin).
2. Open Chrome → go to `https://votechain-ivory.vercel.app`.
3. Wait for the page to finish loading.
4. Tap Chrome menu (**⋮**) → **"Install app"** / "Add to Home screen" (or the install
   banner the browser offers).
   - Expected: installer appears with the VoteChain icon + name "VoteChain"
     (standalone mode, no address bar), or Chrome installs to the home screen.
5. Expected: a home-screen icon with the VoteChain mark launches the app **online**:
   the landing page shows live stats (`Active elections`, `Votes cast`) and
   **no** amber "Offline" banner.

## B. Online path — browse + results (no voting yet)

6. Tap **Elections** (bottom nav) → the election list loads from the live backend.
   - Expected: "General Election 2027 — Presidential" appears, no error card.
7. Tap the election → **Results** tab: candidate bars + tallies render. If the
   on-chain explorer link is shown, tap it → Sepoliascan opens in the same app.
8. Tap **Receipts** for any existing vote: receipt renders with its on-chain TX link.

## C. Offline — cached browse, no crashes

9. Turn **Airplane mode ON** (or toggle Wi‑Fi + mobile data off).
10. Relaunch the installed app (swipe it away first, reopen from home screen).
    - Expected: the app **does not white-screen or hang**. It opens to the cached
      landing page; the **amber "You are offline" banner** is visible.
11. Navigate Elections → election → Results.
    - Expected: previously-loaded elections/candidates/results are shown from cache,
      labeled with a **"cached from earlier" / stale** note. No spinner that never
      resolves, no blank page.
12. Tap around the admin screen.
    - Expected: page renders (with cached/empty state); no crash.

## D. Offline vote path — honest fail-fast

13. Still offline, open an election → **Vote** → select a candidate → **Cast vote**.
    - Expected: **no** spinner hang and **no** stale write. You get a clear
      "You are offline — reconnect to cast your vote" message (or the offline
      banner is shown); nothing is written anywhere.

## E. Recovery — reconnect is seamless and truthful

14. Turn **Airplane mode OFF**; wait for connectivity.
    - Expected: the offline banner disappears on its own (network listener fires) and
      the page refreshes to live data without a manual reload.
15. If a page was showing an error during offline, tap its **Retry**:
    - Expected: recovers to live data.
16. Re-try the vote from step D:
    - Expected: now proceeds past the offline check (full cast flow still requires the
      real OTP + connectivity as before; that is unchanged).

## F. Rapid double-tap / fragility

17. Online, while a results/load request is in flight, toggle the app to the
    background (Chrome tab) and back.
    - Expected: no stuck polling, no crash on return.
18. Double-tap the **Cast vote** submit rapidly.
    - Expected: a single submission occurs (second tap ignored by the in-flight guard).

---

## Results

Executed 2026-09-18 on Xiaomi ("dew"), Android 16, Chrome 152.0.7977.82, installed
WebAPK (same app window as a normal Chrome tab). Evidence:
`docs/evidence/2026-09-18_sprint3-phone-device-pass.md` + `2026-09-18_device-test/`.

| # | Step | PASS/FAIL | Note |
|---|------|-----------|------|
| A | Install as PWA | ✅ PASS | WebAPK `SameTaskWebApkActivity`; standalone, no URL bar; icon on home screen |
| B6 | Elections load | ✅ PASS | Work Election 2027 from live backend |
| B7 | Results render | ✅ PASS | Candidate bars + tallies (see tallies below) |
| B8 | Receipt renders | ✅ PASS | tx + block + explorer link |
| C10 | Offline launch, no blank screen | ✅ PASS | cold boot from SW precache; amber banner |
| C11 | Cached browse + stale label | ✅ PASS | elections + results/1 from cache, "last synced" note |
| C12 | Admin renders offline | ✅ PASS | renders with cached state; no crash |
| D13 | Offline vote = honest fail-fast | ✅ PASS | "Reconnect to vote." inline; nothing written |
| E14 | Banner clears on reconnect | ✅ PASS | auto-clears, no reload |
| E15 | Retry recovers | ✅ PASS | results refetch live |
| E16 | Online vote proceeds past guard | ✅ PASS | real cast landed (see below) |
| F17 | Background/foreground stability | ✅ PASS | no stuck polling, no crash |
| F18 | Double-tap single submit | ✅ PASS | exactly one cast; second tap ignored |

Real votes cast from the phone this pass (Work Election 2027):
Candidate B — tx `0x4e4c177ed1dcca6769c1cb27c00320ab992842c3d8ce1ff35ef9ddbe760876c7` @ block
11730996; Candidate C — tx `0x6e194960f98c…` @ block 11731055. Final tallies A=1, B=1, C=1.

Anything marked FAIL → report exact behavior + any console error (Chrome **⋮** →
More tools → Developer tools? On Android use `chrome://inspect` or DevTools remote
debugging via USB), and we'll patch + redeploy.

## What this runbook does NOT test

- Offline *ballot-pack voting* — that is the next-level milestone (ADR-006 Option B) and
  is deliberately out of scope for this sprint.
- A broad hardware matrix (older Android, iOS, private-mode WebView). The on-device pass
  above is the accept bar for **this** sprint; wider-device validation is ongoing.