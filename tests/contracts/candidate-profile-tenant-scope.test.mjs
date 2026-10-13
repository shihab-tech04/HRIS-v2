import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20261013120355_hris_candidate_profile_rpcs_active_tenant_scope.sql', import.meta.url), 'utf8');
const fixture = readFileSync(new URL('../sql/candidate-c1/tenant-verify.sql', import.meta.url), 'utf8');

test('candidate profile reads resolve only the authenticated user active profile', () => {
  const start = migration.indexOf('FUNCTION public.get_my_candidate_profile()');
  const end = migration.indexOf('$function$;', migration.indexOf('AS $function$', start)) + 11;
  const body = migration.slice(start, end);
  assert.match(body, /cp\.user_id=\(SELECT auth\.uid\(\)\)/);
  assert.match(body, /cp\.profile_status='active'/);
  assert.doesNotMatch(body, /synesis_tenant_id/);
  assert.doesNotMatch(migration, /\b(?:GRANT|REVOKE)\b/i, 'CREATE OR REPLACE must preserve the verified production ACLs.');
});

test('candidate profile updates derive a locked active tenant and cannot rewrite protected identity', () => {
  const start = migration.indexOf('FUNCTION public.candidate_update_profile(p_payload jsonb)');
  const bodyStart = migration.indexOf('AS $function$', start);
  const end = migration.indexOf('$function$;', bodyStart) + 11;
  const body = migration.slice(bodyStart, end);
  assert.match(body, /public\.is_live_session\(\)/);
  assert.match(body, /cp\.user_id=auth\.uid\(\)[\s\S]*?cp\.profile_status='active'[\s\S]*?FOR UPDATE/);
  assert.match(body, /AND tenant_id=v_tenant[\s\S]*?AND profile_status='active'/);
  const assignments = body.slice(body.indexOf('SET'), body.indexOf('WHERE user_id=auth.uid()'));
  assert.doesNotMatch(assignments, /\b(?:tenant_id|email|profile_status)\s*=/);
  assert.match(body, /GET DIAGNOSTICS v_updated = ROW_COUNT/);
  assert.match(body, /USING errcode='42501'/);
  assert.match(fixture, /tenant A profile update crossed tenant or protected fields/);
  assert.match(fixture, /tenant B profile update crossed tenant or protected fields/);
  assert.match(fixture, /inactive candidate profile update was not denied/);
});
