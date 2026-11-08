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

// The remember-me choice controls where Supabase persists its auth session.
// Local storage survives closing the browser; session storage survives only
// while the browser tab/session stays open. Neither stores the user's password.
const REMEMBER_ME_KEY = 'synesis-hris-remember-me';

export function getRememberMePreference(): boolean {
  if (typeof window === 'undefined') return false;
  try { return window.localStorage.getItem(REMEMBER_ME_KEY) === 'true'; }
  catch { return false; }
}

export function setRememberMePreference(remember: boolean): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(REMEMBER_ME_KEY, remember ? 'true' : 'false'); }
  catch { /* Storage may be unavailable in a private browser. */ }
}

const authStorage = {
  getItem(key: string): string | null {
    if (typeof window === 'undefined') return null;
    try {
      const preference = window.localStorage.getItem(REMEMBER_ME_KEY);
      // Preserve sessions created by earlier releases until the next sign-in.
      // New sign-ins with Remember me unchecked use session storage only.
      if (preference === 'false') return window.sessionStorage.getItem(key);
      return window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key);
    } catch { return null; }
  },
  setItem(key: string, value: string): void {
    if (typeof window === 'undefined') return;
    try {
      if (window.localStorage.getItem(REMEMBER_ME_KEY) === 'false') {
        window.sessionStorage.setItem(key, value);
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, value);
        window.sessionStorage.removeItem(key);
      }
    } catch { /* Supabase Auth reports storage failures when persistence is unavailable. */ }
  },
  removeItem(key: string): void {
    if (typeof window === 'undefined') return;
    try { window.localStorage.removeItem(key); } catch { /* no-op */ }
    try { window.sessionStorage.removeItem(key); } catch { /* no-op */ }
  },
};

export const supabase = createClient(supabaseUrl, supabasePublicKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: authStorage },
});
