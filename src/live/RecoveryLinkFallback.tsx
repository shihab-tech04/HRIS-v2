import React, { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase, supabaseUrl } from '../lib/supabase';

/** Accept only a recovery token from this project's official Supabase Auth endpoint. */
export function parseRecoveryToken(emailLink: string): string {
  let url: URL;
  try { url = new URL(emailLink.trim()); }
  catch { throw new Error('Paste the complete recovery link from your latest Supabase email.'); }
  if (url.origin !== new URL(supabaseUrl).origin ||
      url.pathname !== '/auth/v1/verify' ||
      url.searchParams.get('type') !== 'recovery') {
    throw new Error('This is not a recovery link for the current HRIS project.');
  }
  const hash = url.searchParams.get('token_hash') || url.searchParams.get('token');
  if (!hash || hash.length < 16 || hash.length > 2048 || !/^[A-Za-z0-9._~-]+$/.test(hash)) {
    throw new Error('This recovery link is incomplete or invalid.');
  }
  return hash;
}

export async function redeemRecoveryToken(tokenHash: string): Promise<User> {
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash, type: 'recovery',
  });
  if (error || !data.session || !data.user) {
    throw new Error('This recovery link is expired or already used. Request a fresh recovery email.');
  }
  return data.user;
}

export function RecoveryLinkFallback({ onVerified }: { onVerified: (user: User) => void }) {
  const field = useRef<HTMLTextAreaElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const pasted = field.current?.value || '';
    if (field.current) field.current.value = ''; // Never persist tokens in app state.
    setError('');
    setBusy(true);
    try {
      const token = parseRecoveryToken(pasted);
      const user = await redeemRecoveryToken(token);
      onVerified(user);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not verify that recovery link.');
    } finally {
      setBusy(false);
    }
  }
  return <section aria-labelledby="recover-link-title" className="mt-6 border-t border-slate-200 pt-5">
    <h2 id="recover-link-title" className="font-semibold text-base">Recovery email opens the wrong website?</h2>
    <p className="mt-2 text-sm text-slate-600">
      If the email link opens localhost or an unavailable page, request a fresh email.
      Copy the full reset link from the email without opening it and paste it below.
      The link is verified securely with Supabase and is not saved.
    </p>
    <form onSubmit={submit} className="mt-3 space-y-3">
      <label htmlFor="hris-recovery-link" className="block text-sm font-medium">Recovery email link</label>
      <textarea ref={field} id="hris-recovery-link" autoComplete="off" spellCheck={false}
        required rows={2} className="w-full rounded-md border border-slate-300 p-3 text-sm" />
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={busy}
        className="min-h-11 w-full rounded-md border border-[#085587] px-3 text-[#085587] disabled:opacity-50">
        {busy ? 'Verifying…' : 'Verify recovery link'}
      </button>
    </form>
  </section>;
}
