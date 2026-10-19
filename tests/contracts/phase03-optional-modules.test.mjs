import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/staging/phase03/tenant_optional_modules.staging.sql','utf8');
const fixture = readFileSync('tests/sql/phase03/module_fixture.sql','utf8');
const journeys = readFileSync('tests/sql/phase03/verify_modules.sql','utf8');
const api = readFileSync('src/live/platformTenantApi.ts','utf8');
const ui = readFileSync('src/live/PlatformTenantWorkspace.tsx','utf8');

test('all three supported modules have server-side write guards and protected settings', () => {
  for (const key of ['travel','expenses','learning']) assert.match(sql,new RegExp(`'${key}'`));
  for (const table of ['travel_requests','travel_status_history','travel_request_notifications',
    'expense_travel_links','expense_categories','expense_claims','expense_claim_receipts',
    'expense_claim_status_history','learning_programs','learning_sessions',
    'learning_enrollments','learning_completion_events','learning_completion_notifications']) {
    assert.ok(sql.includes(`'${table}'`),`missing write-guard target ${table}`);
    assert.ok(fixture.includes(`'${table}'`),`missing fixture ${table}`);
  }
  assert.match(sql,/BEFORE INSERT OR UPDATE OR DELETE/);
  assert.match(sql,/v_old_tenant IS NOT NULL/);
  assert.match(sql,/v_new_tenant IS NOT NULL/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/REVOKE ALL ON public\.tenant_module_settings FROM PUBLIC,anon,authenticated/);
  assert.match(sql,/RAISE EXCEPTION 'Missing Phase 03 module guard prerequisite/);
  assert.match(sql,/hris_optional_module_storage_insert/);
  assert.match(sql,/hris_optional_module_storage_update/);
  assert.match(sql,/hris_optional_module_storage_delete/);
  assert.match(sql,/p_bucket_id='expense-receipts'/);
  assert.match(sql,/p_bucket_id='learning-completion-evidence'/);
});

test('module-setting RPC is platform-only, audited, and sparse-enabled by default', () => {
  assert.match(sql,/IF NOT public\.platform_hris_is_super_admin\(\)/g);
  assert.match(sql,/coalesce\(\(SELECT s.enabled/);
  assert.match(sql,/PLATFORM_TENANT_MODULE_CHANGED/);
  assert.match(sql,/IF v_previous IS NOT DISTINCT FROM p_enabled THEN RETURN/);
  assert.match(sql,/history_retained/);
});

test('verified SQL journeys cover historical reads, write rejection, isolation and authorization', () => {
  for (const clause of [
    'Historical authorized travel read disappeared',
    'Disabled travel accepted a new row',
    'Disabled travel accepted historical edits',
    'Disabled travel accepted historical deletion',
    'Cross-tenant module state leaked',
    'Cross-tenant update bypassed target module state',
    'Disabled expense accepted a new claim',
    'Disabled learning accepted new enrollment',
    'Disabled expense receipt upload was allowed',
    'Disabled learning evidence upload was allowed',
    'Historical receipt read disappeared',
    'Historical learning evidence read disappeared',
    'Non-platform admin toggled a tenant module',
    'Direct module write was allowed',
    'Non-member accessed tenant history',
  ]) assert.ok(journeys.includes(clause),`missing negative journey: ${clause}`);
});

test('staging-only tenant UI loads persisted values and confirms changes', () => {
  assert.match(api,/requireStagingFeature\(\)/);
  assert.match(api,/platform_hris_list_tenant_modules/);
  assert.match(api,/platform_hris_set_tenant_module/);
  assert.match(ui,/listPlatformTenantModules/);
  assert.match(ui,/setPlatformTenantModule/);
  assert.match(ui,/confirmModuleChange/);
  assert.match(ui,/Historical records remain/);
});
