import { createClient } from '@supabase/supabase-js';

// This is the PUBLIC publishable key (not a service-role or secret key).
// Authorization is enforced by existing Supabase Auth and PostgreSQL RLS.
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://xfuxnljfrgvusbrpvxpa.supabase.co';
export const supabasePublicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_4xzRp7eeyLuj1fQmmx_Vtw_-g_4MeCT';
// Prevent a production build from silently falling back to the suspended/original project.
// Frontend-only builds alias this adapter entirely and retain their isolated data.
if (import.meta.env.PROD && supabaseUrl !== 'https://xfuxnljfrgvusbrpvxpa.supabase.co') {
  throw new Error('HRIS production build points at an unapproved Supabase project.');
}

export const supabase = createClient(supabaseUrl, supabasePublicKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
