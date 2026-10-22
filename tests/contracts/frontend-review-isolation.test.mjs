import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = name => readFileSync(new URL('../../' + name, import.meta.url), 'utf8');
test('offline build has compile-time Supabase alias and cannot mutate data', () => {
  assert.match(read('vite.config.ts'), /HRIS_FRONTEND_REVIEW === 'true'/);
  assert.match(read('vite.config.ts'), /supabase-review\.ts/);
  assert.match(read('src/App.tsx'), /VITE_HRIS_FRONTEND_REVIEW === 'true'/);
  const adapter = read('src/frontend-review/supabase-review.ts');
  assert.doesNotMatch(adapter, /createClient|fetch\s*\(|supabase\.co/);
  assert.match(adapter, /OFFLINE_READ_ONLY/);
  assert.match(read('package.json'), /build:frontend-review/);
});
