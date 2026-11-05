import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const adapter = readFileSync(new URL('../../src/live/realUserProvisioningApi.ts', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../../src/live/RealUserProvisioningReadiness.tsx', import.meta.url), 'utf8');
const preview = readFileSync(new URL('../../src/live/SyntheticUserManagement.tsx', import.meta.url), 'utf8');

test('WS08 REAL_AUTH_SQL prerequisites fail closed on explicit tenant and manage permissions', () => {
  assert.match(adapter, /has_tenant_permission/);
  assert.match(adapter, /p_tenant_id: tenantId/);
  assert.match(adapter, /admin_users\.manage/);
  assert.match(adapter, /synesis_tenant_id/);
  assert.match(adapter, /scope\.data !== tenantId/);
  assert.match(adapter, /admin_get_my_provisioning_context/);
  assert.ok(adapter.indexOf('has_tenant_permission') < adapter.indexOf('synesis_tenant_id'));
  assert.ok(adapter.indexOf('synesis_tenant_id') < adapter.indexOf('admin_get_my_provisioning_context'));
  assert.match(adapter, /supabase\.functions\.invoke\('admin-create-user'/);
  assert.doesNotMatch(adapter + panel, /supabase\.auth\.admin|\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test('WS08 account creation panel is tenant-scoped, localizable and isolated from synthetic preview', () => {
  assert.match(panel, /User management/);
  assert.match(panel, /Create employee account/);
  assert.match(panel, /hris-new-user-password/);
  assert.match(panel, /disabled=\{submitting \|\| !employeeId \|\| !roleId/);
  assert.match(panel, /availableEmployees/);
  assert.match(panel, /retry/);
  assert.match(panel, /locale === 'bn'/);
  assert.match(panel, /currentValue = value\?\.tenantId === tenantId/);
  assert.doesNotMatch(panel, /syntheticUserPreview/);
  assert.match(adapter, /await loadRealProvisioningReadiness\(input.tenantId\)/);
  assert.match(adapter, /result.success !== true/);
  assert.match(preview, /syntheticUserPreview/);
  assert.match(preview, /No email is sent and no production account is created/);
});
