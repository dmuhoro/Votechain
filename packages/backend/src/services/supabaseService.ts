import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '../config';

// Create a single Supabase client for the entire backend service
export const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
