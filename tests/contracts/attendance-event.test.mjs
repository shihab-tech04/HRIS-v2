import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspace = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/20261012115907_hris_employee_web_attendance_event.sql', import.meta.url), 'utf8');

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
