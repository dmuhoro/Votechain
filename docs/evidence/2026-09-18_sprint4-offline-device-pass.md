# Sprint 4 — Offline Device Pass (ADR-008, Layer 3 / on-device)

Date: 2026-09-18
Status: PASS
Related: ADR-008, [sprint-4-offline-ballot-capture.md](../sprints/sprint-4-offline-ballot-capture.md), [ADR-001 review](../evidence/2026-09-16_layer2-local-vote-path.md)
Evidence type: on-device (physical Android phone) + server + Sepolia on-chain

## Claim (what we set out to prove)

On a **physical Android phone** running the deployed VoteChain PWA, a voter can:

1. Download a signed ballot **while online** (voucher issued on the server).
2. Go **offline** (airplane mode) and capture their vote — the ballot is stored
   only in the device vault (`vc_offline_ballots`), never sent.
3. Reconnect; the app **automatically submits** the captured ballot through the
   exact same server path as an online vote, the server voucher flips to
   `consumed`, and a VoteChain `VotedCast(..., ..., merkleRoot)` event lands
   on Sepolia.

This is the last layer (Layer 3) of Sprint 4 / ADR-008.

## Environment under test

- **Device**: `49IZ6DJ7SONNQOBE` (Android, USB) — physical phone, ADB-connected,
  Chrome for Android with remote debugging enabled.
- **Frontend** (captive/prod alias): `https://votechain-ivory.vercel.app`
  (bundle `index-DBup5EdB.js` → updated to `index-DZEAMCvC.js` after the
  BallotPage first-capture fix; see fix note below).
- **Backend** (prod Railway): `https://backend-production-64d05.up.railway.app`
- **Supabase** prod project `gldfsjoikqydjxcarffr`; migration
  `20260918090000_offline_ballots` applied (see
  [2026-09-18_offline-ballots-migration.md](2026-09-18_offline-ballots-migration.md)).
- **Chain**: Sepolia — VoteChain contract
  `0x672a1d837c5c0992218205b0e81492a07d7c5eb5`, relayer
  `0xdb38aa5c58adA28F1A3c6fBB9CD9110118fdacB4`.

## Bug found and fixed during this pass

`BallotPage.tsx` — the offline capture branch required a previously-captured
ballot (`getOfflineBallot`) before allowing a capture. The **first** offline
capture uses the signed voucher that was provisioned online
(`getSignedVoucher`); requiring an existing captured ballot made the first
offline capture fail ("No offline ballot is available").

**Fix**: offline capture now resolves the voucher as
`existing?.voucher ?? getSignedVoucher(electionId)` and uses it to
`captureOfflineBallot(...)` (status `captured`). Also mounted a global
`OfflineSync` component at app level so reconnect auto-submit fires from any
page (previously it only ran on the `/offline` page).

Files: `packages/frontend/src/pages/BallotPage.tsx`,
`packages/frontend/src/components/OfflineSync.tsx` (new),
`packages/frontend/src/App.tsx`,
`packages/frontend/src/hooks/useOfflineSync.ts` (module-level sync lock).

## How the device was driven

CDP over ADB (`adb forward tcp:9222 localabstract:chrome_devtools_remote`),
npm links `/tmp/opencode/device-test/cdp.mjs` — Runtime.evaluate against
`ws://localhost:9222/devtools/page/1016` (VoteChain PWA tab). Airplane mode
toggled via `adb shell cmd connectivity airplane-mode on|off`.

## Evidence steps (all captured live)

| Step | Action on device | Observable result |
|------|------------------|-------------------|
| 1 | Load prod PWA online as a **new verified voter**, open Ballot #1 | Elections list renders; flight session injected; path is the unpublishable prod frontend |
| 2 | Open ballot online (provision offline ballot) | Server voucher for election 1: status `issued` (server view), 20-voucher-issued.png |
| 3 | `airplane-mode on` → `navigator.onLine == false` | Device offline; `online:false` confirmed |
| 4 | Select Candidate A, tap Capture Vote | `vc_offline_ballots` vault now holds **one captured ballot**: `status:"captured"`, includes the signed voucher; 21-offline-captured.png |
| 5 | `airplane-mode off`, reconnect | **Auto-submit fires on mount** (global OfflineSync); vault ballot flips to `status:"submitted"` with `txHash`; server voucher flips to `consumed` with `consumed_at` |
| 6 | Verify on-chain | Sepolia receipt: `status:"0x1"`, `logCount:1`, `to:0x672a1d83…`, event topic `0x96c31339…` = `VotedCast(voter, candidate, merkleRoot)` with voter=1, candidate=1, block **11731807** |

### Final vault + server snapshot (read from the device, online)

```jsonc
// device: localStorage["vc_offline_ballots"]
[{"electionId":1,"status":"submitted",
  "txHash":"0x4126431e8ce2891fbc0ab917435dbebec7c9fbe59bd1af5b843e0bc6eaaf1431"}]

// server: GET /api/offline/ballots (vouchers for election 1)
[{"electionId":1,"status":"consumed",
  "consumed_at":"2026-09-18T16:19:27.762Z"}]
```

### On-chain receipt (Sepolia, via RPC `eth_getTransactionReceipt`)

```jsonc
{
  "transactionHash": "0x4126431e8ce2891fbc0ab917435dbebec7c9fbe59bd1af5b843e0bc6eaaf1431",
  "status": "0x1",
  "blockNumber": 11731807,
  "to": "0x672a1d837c5c0992218205b0e81492a07d7c5eb5",
  "logs": [{
    "topics": [
      "0x96c31339a73a3eadbf9b2c3c06b3c3b2318dffdb078b3781deaa1a2b0b02c842", // VotedCast(uint,uint,bytes32)
      "0x…0001", // voter id 1
      "0x….0001"  // candidate id 1
    ]
  }]
}
```

## Result

**PASS.** Article I.4 (relayer only when a valid signed vote exists) and
Article I.6 (no silent drops) hold end-to-end on the real device: the vote is
stored on-device while offlineable, auto-submitted on reconnect through the
same `voteService.castVote` path as an online vote, confirmed `consumed` by
the server, and the ballot event is on Sepolia.

## Included in this commit

- Fix above (BallotPage first-capture voucher use + global OfflineSync mount)
- This evidence file
