import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../supabase/functions/admin-create-user/index.ts', import.meta.url), 'utf8');

test('account creation requires selected tenant and a server-verified administrator before writing Auth', () => {
  const checkpoint = [
    'userClient.auth.getUser(token)',
    'const tenantId = String(body.tenantId',
    '"has_tenant_permission"',
    'p_permission_id: "admin_users.manage"',
    '"synesis_tenant_id"',
    'canonicalTenantId !== tenantId',
    '"admin_get_my_provisioning_context"',
    'provisioning?.can_manage !== true',
    'provisioning.assignable_roles',
    'provisioning.available_employees',
    'adminClient.auth.admin.createUser(',
    '"admin_finalize_system_user"',
  ];
  let last = -1;
  for (const marker of checkpoint) {
    const next = source.indexOf(marker);
    assert.ok(next > last, `Expected authorized step after previous checkpoint: ${marker}`);
    last = next;
  }
  assert.match(source, /tenantAllowed !== true/);
  assert.match(source, /status: 401/);
  assert.match(source, /status: 403/);
  assert.doesNotMatch(source, /SINGLE_SUPER_ADMIN_LOGIN_ONLY|additionalAuthProvisioningDisabled/);
});

test('new credentials are validated and must never be exposed in response or written to business SQL', () => {
  assert.match(source, /const password = String\(body.password/);
  assert.match(source, /password.length < 12/);
  assert.match(source, /isCompromisedPassword\(password\)/);
  assert.match(source, /email_confirm: true/);
  assert.match(source, /app_metadata: \{ account_type: "workforce" \}/);
  assert.match(source, /adminClient\.auth\.admin\.createUser\(\{[\s\S]*?password,[\s\S]*?\}\)/);
  assert.doesNotMatch(source, /JSON\.stringify\(\{[^\n]*password/);
});

test('duplicate identities, rejected role/employee grants and SQL failure fail closed', () => {
  assert.match(source, /Selected role is not assignable by this administrator/);
  assert.match(source, /Selected employee is unavailable or already has a user account/);
  assert.match(source, /An account with this email already exists/);
  assert.match(source, /status: duplicate \? 409 : 400/);
  assert.match(source, /if \(finalizeError\)/);
  const failedFinalize = source.indexOf('if (finalizeError)');
  const rollback = source.indexOf('adminClient.auth.admin.deleteUser(created.user.id)');
  const success = source.indexOf('success: true, user:');
  assert.ok(failedFinalize >= 0 && rollback > failedFinalize && success > rollback);
});
