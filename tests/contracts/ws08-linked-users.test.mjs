import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const adapter = readFileSync(new URL('../../src/live/realUserDirectoryApi.ts', import.meta.url), 'utf8');
const screen = readFileSync(new URL('../../src/live/RealLinkedUserDirectory.tsx', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');

test('WS08 real linked-user directory requires selected-tenant view permissions and refuses cross-tenant rows', () => {
  for (const word of ['admin_users.view', 'employees.view', 'synesis_tenant_id', 'tenant_id', 'user_roles', 'admin_users',
    'has_tenant_permission', 'organization.view', 'organization.manage', 'employees', 'departments', 'designations']) {
    assert.ok(adapter.includes(word), word);
  }
  assert.match(adapter, /scoped\.data !== tenantId/);
  assert.match(adapter, /uuid\(row\.tenant_id, 'tenant identifier'\) !== tenantId/);
  assert.match(adapter, /memberIds\.has\(id\)/);
  assert.match(adapter, /finalScope\.data !== tenantId/);
  assert.match(adapter, /range\(offset, offset \+ REAL_USER_DIRECTORY_PAGE_SIZE - 1\)/);
  assert.doesNotMatch(adapter + screen, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|functions\.invoke\(|auth\.admin/);
});

test('WS08 linked-user directory does not modify shared shell or conflate accounts with the synthetic preview', () => {
  assert.match(screen, /read-only directory|read-only|not the browser-only preview/i);
  assert.match(screen, /Auth account enabled\/disabled state/);
  assert.match(screen, /locale === 'bn'/);
  assert.match(screen, /response\?\.tenantId === tenantId/);
  assert.doesNotMatch(screen, /syntheticUserPreview/);
  assert.doesNotMatch(shell, /RealLinkedUserDirectory/);
});
