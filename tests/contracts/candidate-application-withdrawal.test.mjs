import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20261016190000_candidate_application_withdrawal.sql', import.meta.url), 'utf8');

test('candidate withdrawal is authenticated, active-profile scoped, and row-locked', () => {
  assert.match(migration, /candidate_withdraw_application\(\s*p_application_id uuid,\s*p_reason text\s*\) RETURNS jsonb/);
  assert.match(migration, /SECURITY DEFINER\s+SET search_path = ''/);
  assert.match(migration, /auth\.uid\(\) IS NULL OR NOT public\.is_live_session\(\)/);
  assert.match(migration, /candidate_profiles cp[\s\S]+?cp\.user_id = auth\.uid\(\) AND cp\.profile_status = 'active'/);
  assert.match(migration, /a\.tenant_id = v_tenant_id\s+AND a\.candidate_user_id = auth\.uid\(\)[\s\S]+?FOR UPDATE OF a/);
  assert.match(migration, /FROM PUBLIC, anon, service_role/);
  assert.match(migration, /TO authenticated/);
});

test('candidate withdrawal validates current UI reasons, protects closed stages, and is retry-safe', () => {
  for (const reason of [
    'Accepted another job offer',
    'Location / Commute constraints',
    'Compensation expectations mismatch',
    'Personal / Family circumstances',
    'Other',
  ]) assert.ok(migration.includes(`'${reason}'`), `Missing supported withdrawal reason: ${reason}`);
  assert.match(migration, /'offer', 'offer_extended', 'offer_accepted', 'offer_declined', 'rejected', 'hired'/);
  assert.match(migration, /IF v_application\.stage = 'withdrawn' THEN[\s\S]+?'changed', false/);
  assert.match(migration, /SET stage = 'withdrawn', status_note = v_reason, updated_at/);
  assert.match(migration, /candidate_application_stage_history[\s\S]+?'withdrawn', v_reason,[\s\S]+'candidate', auth\.uid\(\)/);
});
