import { createClient } from '@supabase/supabase-js';

// This is the PUBLIC publishable key (not a service-role or secret key).
// Authorization is enforced by existing Supabase Auth and PostgreSQL RLS.
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://oslgwxaqfbteqtwqvdzs.supabase.co';
export const supabasePublicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_fjNbVQbzBzIA8INgwJyPJQ_6vTd3PZv';
export const supabase = createClient(supabaseUrl, supabasePublicKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
