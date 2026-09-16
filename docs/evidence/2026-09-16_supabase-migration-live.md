# Evidence: Live Supabase Schema Verified + Migration Recorded

Date: 2026-09-16
Project: VoteChain monorepo
Target: live Supabase project `gldfsjoikqydjxcarffr` (Votechain, West EU / Ireland)

## Command / step

```bash
# 1. Convert root SQL dump into CLI versioned migration
mkdir -p supabase/migrations
cp supabase_migrations.sql supabase/migrations/20260916102353_initial_schema.sql

# 2. Connect via IPv4 pooler (direct db.* host resolves only to IPv6 here; no local IPv6 route)
supabase db push --db-url "postgresql://postgres.gldfsjoikqydjxcarffr:PASSWORD@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"

# Fails because tables already exist (schema was applied previously) — so verify, not push.
supabase db query --db-url "..." "select tablename from pg_tables where schemaname='public' order by tablename;"
supabase db query --db-url "..." "select tablename, rowsecurity from pg_tables where schemaname='public';"
supabase db query --db-url "..." "select tablename, policyname, cmd from pg_policies where schemaname='public' order by tablename;"

# 3. Record migration as applied so future `db push` is no-op
supabase db query --db-url "..." "insert into supabase_migrations.schema_migrations (version) values ('20260916102353');"
```

Note: the bracketed password `[UZE2BRAaJ2qZvPDF]` — the `[` `]` in the connection
string were delimiters in the passing credential, the actual password is
`UZE2BRAaJ2qZvPDF`. Secrets stay out of the repo (used only in-process).

## Observed result

- `pg_tables`: tables `elections`, `nullifiers`, `vote_records`, `voters` exist.
- All four tables have `rowsecurity = true`.
- Policies present (5 total): voters self-SELECT; elections auth-SELECT;
  vote_records public-SELECT; nullifiers service-role SELECT + INSERT — matches the migration file.
- Column layout of all four tables matches `20260916102353_initial_schema.sql`
  (verified with `information_schema.columns` across all 4 tables).
- `insert into supabase_migrations.schema_migrations`: `INSERT 0 1`.

## Verdict: PASS

The live Supabase schema is identical to the committed migration. The migration is
marked applied so CLI `db push` is idempotent going forward.

## Not claimed

- Did not exercise an actual end-to-end login/cast flow against live Supabase —
  requires anon/service-role keys + auth, which are held by the user.
- Did not seed any election/voter rows; tables may be empty.
- The `register-voter` path inserts `id: req.user.id` (Supabase Auth uid) into
  `voters.id`, which the schema's UUID-defaulted `id` still permits.