import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const migration = read('../../supabase/migrations/20261016142000_hris_leave_type_policy_management.sql');
const workspace = read('../../src/live/LiveHrisWorkspace.tsx');
const policyUi = read('../../src/live/LeaveTypePolicyManager.tsx');
const locale = read('../../src/live/project-locale.ts');
const runner = read('../sql/isolated-auth/run-local.mjs');
const browser = read('../sql/isolated-auth/run-leave-evidence-browser.mjs');

test('leave policy RPC writes only active-tenant records for leave.manage and creates audit history', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.hris_save_leave_type\([\s\S]+?SECURITY DEFINER/);
  assert.match(migration, /is_live_session\(\)[\s\S]+?has_tenant_permission\(p_tenant_id, 'leave\.manage'\)/);
  assert.match(migration, /WHERE id=v_id AND tenant_id=p_tenant_id FOR UPDATE/);
  assert.match(migration, /lower\(lt\.code\)=lower\(v_code\)/);
  assert.match(migration, /'leave\.type\.created'[\s\S]*admin_audit_logs|admin_audit_logs[\s\S]*v_action/);
  assert.match(migration, /'before',v_before/);
  assert.match(migration, /errcode='40001'/);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON public\.leave_types FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.hris_save_leave_type\(uuid,uuid,jsonb,jsonb\) FROM PUBLIC, anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.hris_save_leave_type\(uuid,uuid,jsonb,jsonb\) TO authenticated, service_role/);
});

test('leave policy editor is permission-gated and uses tenant-safe create, edit, refresh, and soft-deactivation', () => {
  assert.match(workspace, /canManage && <LeaveTypePolicyManager tenantId=\{tenantId\} leaveTypes=\{visibleData\.leave_types\}/);
  assert.match(policyUi, /supabase\.rpc\('hris_save_leave_type'/);
  assert.match(policyUi, /p_tenant_id: tenantId, p_leave_type_id: draft\.id/);
  assert.match(policyUi, /p_expected: editing \? expected\(editing\) : null/);
  assert.match(policyUi, /async function setActive\(item: LeaveType\)/);
  assert.match(policyUi, /active: !item\.active/);
  assert.match(policyUi, /await onRefresh\(\)/);
  assert.match(policyUi, /Existing employee balance records are preserved/);
  assert.match(workspace, /async function load\(range = appliedRequestRange, showLoading = true\)/);
  assert.match(workspace, /if \(showLoading\) setLoading\(true\)/);
  assert.match(workspace, /onRefresh=\{\(\) => load\(appliedRequestRange, false\)\}/);
});

test('isolated Auth/Postgres tests deny viewers, employees, global-only, cross-tenant, stale, duplicate, and direct writes', () => {
  assert.ok(runner.includes('20261016142000_hris_leave_type_policy_management.sql'));
  assert.match(runner, /Leave policy writes require active same-tenant leave\.manage and cannot bypass the RPC/);
  assert.match(runner, /Tenant leave managers can configure existing leave policy fields with idempotent create, optimistic edits, audit, and employee visibility/);
  assert.match(runner, /policyStaleUpdate\.error\?\.code === '40001'/);
  assert.match(runner, /duplicatePolicyCode\.error\?\.code === '23505'/);
  assert.match(runner, /employeePolicyHiddenAfterDeactivate/);
});

test('real Auth/Postgres browser acceptance covers manager policy persistence and employee availability', () => {
  assert.match(browser, /Synthetic browser leave policy/);
  assert.match(browser, /Synthetic policy persistence outage/);
  assert.match(browser, /The leave policy form discarded its values after a failed save/);
  assert.match(browser, /hris_save_leave_type/);
  assert.match(browser, /p_expected\?\.annual_entitlement !== 10/);
  assert.match(browser, /Refresh leave type policies/);
  assert.match(browser, /selectOption\(\{ label: 'Synthetic browser leave policy' \}\)/);
  for (const key of ['Leave type policies','Add leave type','Edit leave type','Annual entitlement is the default used when an employee balance is first created. Existing employee balance records are preserved.']) {
    assert.ok(locale.includes(`'${key}':`), `missing Bengali translation: ${key}`);
  }
  assert.match(browser, /Manager absence calendar Bengali mobile/);
});
