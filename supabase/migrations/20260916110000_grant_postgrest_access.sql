-- Grant PostgREST access so the API roles can reach the tables they are
-- covered by via RLS policies. Without table grants PostgREST returns
-- "permission denied" even when a policy matches.
--
-- Boundaries preserved (Constitution Article II):
--   * anon/authenticated: only the SELECT paths their policies explicitly allow
--     (elections: authenticated read; vote_records: public read; voters: own row)
--   * service_role: full DML (backend runs with the service role key and RLS
--     bypass; it is the only role that INSERTs nullifiers/vote_records).

GRANT SELECT ON TABLE public.elections    TO anon, authenticated;
GRANT SELECT ON TABLE public.vote_records TO anon, authenticated;
GRANT SELECT ON TABLE public.voters       TO anon, authenticated;

GRANT ALL ON TABLE public.elections    TO service_role;
GRANT ALL ON TABLE public.vote_records TO service_role;
GRANT ALL ON TABLE public.voters       TO service_role;
GRANT ALL ON TABLE public.nullifiers   TO service_role;

GRANT ALL ON SEQUENCE public.elections_id_seq TO service_role;