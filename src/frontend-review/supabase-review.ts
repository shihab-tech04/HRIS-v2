import type { SupabaseClient } from '@supabase/supabase-js';

// Offline-only adapter. Never initializes Supabase, sends HTTP requests, or changes records.
const readonlyValue = () => ({ data: [], error: null, count: 0 });
const deniedValue = () => ({ data: null, error: { message: 'Offline review is read-only.', code: 'OFFLINE_READ_ONLY' } });
function query(write = false, single = false): any {
  const response = Promise.resolve(write ? deniedValue() : single ? { data: null, error: null, count: 0 } : readonlyValue());
  return new Proxy({}, {
    get(_target, property) {
      if (property === 'then') return response.then.bind(response);
      if (property === 'catch') return response.catch.bind(response);
      if (property === 'finally') return response.finally.bind(response);
      if (property === 'single' || property === 'maybeSingle') return () => query(write, true);
      if (['insert', 'upsert', 'update', 'delete'].includes(String(property))) return () => query(true);
      return () => query(write, single);
    },
  });
}
const blocked = { message: 'Offline frontend review has no authentication or storage connection.' };
export const supabaseUrl = 'offline-review';
export const supabasePublicKey = 'offline-no-key';
export const supabase = {
  from: () => query(),
  rpc: (name: string) => query(!/^(hris_get_|get_|employee_get_|admin_get_|admin_list_|candidate_get_|candidate_public_|platform_hris_list_|has_|is_)/.test(name)),
  auth: {
    getUser: async () => ({ data: { user: null }, error: blocked }),
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signOut: async () => ({ error: null }),
    signInWithPassword: async () => ({ data: null, error: blocked }),
    resetPasswordForEmail: async () => ({ data: null, error: blocked }),
    updateUser: async () => ({ data: null, error: blocked }),
  },
  storage: { from: () => ({
    download: async () => ({ data: null, error: blocked }),
    upload: async () => deniedValue(),
    remove: async () => deniedValue(),
    createSignedUrl: async () => ({ data: null, error: blocked }),
    list: async () => readonlyValue(),
  }) },
  channel: () => ({ on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }), subscribe: () => ({ unsubscribe: () => {} }) }),
  removeChannel: async () => 'ok',
  functions: { invoke: async () => deniedValue() },
} as unknown as SupabaseClient;
