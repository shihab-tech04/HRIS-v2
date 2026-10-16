import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const localRunner = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');
const browserRunner = readFileSync(new URL('../sql/isolated-auth/run-password-recovery-browser.mjs', import.meta.url), 'utf8');

test('password recovery uses a fresh synthetic account and real disposable Auth email', () => {
  assert.match(localRunner, /password-recovery-\$\{randomBytes\(8\)/);
  assert.match(localRunner, /run-password-recovery-browser\.mjs/);
  assert.match(localRunner, /HRIS_LOCAL_MAILPIT_URL: services\.MAILPIT_URL \|\| services\.INBUCKET_URL/);
  assert.match(localRunner, /Fresh local recovery email verifies the Auth callback/);
  assert.match(browserRunner, /reset link has been requested/);
  assert.match(browserRunner, /api\/v1\/messages\?limit=50/);
  assert.match(browserRunner, /auth\/v1\/verify/);
  assert.match(browserRunner, /Choose a new password/);
  assert.match(browserRunner, /Passwords do not match/);
  assert.match(browserRunner, /No authorized HRIS organization/);
  assert.match(browserRunner, /recovery URLs and tokens were suppressed/);
  assert.match(browserRunner, /findAvailableLoopbackPort/);
  assert.match(browserRunner, /probe\.listen\(0, '127\.0\.0\.1'/);
  assert.match(browserRunner, /serverSpawnErrorCode/);
  assert.match(browserRunner, /serverExitInfo/);
  assert.doesNotMatch(browserRunner, /const vitePort = '48382'/);
  assert.match(browserRunner, /const redirectOrigin = viteOrigin/);
  assert.doesNotMatch(browserRunner, /oslgwxaqfbteqtwqvdzs\.supabase\.co/);
});
