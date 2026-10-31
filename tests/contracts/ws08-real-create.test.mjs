import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const adapter = readFileSync(new URL('../../src/live/realPasswordProvisioning.ts', import.meta.url), 'utf8');
const form = readFileSync(new URL('../../src/live/RealPasswordProvisioningForm.tsx', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');

test('WS08 password-based v3 adapter rechecks permission/role/employee before invocation and never claims an invitation', () => {
  assert.match(adapter, /loadRealProvisioningReadiness\(input\.tenantId\)/);
  assert.match(adapter, /assignableRoles\.some/);
  assert.match(adapter, /availableEmployees\.find/);
  assert.match(adapter, /employee\.official_email/);
  assert.match(adapter, /supabase\.functions\.invoke\('admin-create-user'/);
  assert.match(adapter, /password: input\.initialPassword/);
  assert.match(adapter, /employeeId: input\.employeeId/);
  assert.match(adapter, /roleId,/);
  assert.match(adapter, /UNCONFIRMED/);
  assert.doesNotMatch(adapter, /auth\.admin|service_role|signUp\(|inviteUserByEmail/);
});

test('WS08 password-based UI defaults disabled, prevents double-submit and does not enter live shared navigation', () => {
  assert.match(form, /mutationApproved = false/);
  assert.match(form, /if \(!canSubmit \|\| submittingLock\.current/);
  assert.match(form, /setUnknownOutcome\(true\)/);
  assert.match(form, /setPassword\(''\)/);
  assert.match(form, /not send an invitation/);
  assert.match(form, /locale === 'bn'/);
  assert.doesNotMatch(shell, /RealPasswordProvisioningForm|realPasswordProvisioning/);
});
