import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * Lazy Supabase client. Config is read lazily so a misconfigured build never
 * throws at module import — which previously white-screened the entire app
 * before any error boundary could render. If config is missing, the call site
 * gets a clear, catchable error instead of a blank screen.
 */
export const getSupabase = (): SupabaseClient => {
  if (client) return client;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('VoteChain is missing its Supabase configuration (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
  }

  client = createClient(supabaseUrl, supabaseAnonKey);
  return client;
};

export const supabase = getSupabase;