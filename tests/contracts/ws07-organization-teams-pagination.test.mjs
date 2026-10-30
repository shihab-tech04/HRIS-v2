import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readAllOrganizationPages } from '../../src/live/organizationTeamsPages.mjs';

const source = readFileSync(new URL('../../src/live/OrganizationTeams.tsx', import.meta.url), 'utf8');

test('HR03-05 organization directory reads all 620 rows, not a silently truncated 500', async () => {
  const records = Array.from({ length: 620 }, (_, id) => ({ id }));
  const requested = [];
  const result = await readAllOrganizationPages(async (from, to) => {
    requested.push([from, to]);
    return { data: records.slice(from, to + 1), error: null };
  }, () => true);
  assert.deepEqual(requested, [[0, 249], [250, 499], [500, 749]]);
  assert.deepEqual(result, records);
});

test('exactly full pages are followed by an empty final page', async () => {
  const records = Array.from({ length: 500 }, (_, id) => id);
  let calls = 0;
  const actual = await readAllOrganizationPages(async (from, to) => {
    calls += 1;
    return { data: records.slice(from, to + 1), error: null };
  }, () => true);
  assert.deepEqual(actual, records);
  assert.equal(calls, 3);
});

test('later page error rejects rather than showing or exporting misleading partial totals', async () => {
  const denied = new Error('permission revoked');
  await assert.rejects(readAllOrganizationPages(async (from) => ({
    data: from === 0 ? Array.from({ length: 250 }, (_, id) => id) : null,
    error: from === 0 ? null : denied,
  }), () => true), error => error === denied);
});

test('tenant switch during a query discards the prior tenant rows and stops subsequent pages', async () => {
  let current = true;
  let calls = 0;
  const rows = await readAllOrganizationPages(async () => {
    calls += 1;
    current = false;
    return { data: Array.from({ length: 250 }, (_, id) => id), error: null };
  }, () => current);
  assert.deepEqual(rows, []);
  assert.equal(calls, 1);
});

test('invalid or oversized pages fail closed', async () => {
  await assert.rejects(readAllOrganizationPages(async () => ({data: [], error: null}), () => true, 0), RangeError);
  await assert.rejects(readAllOrganizationPages(async () => ({data: Array(251).fill(null), error: null}), () => true), /Invalid organization page response/);
});

test('live Teams remains tenant-filtered, deterministically ordered, read-only, and exports visible rows', () => {
  assert.match(source, /supabase\.from\('teams'\)[\s\S]*?\.eq\('tenant_id', tenantId\)/);
  assert.match(source, /supabase\.from\('departments'\)[\s\S]*?\.eq\('tenant_id', tenantId\)/);
  assert.equal((source.match(/\.order\('name', \{ ascending: true \}\)/g) || []).length, 2);
  assert.equal((source.match(/\.order\('id', \{ ascending: true \}\)/g) || []).length, 2);
  assert.equal((source.match(/\.range\(start, end\)/g) || []).length, 2);
  assert.doesNotMatch(source, /\.limit\(500\)/);
  assert.doesNotMatch(source, /\.insert\s*\(|\.upsert\s*\(|\.update\s*\(|\.delete\s*\(|\.rpc\s*\(/);
  assert.match(source, /visibleTeams\.map\(team => \[team\.name, team\.code/);
  assert.match(source, /const isCurrent = \(\) => requestId === requestSequence\.current && activeTenantId\.current === tenantId/);
});
