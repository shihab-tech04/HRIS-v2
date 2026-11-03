import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const source = readFileSync(new URL('supabase/staging/ws05_single_superadmin_before_user_created_hook.staging.sql', root), 'utf8');

test('single Super Admin Auth hook is staged, not installed by ordinary migrations', () => {
  assert.match(source, /NOT an auto-applied migration/);
  assert.match(source, /Installing this function by itself DOES NOT enforce the policy/);
  assert.match(source, /Authentication > Hooks > Before User Created/);
  assert.match(source, /Never claim enforcement based on this SQL alone/);
  assert.match(source, /encrypted DB backup \+ isolated restore/);
  assert.match(source, /FULL Git history independently held off GitHub/);
});

test('hook fails closed for all NEW auth users while preserving sole existing login', () => {
  assert.match(source, /CREATE FUNCTION public\.hris_ws05_block_additional_auth_user\(event jsonb\)/);
  assert.match(source, /RETURNS jsonb/);
  assert.match(source, /SECURITY INVOKER/);
  assert.match(source, /'http_code', 403/);
  assert.match(source, /'error', jsonb_build_object/);
  assert.match(source, /SELECT count\(\*\) FROM auth\.users/);
  assert.match(source, /SELECT count\(\*\) FROM public\.admin_users/);
  assert.match(source, /TO supabase_auth_admin/);
  assert.match(source, /FROM PUBLIC, anon, authenticated/);
  assert.match(source, /to_regprocedure\('public\.hris_ws05_block_additional_auth_user\(jsonb\)'\)/);
  const statements = source.split('\n').filter(line => !/^\s*--/.test(line)).join('\n');
  assert.doesNotMatch(statements, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\s+(?:INTO\s+|FROM\s+)?auth\.users\b/i);
  assert.doesNotMatch(statements, /\b(?:DROP|ALTER)\s+(?:TABLE|SCHEMA)\s+auth\b/i);
});
