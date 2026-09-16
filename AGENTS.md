# AGENTS.md — VoteChain Engineering Conventions

Rules every agent (including Opencode) must follow on every task in this repo.

---

## 1. Read State Docs Before Building

Before starting a task, read `docs/engineering/CONSTITUTION.md` and `docs/architecture.md`. If a task
assumes a capability marked **ASPIRATIONAL** in either, stop and say so instead of building silently
on top of it.

## 2. Never Weaken Tests to Pass a Build

Do not remove or weaken an existing assertion to make a build pass. Fix the code that broke the test,
or flag the conflict explicitly. A green suite means correct, not silenced.

## 3. Vote-Path Changes Require Constitution Review

Any change to the vote submission path (`votes.ts` cast flow, `relayerService`, `nullifierService`,
`VoteChain.sol`) must preserve the two-boundary double-vote prevention (Supabase table + chain
mapping) described in Constitution Article II. If a boundary is removed, stop and flag it as a P0.

## 4. New Dependencies Require Justification

No new dependency without stating why an existing one (already in `package.json`) doesn't cover it.
Name the specific gap.

## 5. Secrets Never In Commits

Never write a real key, password, or connection string into any committed file. `.env` is gitignored;
use it locally. A leaked secret is a P0 — rotate it and state the rotation in the evidence log.

## 6. Commit Messages Must Be Explicit

All commit messages state what changed and which doc (if any) needs a corresponding update. Commit
each task individually (Constitution Article VI.2).

## 7. All Commits Must Be SSH-Signed

Every commit on `main` must carry a valid SSH signature (`git config commit.gpgsign true`,
`gpg.format ssh`, sign key `~/.ssh/id_ed25519.pub`). If a commit lacks a signature, fix the config
before pushing — a missing signature is an invalid commit.

## 8. Evidence With The Work

Every verification (build green, contract tests, Supabase migration applied, deploy) produces a file
under `docs/evidence/YYYY-MM-DD_<slug>.md` with the exact command and observed output (Constitution
Article VII). Commit it with the work, not at release time.

## 9. Feature Freeze on Open P0s

No new subsystem (new chain integration, new identity provider, new voting model) may be started while
any P0 from `docs/architecture.md` (gaps table) or the current sprint doc is open.

## 10. Report State Honestly

If something is further from done than a prior doc suggests, say so plainly with evidence (missing
file, failing command, stubbed function) rather than assuming it's fine. Update the offending doc in
the same change.

---

**Working tree layout:**

- `packages/contracts/` — Hardhat 2.x + Solidity `VoteChain.sol`, `contracts/`, `scripts/`, `test/`
- `packages/backend/` — Express + TS (strict) API. Vote path: `routes/votes.ts` →
  `nullifierService` → `relayerService` → chain. Relayer and owner keys are separate.
- `packages/frontend/` — React 18 + Vite + TS + Tailwind. No wallet code (relayer pattern).
- `supabase/migrations/` — the SQL migrations that MUST be applied to the live project.
- `docs/` — engineering constitution, ADRs, sprints, evidence, runbooks.
- `scripts/` — infra/ops helper scripts.

**Quality gates before push:**

```bash
npm run test -w contracts      # contract suite (hardhat)
npm run build -w backend       # tsc emits dist/
npm run build -w frontend      # tsc && vite build
npm run test -w backend        # vitest (API/unit)
npm run lint -w frontend       # eslint --max-warnings 0
```

All green, then commit each piece + evidence, then push.