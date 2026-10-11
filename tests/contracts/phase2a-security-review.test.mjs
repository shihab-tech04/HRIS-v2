import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync('supabase/staging/phase2a/first_admin_guard.staging.sql', 'utf8');
const live = readFileSync('src/live/LiveApp.tsx', 'utf8');

test('first-admin restriction stays staged until database security tests pass', () => {
  assert.match(sql, /CREATE POLICY hris_first_admin_platform_guard/);
  assert.match(sql, /AS RESTRICTIVE/);
  assert.match(sql, /FOR INSERT TO authenticated/);
  assert.match(sql, /public\.is_live_session\(\)/);
  assert.match(sql, /a\.is_super_admin IS TRUE/);
  assert.match(sql, /REVOKE ALL ON FUNCTION/);
  assert.equal(existsSync('supabase/migrations/20261011_03_hris_first_admin_guard.sql'), false);
});

test('authorization is revalidated on session changes and returning to tab', () => {
  assert.match(live, /event === 'TOKEN_REFRESHED'/);
  assert.match(live, /event === 'SIGNED_IN'/);
  assert.match(live, /event === 'USER_UPDATED'/);
  assert.match(live, /document\.addEventListener\('visibilitychange'/);
  assert.match(live, /document\.removeEventListener\('visibilitychange'/);
  assert.match(live, /setRefreshKey\(key => key \+ 1\)/);
  assert.match(live, /setRecords\(empty\(\)\)/);
});
