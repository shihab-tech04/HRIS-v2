import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspace = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/20261012115907_hris_employee_web_attendance_event.sql', import.meta.url), 'utf8');
const browser = readFileSync(new URL('../sql/isolated-auth/run-employee-clock-browser.mjs', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');
const catalogue = JSON.parse(readFileSync(new URL('../../docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json', import.meta.url), 'utf8'));

test('employee overview submits live check-in/out events and refreshes its own attendance summary', () => {
  assert.match(workspace, /rpc\('hris_employee_record_attendance_event'/);
  assert.match(workspace, /p_tenant_id: tenantId,[\s\S]+?p_event: event/);
  assert.match(workspace, /await load\(false\)/);
  assert.match(workspace, /attendanceActionError && <p role="alert"/);
  assert.match(workspace, /attendanceActionSuccess && <p role="status"/);
});

test('web attendance RPC requires a live linked employee and the active tenant-local date', () => {
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /SET search_path TO 'pg_catalog', 'public', 'auth'/);
  assert.match(migration, /public\.is_live_session\(\)/);
  assert.match(migration, /public\.hris_own_employee_for_tenant\(p_tenant_id\)/);
  assert.match(migration, /t\.id=p_tenant_id AND t\.is_active IS TRUE/);
  assert.match(migration, /now\(\) AT TIME ZONE v_timezone/);
});

test('web attendance RPC preserves unrelated fields, rejects duplicate punches, and writes one audit event', () => {
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /ON CONFLICT \(tenant_id,employee_id,attendance_date\) DO NOTHING/);
  assert.match(migration, /You are already checked in today/);
  assert.match(migration, /You are already checked out today/);
  assert.match(migration, /SET check_out=now\(\),updated_at=now\(\)/);
  assert.match(migration, /INSERT INTO public\.admin_audit_logs/);
  assert.match(migration, /attendance\.web_check_in/);
  assert.match(migration, /attendance\.web_check_out/);
  assert.match(migration, /FROM PUBLIC, anon/);
  assert.match(migration, /TO authenticated, service_role/);
});

test('E05-01 through E05-03 are linked to real Auth/Postgres browser evidence with failure recovery and refresh persistence', () => {
  const stories = new Map(catalogue.stories.filter(story => ['E05-01', 'E05-02', 'E05-03'].includes(story.story_id))
    .map(story => [story.story_id, story.verbatim_requirement]));
  assert.equal(stories.get('E05-01'), 'As an employee, I want to check in.');
  assert.equal(stories.get('E05-02'), 'As an employee, I want to check out.');
  assert.equal(stories.get('E05-03'), 'As an employee, I want to see my current attendance status.');
  assert.match(browser, /Synthetic one-time attendance failure/);
  assert.match(browser, /EMPLOYEE_CLOCK_BROWSER_ACCEPTANCE=PASS/);
  assert.match(browser, /assertNoOverflow\(page, '375px employee check-in'/);
  assert.match(browser, /assertNoOverflow\(page, '1280px employee check-out'/);
  assert.match(browser, /page.reload()/);
  for (const id of ['E05-01', 'E05-02', 'E05-03']) {
    assert.match(browser, new RegExp(`${id}_AUTH_POSTGRES_BROWSER_PASS`));
    assert.ok(runtime.includes(`record('${id} `), `${id} must have an isolated runtime acceptance record`);
  }
  assert.match(runtime, /E05 browser clock acceptance removes only its synthetic attendance and audit rows/);
});
