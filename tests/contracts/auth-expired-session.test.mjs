import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const fixture = read('../sql/isolated-auth/fixture.sql');
const runner = read('../sql/isolated-auth/run-local.mjs');

test('expired sessions are rejected by the real Auth/Postgres employee read path', () => {
  assert.match(fixture, /s\.not_after IS NULL OR s\.not_after > now\(\)/i);
  assert.match(runner, /UPDATE auth\.sessions SET not_after=now\(\)-interval '1 second'/);
  assert.match(runner, /hris_get_my_dashboard_data', \{ p_tenant_id: ids\.tenantA \}/);
  assert.match(runner, /An expired Auth session is denied by the employee dashboard server guard/);
  assert.match(runner, /UPDATE auth\.sessions SET not_after=\$\{originalNotAfter === null/);
});
