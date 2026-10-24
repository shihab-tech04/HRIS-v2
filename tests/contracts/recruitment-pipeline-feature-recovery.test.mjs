import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../supabase/migrations/20261013130829_hris_recruitment_pipeline_read.sql', import.meta.url), 'utf8');
const staged = readFileSync(new URL('../../supabase/staging/feature-recruitment-pipeline/activate-verified-source.staging.sql', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../../src/live/RecruitmentPipeline.tsx', import.meta.url), 'utf8');

test('recruitment staging preserves the accepted source SQL body and grants', () => {
  const body = source.slice(source.indexOf('CREATE OR REPLACE FUNCTION'),source.lastIndexOf('COMMIT;')).trim();
  assert.ok(body.startsWith('CREATE OR REPLACE FUNCTION public.hris_get_recruitment_pipeline'));
  assert.ok(staged.includes(body), 'staging diverges from the original SQL function');
  assert.ok(staged.includes('REVOKE ALL ON FUNCTION public.hris_get_recruitment_pipeline'));
  assert.ok(staged.includes('TO authenticated,service_role'));
});

test('recruitment staging fails closed on incompatible hosted environment', () => {
  assert.ok(staged.includes("to_regprocedure('public.hris_get_recruitment_pipeline(uuid,text,text,integer,integer)') IS NOT NULL"));
  assert.ok(staged.includes("to_regprocedure('public.is_live_session()') IS NULL"));
  assert.ok(staged.includes("to_regprocedure('public.hris_admin_can_read_tenant(uuid,text)') IS NULL"));
  assert.ok(staged.includes('missing %'));
  assert.ok(staged.includes('FROM public.admin_users WHERE active AND is_super_admin'));
  assert.ok(staged.includes("has_function_privilege('anon',v_oid,'EXECUTE')"));
  assert.equal((staged.match(/CREATE OR REPLACE FUNCTION /g) ?? []).length,1);
  assert.ok(staged.trim().endsWith('COMMIT;'));
});

test('recruitment UI and server function share exact parameters and redacted output', () => {
  assert.ok(ui.includes("rpc('hris_get_recruitment_pipeline', {"));
  for (const arg of ['p_tenant_id','p_search','p_stage','p_limit','p_offset']) {
    assert.ok(ui.includes(arg + ':'), 'UI argument missing ' + arg);
    assert.ok(source.includes(arg), 'SQL parameter missing ' + arg);
  }
  for (const field of ["'applications'","'available_stages'","'total_count'","'milestones'"]) assert.ok(source.includes(field));
  assert.ok(source.includes("public.hris_admin_can_read_tenant(p_tenant_id, 'recruitment.view')"));
  assert.ok(source.includes("public.is_live_session()"));
  assert.ok(!source.includes("'private_notes'") && !source.includes("'cover_letter'"));
});
