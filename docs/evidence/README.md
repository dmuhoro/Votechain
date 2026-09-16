# Evidence

Every verification in this repo produces a file here (Constitution Article VII).

**Naming:** `YYYY-MM-DD_<slug>.md` — one file per verification, committed with the work that produced it.

**Required anatomy of every evidence file:**

- Title + date
- **Command / step** (exact, copy-pasteable)
- **Observed result** (raw output of the gate: test count, build exit code, migration output)
- **Verdict**: `PASS` | `PARTIAL` | `BLOCKED`
- **Gates** table: `Gate | Command | Observed` mapped 1:1 to the quality gates
- **Not claimed:** honest boundaries — what this evidence does *not* prove

A `PASS` requires a cited test or cited manual step — never narrative alone.

## Index

| File | Verdict | Date |
|------|---------|------|
| `2026-09-16_layer1-dependency-and-gates.md` | PASS | 2026-09-16 |
| `2026-09-16_runtime-bugs-and-infra.md` | PASS | 2026-09-16 |
| `2026-09-16_supabase-migration-live.md` | PASS | 2026-09-16 |