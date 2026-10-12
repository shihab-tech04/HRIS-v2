import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const leaveSql = readFileSync(new URL('../../supabase/staging/approval-resolution/20261012_04_hris_leave_approval_tenant_guard.sql', import.meta.url), 'utf8');
const attendanceSql = readFileSync(new URL('../../supabase/staging/approval-resolution/20261012_05_hris_attendance_approval_tenant_and_partial_fields.sql', import.meta.url), 'utf8');
const productionMigrationNames = readdirSync(new URL('../../supabase/migrations/', import.meta.url));

test('approval fixes remain staged outside the production migration directory', () => {
  assert.ok(!productionMigrationNames.some(name => /approval_tenant_guard|approval_tenant_and_partial_fields/.test(name)));
  assert.match(leaveSql, /DO NOT run on production before isolated Auth\/RLS certification/i);
  assert.match(attendanceSql, /ISOLATED RELEASE CANDIDATE ONLY/i);
});

test('leave resolution locks only a pending request from the authorized tenant', () => {
  assert.match(leaveSql, /public\.is_live_session\(\).*public\.has_permission\('leave\.manage'\)/s);
  assert.match(leaveSql, /WHERE id=p_id AND tenant_id=v_tenant AND status='pending' FOR UPDATE/);
  assert.match(leaveSql, /WHERE e\.id=r\.employee_id AND e\.tenant_id=v_tenant/);
  assert.match(leaveSql, /WHERE employee_id=r\.employee_id AND tenant_id=v_tenant/);
  assert.match(leaveSql, /resolved_by=auth\.uid\(\),resolved_at=now\(\)/);
});

test('attendance resolution is tenant-scoped and preserves unrequested existing fields', () => {
  assert.match(attendanceSql, /public\.is_live_session\(\).*public\.has_permission\('attendance\.manage'\)/s);
  assert.match(attendanceSql, /WHERE id=p_id AND tenant_id=v_tenant AND status='pending' FOR UPDATE/);
  assert.match(attendanceSql, /WHERE tenant_id=v_tenant AND employee_id=v_request\.employee_id[\s\S]*FOR UPDATE/);
  assert.match(attendanceSql, /COALESCE\(v_request\.requested_check_in,v_current\.check_in\)/);
  assert.match(attendanceSql, /COALESCE\(v_request\.requested_check_out,v_current\.check_out\)/);
  assert.match(attendanceSql, /COALESCE\(v_request\.requested_work_mode,v_current\.work_mode,'office'\)/);
});

test('staged replacements retain explicit search paths and do not change execute grants', () => {
  for (const sql of [leaveSql, attendanceSql]) {
    assert.match(sql, /SECURITY DEFINER\s+SET search_path TO 'pg_catalog', 'public', 'auth'/i);
    assert.doesNotMatch(sql, /^\s*(GRANT|REVOKE)\b/im);
    assert.match(sql, /admin_audit_logs/);
  }
});
