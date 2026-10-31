import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const referral = readFileSync(new URL('../sql/isolated-auth/run-employee-referrals-browser.mjs', import.meta.url), 'utf8');
const expense = readFileSync(new URL('../sql/isolated-auth/run-expense-browser.mjs', import.meta.url), 'utf8');

test('Referral browser acceptance cannot reuse the expense harness fixed Vite port', () => {
  assert.match(expense, /const port = '48378'/);
  assert.doesNotMatch(referral, /const port = '48378'/);
  assert.match(referral, /createServer as createNetServer/);
  assert.match(referral, /probe\.listen\(0, '127\.0\.0\.1'/);
  assert.match(referral, /address\.port/);
});
test('Referral browser launches/terminates the direct Vite child without an orphaned npx wrapper', () => {
  assert.match(referral, /spawn\(process\.execPath/);
  assert.match(referral, /node_modules\/vite\/bin\/vite\.js/);
  assert.doesNotMatch(referral, /spawn\('npx'/);
  assert.match(referral, /await stopChildProcess\(server\)/);
  assert.match(referral, /safeStartupDiagnostic/);
  assert.match(referral, /\[REDACTED_TOKEN\]/);
});
