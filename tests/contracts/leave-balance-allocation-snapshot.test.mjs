import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../../supabase/migrations/20261016183000_hris_leave_balance_allocation_snapshot.sql', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');

test('leave submission stores the per-year balance allocation used for its pending ledger charge', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS private\.hris_leave_balance_allocations/);
  assert.match(migration, /REVOKE ALL ON TABLE private\.hris_leave_balance_allocations FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(migration, /LOCK TABLE public\.holidays IN SHARE MODE/);
  assert.match(migration, /FOR SHARE/);
  assert.match(migration, /v_allocation := v_allocation \|\| jsonb_build_array/);
  assert.match(migration, /INSERT INTO private\.hris_leave_balance_allocations/);
  assert.match(migration, /pending_days=b\.pending_days\+v_split\.chargeable_days/);
});

test('leave decisions use the saved allocation and retain the legacy path for earlier requests', () => {
  assert.match(migration, /FROM private\.hris_leave_balance_allocations a[\s\S]+?v_snapshot_days/);
  assert.match(migration, /pending_days=greatest\(0,b\.pending_days-v_split\.chargeable_days\)/);
  assert.match(migration, /used_days=b\.used_days\+CASE WHEN p_decision='approved' THEN v_split\.chargeable_days ELSE 0 END/);
  assert.match(migration, /Older requests have no submission-time split/);
  assert.match(migration, /balance_allocation_snapshot/);
});

test('isolated Auth/Postgres acceptance changes the calendar before resolving a new request', () => {
  const stagedResolverIndex = runner.indexOf('supabase/staging/approval-resolution/20261012_04_hris_leave_approval_tenant_guard.sql');
  const allocationResolverIndex = runner.indexOf('supabase/migrations/20261016183000_hris_leave_balance_allocation_snapshot.sql');
  assert.ok(stagedResolverIndex > -1 && allocationResolverIndex > stagedResolverIndex,
    'the allocation-aware resolver must be applied after the staged legacy resolver');
  assert.match(runner, /Leave approval consumes the submission allocation after the holiday calendar changes/);
  assert.match(runner, /private from employee and manager table reads/);
  assert.match(runner, /generate_series\('2098-01-01'::date,'2098-02-28'::date/);
  assert.match(runner, /daterange\(r\.from_date,r\.to_date,'\[\]'\) && daterange\(candidate::date,candidate::date,'\[\]'\)/);
});
