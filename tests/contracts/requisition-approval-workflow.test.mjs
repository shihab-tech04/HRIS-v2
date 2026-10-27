import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20261027090000_hris_requisition_pending_status_guard.sql', import.meta.url), 'utf8');
const acceptance = readFileSync(new URL('../sql/isolated-auth/hris-release-rpc-acceptance.mjs', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../../.github/workflows/disposable-auth-postgres-acceptance.yml', import.meta.url), 'utf8');

function functionBlock(source, name) {
  const start = source.search(new RegExp(`CREATE OR REPLACE FUNCTION\\s+public\\.${name}\\b`, 'i'));
  assert.notEqual(start, -1, `tracked public.${name} definition exists`);
  const rest = source.slice(start);
  const bodyTag = rest.match(/\bAS\s+(\$[A-Za-z_0-9]*\$)/i)?.[1];
  assert.ok(bodyTag, `public.${name} has a dollar-quoted body`);
  const end = rest.indexOf(`${bodyTag};`, rest.indexOf(bodyTag) + bodyTag.length);
  assert.notEqual(end, -1, `public.${name} body terminates`);
  return rest.slice(0, end + bodyTag.length + 1).trim();
}

const saveRequisition = functionBlock(migration, 'admin_save_requisition');
const resolveRequisition = functionBlock(migration, 'admin_resolve_requisition');

test('requisition creation ignores caller-supplied approval status while preserving the deployed contract', () => {
  assert.match(saveRequisition, /admin_save_requisition\(p_id uuid, p_payload jsonb\)/i);
  assert.match(saveRequisition, /RETURNS uuid/i);
  assert.match(saveRequisition, /SECURITY DEFINER/i);
  assert.match(saveRequisition, /SET search_path TO 'pg_catalog', 'public', 'auth'/i);
  assert.match(saveRequisition, /has_permission\('recruitment\.manage'\)/i);
  assert.match(saveRequisition, /if p_id is null then[\s\S]*?insert into public\.manpower_requisitions/i);
  assert.match(saveRequisition, /'pending',auth\.uid\(\)\) returning id into v_id/i);
  assert.doesNotMatch(saveRequisition, /p_payload\s*->>\s*'status'/i);
  assert.match(saveRequisition, /where id=p_id and tenant_id=v_tenant returning id into v_id/i);
  assert.match(saveRequisition, /Recruitment management permission required\./);
  assert.match(saveRequisition, /Requisition not found\./);
  for (const column of [
    'reference_number', 'department_id', 'designation_id', 'employment_type', 'project_name',
    'required_positions', 'desired_joining_date', 'years_experience', 'education_qualifications',
    'certifications', 'job_description', 'reason', 'requested_by',
  ]) {
    assert.match(saveRequisition, new RegExp(`\\b${column}\\b`));
  }
});

test('requisition resolver remains tenant-scoped, pending-only, auditable, and single-use', () => {
  assert.match(resolveRequisition, /admin_resolve_requisition\(p_id uuid, p_decision text, p_note text DEFAULT NULL::text\)/i);
  assert.match(resolveRequisition, /RETURNS jsonb/i);
  assert.match(resolveRequisition, /SECURITY DEFINER/i);
  assert.match(resolveRequisition, /SET search_path TO 'pg_catalog', 'public', 'auth'/i);
  assert.match(resolveRequisition, /has_permission\('recruitment\.manage'\)/i);
  assert.match(resolveRequisition, /status=p_decision[\s\S]*?tenant_id=public\.synesis_tenant_id\(\)[\s\S]*?status='pending'/i);
  assert.match(resolveRequisition, /Pending requisition not found\./);
  assert.match(resolveRequisition, /recruitment\.requisition\.'\|\|p_decision/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.admin_save_requisition\(uuid,jsonb\) FROM PUBLIC, anon/i);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.admin_resolve_requisition\(uuid,text,text\) FROM PUBLIC, anon/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.admin_save_requisition\(uuid,jsonb\) TO authenticated, service_role/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.admin_resolve_requisition\(uuid,text,text\) TO authenticated, service_role/i);
});

test('isolated PostgreSQL acceptance applies the forward port and exercises privilege, tenant, and duplicate-resolution boundaries', () => {
  assert.match(acceptance, /applySql\('supabase\/migrations\/20261027090000_hris_requisition_pending_status_guard\.sql'\)/);
  assert.match(acceptance, /p_payload: \{ title: 'Synthetic pending-only requisition', status: 'approved' \}/);
  assert.match(acceptance, /Requisition creation forces pending, enforces permission and tenant scope, and resolution is single-use/);
  assert.match(acceptance, /duplicateRequisitionDecision\.error\?\.code === 'P0002'/);
  assert.match(acceptance, /crossTenantRequisitionUpdate\.error\?\.code === 'P0002'/);
  assert.match(acceptance, /crossTenantRequisitionDecision\.error\?\.code === 'P0002'/);
  assert.match(acceptance, /directRequisitionStatusWrite\.error\?\.code === '42501'/);
  assert.match(acceptance, /'requisition_rpc_security'/);
  assert.match(acceptance, /'requisition_rpc_signature_parity'/);
  assert.match(acceptance, /'requisition_rpc_acl'/);
  assert.match(acceptance, /'requisition_table_write_denied'/);
  assert.match(acceptance, /hostedRpcSignatures\.length === 43/);
  assert.match(acceptance, /SHOW server_version_num/);
  assert.match(acceptance, /must be PostgreSQL 17/);
  assert.match(workflow, /major_version = 17/);
  assert.match(workflow, /grep -q '\^major_version = 17\$' "\$HRIS_SUPABASE_TEST_WORKDIR\/supabase\/config\.toml"/);
});

