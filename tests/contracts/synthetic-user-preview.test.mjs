import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const adapter = readFileSync(new URL('../../src/live/syntheticUserPreview.ts', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../src/live/SyntheticUserManagement.tsx', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');

test('synthetic user preview data stays tenant-scoped in browser storage and cannot create real accounts', () => {
  assert.match(adapter, /synesis-hris-preview-users:v1:/);
  assert.match(adapter, /window\.localStorage\.getItem/);
  assert.match(adapter, /window\.localStorage\.setItem/);
  assert.match(adapter, /encodeURIComponent\(tenantId\)/);
  assert.match(adapter, /@example\.com/);
  assert.match(adapter, /userId = `USR-/);
  assert.match(adapter, /employeeNumber: `EMP-/);
  assert.match(adapter, /PREVIEW_USER_ROLES/);
  assert.match(adapter, /user\.recordKey !== draft\.recordKey/);
  assert.doesNotMatch(workspace, /from ['"].*supabase/);
  assert.doesNotMatch(workspace, /\.rpc\(|\.from\(/);
  assert.match(workspace, /No email is sent and no production account is created/);
});

test('the synthetic workspace covers role previews, browser persistence, edits, status controls, and recovery messages', () => {
  for (const role of ['Employee', 'Manager', 'HOD', 'CEO', 'Administrator / HR Administrator', 'Recruitment / HR Operations']) {
    assert.match(workspace, new RegExp(role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(workspace, /View as User/);
  assert.match(workspace, /completedPreviewActions/);
  assert.match(workspace, /Search users/);
  assert.match(workspace, /All roles/);
  assert.match(workspace, /All statuses/);
  assert.match(workspace, /Remove synthetic user/);
  assert.match(workspace, /Deactivate preview user\?/);
  assert.match(workspace, /validateSyntheticPreviewDraft/);
  assert.match(shell, /isSuperAdmin \|\| permissions\.employeesManage/);
  assert.match(shell, /page === 'user-management-preview' && \(isSuperAdmin \|\| permissions\.employeesManage\)/);
});
