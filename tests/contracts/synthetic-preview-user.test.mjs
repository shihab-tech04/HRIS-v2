import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSyntheticPreviewUser, PREVIEW_EMAIL_DOMAIN } from '../../src/views/admin/synthetic-user-generator.mjs';

const input = { tenantId: 'tenant-fixture-1', roleId: 'role-employee', department: 'Accounts', designation: 'Officer' };

test('generated preview users have complete reserved emails, unique IDs and explicit preview persistence', () => {
  const user = generateSyntheticPreviewUser({ ...input, makeCode: () => 'F02C81' });
  assert.equal(user.userId, 'USR-F02C81');
  assert.equal(user.employeeId, 'EMP-F02C81');
  assert.match(user.email, /^[a-z0-9.]+\\.[a-f0-9]{6}@example\\.com$/);
  assert.equal(PREVIEW_EMAIL_DOMAIN, 'example.com');
  assert.equal(user.status, 'active');
  assert.equal(user.persistence, 'preview');
  assert.equal(user.tenantId, input.tenantId);
  assert.equal(user.roleId, input.roleId);
  assert.ok(!('password' in user) && !('authUserId' in user));
});

test('collisions in email, user ID or employee ID are retried without overwriting old users', () => {
  let count = 0;
  const original = generateSyntheticPreviewUser({ ...input, makeCode: () => 'F02C81' });
  const newer = generateSyntheticPreviewUser({
    ...input, existingUsers: [original],
    makeCode: () => ++count === 1 ? 'F02C81' : 'A13D90',
  });
  assert.equal(newer.userId, 'USR-A13D90');
  assert.notEqual(newer.email, original.email);
  assert.equal(original.userId, 'USR-F02C81');
});

test('empty tenant, role, department, designation and invalid generator are rejected', () => {
  for (const key of ['tenantId', 'roleId', 'department', 'designation']) {
    assert.throws(() => generateSyntheticPreviewUser({ ...input, [key]: '' }), /required/);
  }
  assert.throws(() => generateSyntheticPreviewUser({ ...input, makeCode: () => 'NOT-HEX' }), /Invalid generated/);
});

test('preview identities never automatically assign real account or platform-super-admin privileges', () => {
  const user = generateSyntheticPreviewUser({ ...input, makeCode: () => 'AB12CD' });
  assert.deepEqual(Object.keys(user).sort(), [
    'userId', 'employeeId', 'fullName', 'email', 'roleId',
    'department', 'designation', 'tenantId', 'status', 'persistence',
  ].sort());
});
