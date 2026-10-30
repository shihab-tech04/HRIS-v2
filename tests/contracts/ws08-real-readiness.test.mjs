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
  assert.doesNotMatch(adapter + panel, /supabase\.functions\.invoke|supabase\.auth\.admin|\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test('WS08 standalone panel is read-only, localizable and isolated from synthetic preview', () => {
  assert.match(panel, /read-only readiness/);
  assert.match(panel, /read-only WS08 panel|read-only|does not create accounts/);
  assert.match(panel, /availableEmployees/);
  assert.match(panel, /retry/);
  assert.match(panel, /locale === 'bn'/);
  assert.match(panel, /currentValue = value\?\.tenantId === tenantId/);
  assert.doesNotMatch(panel, /syntheticUserPreview/);
  assert.match(preview, /syntheticUserPreview/);
  assert.match(preview, /No email is sent and no production account is created/);
});
