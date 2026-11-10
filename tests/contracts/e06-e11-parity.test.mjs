import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspace = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
const quickAccess = readFileSync(new URL('../../src/live/EmployeeDashboardQuickAccess.tsx', import.meta.url), 'utf8');
const employeeRequests = readFileSync(new URL('../../src/live/MyServiceRequests.tsx', import.meta.url), 'utf8');
const managerRequests = readFileSync(new URL('../../src/live/ServiceRequestReview.tsx', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/20261110193754_hris_attendance_correction_movement_parity.sql', import.meta.url), 'utf8');
const projectLocale = readFileSync(new URL('../../src/live/project-locale.ts', import.meta.url), 'utf8');
const serviceLocale = readFileSync(new URL('../../src/live/service-request-locale.ts', import.meta.url), 'utf8');
const isolatedAcceptance = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');
const correctionBrowser = readFileSync(new URL('../sql/isolated-auth/run-employee-attendance-correction-browser.mjs', import.meta.url), 'utf8');

test('E06 correction contract enforces tenant ownership, categories, time integrity, and evidence policy', () => {
  assert.match(migration, /public\.hris_get_my_attendance_correction_context/);
  assert.match(migration, /public\.hris_own_employee_for_tenant\(p_tenant_id\)/);
  assert.match(migration, /employee_can_edit_pending/);
  assert.match(migration, /employee_can_cancel_pending/);
  assert.match(migration, /evidence_required/);
  assert.match(migration, /correction_categories text\[\] NOT NULL DEFAULT/);
  assert.match(migration, /'check_in_time','check_out_time','work_location'/);
  assert.match(migration, /Check-out must be after check-in\./);
  assert.match(migration, /v_effective_check_out<=v_effective_check_in/);
  assert.match(workspace, /effectiveCheckOut <= effectiveCheckIn/);
  assert.match(migration, /storage\.objects/);
  assert.match(migration, /attendance-evidence/);
  assert.match(migration, /storage\.foldername\(v_evidence_path\)/);
  assert.match(migration, /public\.admin_save_attendance\(uuid,date,jsonb\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.attendance_correction_settings/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /FROM PUBLIC,anon,authenticated,service_role/);
});

test('E06 employee history and manager queue expose policy-controlled actions and private evidence', () => {
  assert.match(workspace, /hris_get_my_attendance_correction_context/);
  assert.match(workspace, /hris_employee_submit_attendance_correction/);
  assert.match(workspace, /hris_employee_update_attendance_correction/);
  assert.match(workspace, /hris_employee_cancel_attendance_correction/);
  assert.match(workspace, /policy\.employee_can_edit_pending &&/);
  assert.match(workspace, /policy\.employee_can_cancel_pending &&/);
  assert.match(workspace, /createSignedUrl\(path, 60\)/);
  assert.match(workspace, /Decision note \(required when rejecting\)/);
  assert.match(workspace, /original_client_name/);
  assert.match(workspace, /item\.client_name \? `\$\{tx\('Client name'\)\}/);
  assert.match(migration, /attendance_corrections_requested_work_mode_check/);
  assert.match(workspace, /correctionEvidenceError/);
});

test('E11 employee entry points open Client Meeting and Office Entry in their structured flows', () => {
  assert.match(quickAccess, /label: 'Client Meeting'/);
  assert.match(quickAccess, /label: 'Office Entry'/);
  assert.match(workspace, /onOpenClientMeeting=\{\(\) => \{ setServiceRequestMovementPreset\('client_meeting'\)/);
  assert.match(workspace, /openRequested=\{attendanceCorrectionOpenRequested\}/);
  assert.match(workspace, /onOpenOfficeEntry=\{\(\) => setAttendanceCorrectionOpenRequested\(true\)\}/);
  assert.match(workspace, /initialMovementType=\{serviceRequestMovementPreset\}/);
});

test('E11 movement submission preserves the existing WFH RPC and stores structured client meeting details', () => {
  assert.match(employeeRequests, /hris_submit_my_movement_request/);
  assert.match(employeeRequests, /hris_submit_my_work_from_home_request/);
  assert.match(employeeRequests, /value\.movementType === 'client_meeting'/);
  assert.match(employeeRequests, /value\.remarks\.trim\(\)/);
  assert.match(employeeRequests, /from_date: value\.fromDate/);
  assert.match(employeeRequests, /to_date: value\.toDate/);
  assert.match(employeeRequests, /client_name: value\.clientName\.trim\(\)/);
  assert.match(employeeRequests, /movementDraft\.remarks\.trim\(\)/);
  assert.match(employeeRequests, /hris_mark_my_movement_returned/);
  assert.match(migration, /'form_version','e11_v1'/);
  assert.match(migration, /public\.service_request_status_history/);
  assert.match(migration, /UPDATE public\.attendance_records a SET work_mode='client_meeting'/);
  assert.match(migration, /AND a\.attendance_date BETWEEN/);
});

test('E11 manager decisions use the tenant-scoped approval path and keep unrelated requests on the old workflow', () => {
  assert.match(managerRequests, /hris_resolve_tenant_movement_request/);
  assert.match(managerRequests, /MovementSummary/);
  assert.match(managerRequests, /request\.request_data\?\.form_version === 'e11_v1'/);
  assert.match(managerRequests, /The movement request was approved\./);
  assert.match(migration, /public\.has_tenant_permission\(p_tenant_id,'employees\.manage'\)/);
  assert.match(migration, /p_next_status NOT IN \('approved','rejected'\)/);
});

test('isolated acceptance applies E06/E11 SQL and exercises movement decisions and attendance projection', () => {
  assert.match(isolatedAcceptance, /20261110193754_hris_attendance_correction_movement_parity\.sql/);
  assert.match(isolatedAcceptance, /E11 official movement persists its typed destination/);
  assert.match(isolatedAcceptance, /E11 movement decisions deny a foreign-tenant manager/);
  assert.match(isolatedAcceptance, /E11 approved client meeting updates only its existing attendance row/);
  assert.match(correctionBrowser, /correction_categories/);
  assert.match(correctionBrowser, /Check-in time/);
});

test('new E06 and E11 labels have Bengali translations', () => {
  for (const label of ['Office Entry', 'Open evidence', 'Client', 'Field', 'Attendance correction updated.']) {
    assert.match(projectLocale, new RegExp(`'${label.replaceAll('.', '\\.')}':`));
  }
  for (const label of ['Movement type', 'Client meeting', 'Remarks', 'Mark as returned', 'Remarks are required for a client meeting.']) {
    assert.match(serviceLocale, new RegExp(`'${label.replaceAll('.', '\\.')}':`));
  }
});

test('E06 and E11 SQL validation messages are translated in their employee flows', () => {
  const localeKeys = (source) => new Set([...source.matchAll(/^\s*'((?:[^'\\]|\\.)*)'\s*:/gm)].map(match => match[1]));
  const projectKeys = localeKeys(projectLocale);
  const serviceKeys = localeKeys(serviceLocale);
  const e06Sql = migration.slice(
    migration.indexOf('CREATE OR REPLACE FUNCTION private.hris_attendance_correction_values'),
    migration.indexOf('CREATE OR REPLACE FUNCTION public.hris_submit_my_movement_request'),
  );
  const e11Sql = migration.slice(
    migration.indexOf('CREATE OR REPLACE FUNCTION public.hris_submit_my_movement_request'),
    migration.indexOf('REVOKE ALL ON FUNCTION public.hris_get_my_attendance_correction_context'),
  );
  const raisedMessages = source => [...new Set([...source.matchAll(/RAISE EXCEPTION '([^']+)'/g)].map(match => match[1]))];
  for (const message of raisedMessages(e06Sql)) assert.ok(projectKeys.has(message), `Missing Bengali E06 translation: ${message}`);
  for (const message of raisedMessages(e11Sql)) assert.ok(serviceKeys.has(message), `Missing Bengali E11 translation: ${message}`);
});
