# Evidence: Layer 4 — dialer vote live drill (deployed backend + Sepolia)

Date: 2026-09-19
Project: VoteChain monorepo — Sprint 5 (ADR-009)
Status: PASS
Environment: prod Railway backend, prod Vercel frontend, live Supabase
`gldfsjoikqydjxcarffr`, Sepolia chain.

## Claim (what we set out to prove)

A texted dialer command, received by the **deployed** backend, runs the
**real** shared cast path (`voteService.castVote`) end-to-end: it submits via
the relayer to Sepolia, records the nullifier (boundary a) and the on-chain
mapping (boundary b), produces a receipt code, and refuses a replay — with an
explicit audit outcome for every command.

## Boundary (honesty)

Physical SMS delivery requires a carrier subscription + credits (Twilio /
Africa's Talking). This drill therefore sends the **gateway webhook payload**
(`POST /api/dialer/sms` with `gateway: "simulated"`) that a carrier would
deliver. The intake, cast path, chain submission, receipt and duplicate
boundary are all real; only the radio hop is simulated. Outbound replies were
accepted by the `SimulatedSmsGateway` (no carrier credits consumed).

## Deployment under test

- Backend: `https://backend-production-64d05.up.railway.app` — redeployed
  (`railway up -s backend`, deployment `1e4bdc1e`). New route verified live:
  `GET /api/dialer/receipts/V88A42554551E` returned `404` on the old
  deployment and `200` after the new one.
- Frontend: `https://votechain-ivory.vercel.app` — `vercel deploy --prod`
  (`index-DR8li-G7.js`); `/dialer` returns `200`, `/dialer` route present.
- Contract: Sepolia `0x672a1d837c5c0992218205b0e81492a07d7c5eb5`.

## Drill data (labelled)

A dedicated verified voter was inserted for the drill:
`dialer-drill-2026-09-19@votechain.test` (id `d1a1e000-…-0001`), phone
`+254700009919`, and one `issued` dialer PIN provisioned directly (SHA-256
digest for PIN `246810`). Provisioning via `POST /api/dialer/codes` is covered
by the unit suite; this drill targets the intake. Chosen election: id 1
(`dial_code = "1"`), which is open (window confirmed `in_window = true`).

## Steps and observed output (all live)

### 1. Cast (`VOTE 1 1 246810`)
```
POST /api/dialer/sms {"From":"+254700009919","Body":"VOTE 1 1 246810","gateway":"simulated"}
```
Observed:
```json
{"message":"Vote cast successfully for Candidate A. Receipt code: V2E6A8BBA1009. Text RECEIPT V2E6A8BBA1009 anytime to verify.",
 "outcome":"voted","electionId":1,"voteCode":"V2E6A8BBA1009",
 "txHash":"0x2e6a8bba1009d6c115718dc674b0e6f737ba63762002009e36692b31d91d8295"}
```

### 2. Help
`HELP` → `outcome: "hello"` with the command grammar.

### 3. Receipt by SMS
`RECEIPT V2E6A8BBA1009` → `outcome: "receipt"`, block `11737079`, same tx.

### 4. Public receipt endpoint
```
GET /api/dialer/receipts/V2E6A8BBA1009
```
Observed: `voteCode V2E6A8BBA1009`, `electionTitle "General Election 2027 -
Presidential"`, `txHash 0x2e6a8bba…8295`, `blockNumber 11737079`,
`explorerUrl https://sepolia.etherscan.io/tx/0x2e6a8bba…8295`.

### 5. Replay (PIN rotated back to `issued` via SQL to simulate a race)
```
POST /api/dialer/sms {"From":"+254700009919","Body":"VOTE 1 1 246810"}
```
Observed:
```json
{"message":"You have already voted in this election. This vote was not counted.",
 "outcome":"duplicate","electionId":1}
```
A third attempt then returned `outcome: "no_active_code"` (the replay marked
the code `rejected`). No second transaction was submitted.

### 6. On-chain receipt (public Sepolia RPC `eth_getTransactionReceipt`)
```json
{"status":"0x1","blockNumber":11737079,
 "to":"0x672a1d837c5c0992218205b0e81492a07d7c5eb5","logCount":1,
 "topics":[["0x96c313364ec07441c94195f44ed1e5f2656059c98a7c0c68466dac90c6fd8bf9",
            "0x…0001","0x…0001"]]}
```
Topic0 resolves against the contract ABI to `VoteCast(uint256,uint256,bytes32)`
(voter 1, candidate 1) — verified with `ethers.id()` over the artifact ABI.

### 7. Database state
```
vote_records: vote_code V2E6A8BBA1009, election_id 1, block 11737079, tx 0x2e6a8bba1009d6c115…
counts: votes_e1 = 6, nullifiers_e1 = 6, rows for this tx = 1  (no double count)
dialer_codes: status = rejected, reason = duplicate
sms_intake_log (from +254700009919): duplicate 1, hello 1,
  no_active_code 1, receipt 1, voted 1
```

## Verdict: PASS

The dialer intake, on the live deployment, cast through the same real path as
an online vote, produced a human-retypable receipt code, and the two-boundary
double-vote prevention refused the replay with an explicit `duplicate` outcome
and an audit row. No secrets are contained in this file; the simulated gateway
means no carrier credits were used.
