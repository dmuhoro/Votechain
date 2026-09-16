# VoteChain Engineering Constitution

> The non-negotiable operating rules for every task in the VoteChain repository.
> This document is the **highest-authority engineering governance**. It overrides convenience,
> speed, and scope-creep in favour of correctness. Conflicts with any other doc resolve here.

---

## Article I — Execution-Safety Guarantees

1. **Never let code claim a protection it does not actually provide.** False confidence is worse
   than no protection. If an "evidence" gate, grep, or test can pass while the real production path
   stays unguarded, the work is not done.
2. **Enforcement goes at the real boundary.** Before wiring any guard into the voting path, read the
   actual code and find the true submission path (where `castVote`, `createElection`,
   `checkAndStoreNullifier`, or the relayer submits to the contract). Insert protection there, not in
   a shared helper only a demo path uses.
3. **Fail closed, never fail open.** Defaults must refuse, not silently allow. A voter who cannot be
   cryptographically verified is never granted a nullifier. When unsure, choose the conservative cap.
4. **Proof must exercise the real path.** A unit test of a standalone service does not prove wiring.
   Tests must assert that the actual relayer submission is never called when a guard refuses a vote.
5. **Say no early, loudly.** If a plan has a flaw (wrong insertion point, false gate, scope that
   contradicts its own constraints), say so explicitly and propose the corrected version before
   executing. Do not execute a flawed plan "because it's close enough."
6. **No silent drops.** Rejections are explicit: the caller gets a clear reason, an audit record, and
   a metric.

---

## Article II — Vote Integrity Invariant (The Highest-Priority Invariant)

1. Every vote is recorded on-chain with a **nullifier**: a deterministic `SHA-256` hash over
   `voterId-electionId-SERVER_SECRET`. The same voter + same election always yields the same
   nullifier. No voter identity is stored on-chain.
2. **Double-voting prevention is enforced at two independent boundaries**: (a) the Supabase
   `nullifiers` table (unique on `nullifier_hash`) as a fast pre-check, and (b) the contract's
   `mapping(bytes32 => bool) nullifiers` as the authoritative final gate. Both must block a replay.
3. A failed on-chain transaction **must not silently burn a nullifier**. The pre-check and the
   submission must be reconciled so a rejected vote can be retried without locking the voter out.
4. The relayer wallet is the **only** account allowed to submit `castVote` (`onlyRelayer`). Voters
   never need MetaMask.
5. Election creation/closing is **owner-gated** (`onlyOwner`). Admin routes in the backend must sign
   with the owner (deployer) key for those operations, never the relayer key.
6. A cross-election or cross-voter vote leak is a **P0 defect** regardless of environment.

---

## Article III — Voter Privacy & Identity

1. No plaintext national ID is ever stored. Only a `SHA-256` hash (`national_id_hash`) is written to
   Supabase.
2. Nullifier hashes are public on-chain by design (audit transparency) — but they must be non-reversible
   to identity. `SERVER_SECRET` is the key material; it must be ≥ 32 chars, unique per deployment, and
   never committed.
3. The `voters` table is RLS-protected: a voter can read only their own record.
4. `vote_records` is publicly readable (for audit) but contains **no voter identity**.
5. The `nullifiers` table is service-role-only — never exposed to the client.

---

## Article IV — Security

1. Secrets (Supabase keys, relayer private key, owner private key, database connection strings,
   `SERVER_SECRET`) live in environment variables or a secret manager. **Never commit secrets to the
   repository.** A leak is a P0 and requires rotation.
2. The backend refuses to boot on missing/invalid env (`zod` schema in `config/index.ts` exits 1).
   Do not weaken this gate.
3. `ADMIN_EMAILS` is the admin boundary for a demo deployment. Client-side role checks are UI
   cosmetics only; server-side `adminProtect` is the real boundary.
4. Auth endpoints (`send-otp`) are rate-limited at the boundary to prevent email flood.
5. CORS is locked to the configured `CORS_ORIGIN` only.

---

## Article V — Testing

1. The test suite must pass (all green) before any push. `npm test`.
2. Production code ships with tests covering: nullifier determinism, double-vote rejection
   (off-chain and on-chain), relayer-only gating, owner-only election control, and env-config gates.
3. A test that asserts current behavior as "proof a bug exists" is a diagnostic artifact. Either fix
   the bug and update the test, or mark `xfail`/`skip` with a linked issue.
4. Never weaken an existing assertion to make a build pass. Fix the code that broke the test.
5. Every verification produces an evidence file in `docs/evidence/` — never narrative alone.

---

## Article VI — Process

1. Work sequentially in layers. Finish one layer (code + tests + docs) before starting the next.
2. Every task is committed individually with an explicit message stating what changed and which doc
   (if any) needs a corresponding update.
3. All commits carry a valid SSH signature (`commit.gpgsign=true`, `gpg.format ssh`). A missing
   signature is an invalid commit.
4. New dependencies require justification against existing packages.
5. Read `docs/architecture.md` and current-state docs before starting a task. If a task assumes a
   capability marked **ASPIRATIONAL**, stop and say so.
6. Feature freeze: no new subsystem while any P0 from this constitution or the sprint docs is open.
7. Honesty over optimism: report gaps accurately. Closing one gap never means "risk is complete."
8. Never commit secrets. Paper/demo keys live only in-process and in gitignored `.env` files.

---

## Article VII — Evidence

1. Every release/verification produces an evidence file under `docs/evidence/`.
2. A "PASS" requires a cited test or a cited manual verification step — **never narrative alone**.
3. Live-system verification (Sepolia deploy, Supabase migration, public URL) is recorded as an
   evidence log with the date, the exact command/step, and the observed result.
4. Evidence is committed with the work that produced it, not bolted on at release time.

---

## Article VIII — Pareto Execution

1. When closing a gap, identify the 20% of work that produces 80% of the value and execute that first.
2. Value ordering for a demo-able product: vote integrity (on-chain proof) → identity/auth → deployment
   → frontend flow → polish.
3. Descoped items are descoped deliberately and documented. Do not silently re-include them.

---

*Constitution effective as of the engineering-foundation sprint. Any amendment is an edit to this
document accompanied by an ADR or decision entry.*