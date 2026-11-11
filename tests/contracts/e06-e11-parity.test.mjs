import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const workspace = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
const quickAccess = readFileSync(new URL('../../src/live/EmployeeDashboardQuickAccess.tsx', import.meta.url), 'utf8');
const employeeRequests = readFileSync(new URL('../../src/live/MyServiceRequests.tsx', import.meta.url), 'utf8');
const managerRequests = readFileSync(new URL('../../src/live/ServiceRequestReview.tsx', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/20261110193754_hris_attendance_correction_movement_parity.sql', import.meta.url), 'utf8');
const projectLocale = readFileSync(new URL('../../src/live/project-locale.ts', import.meta.url), 'utf8');
const serviceLocale = readFileSync(new URL('../../src/live/service-request-locale.ts', import.meta.url), 'utf8');
const isolatedAcceptance = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');
const correctionBrowser = readFileSync(new URL('../sql/isolated-auth/run-employee-attendance-correction-browser.mjs', import.meta.url), 'utf8');
const dashboardAttendanceBrowser = readFileSync(new URL('../sql/isolated-auth/run-employee-dashboard-attendance-browser.mjs', import.meta.url), 'utf8');
const releaseScriptPath = new URL('../../scripts/release/hris-attendance-gated-sql-release.sh', import.meta.url);
const releaseScript = readFileSync(releaseScriptPath, 'utf8');
const releaseWorkflow = readFileSync(new URL('../../.github/workflows/hris-attendance-gated-sql-release.yml', import.meta.url), 'utf8');
const releaseDispatcher = readFileSync(new URL('../../.github/workflows/hris-owner-command-release-dispatch.yml', import.meta.url), 'utf8');
const pagesWorkflow = readFileSync(new URL('../../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8');

test('E06 correction contract enforces tenant ownership, categories, time integrity, and evidence policy', () => {
  assert.match(migration, /public\.hris_get_my_attendance_correction_context/);
  assert.match(migration, /public\.hris_own_employee_for_tenant\(p_tenant_id\)/);
  assert.match(migration, /employee_can_edit_pending/);
  assert.match(migration, /employee_can_cancel_pending/);
  assert.match(migration, /evidence_required/);
  assert.match(migration, /correction_categories text\[\] NOT NULL DEFAULT/);
  assert.match(migration, /'check_in_time','check_out_time','work_location'/);
  assert.match(migration, /Check-out must be after check-in\./);
  const submitCorrection = migration.slice(
    migration.indexOf('CREATE OR REPLACE FUNCTION public.hris_employee_submit_attendance_correction'),
    migration.indexOf('CREATE OR REPLACE FUNCTION public.hris_employee_update_attendance_correction'),
  );
  assert.match(submitCorrection, /INSERT INTO public\.attendance_corrections\(\s*id,tenant_id/);
  assert.match(submitCorrection, /pg_catalog\.gen_random_uuid\(\)/);
  const resolveCorrection = migration.slice(
    migration.indexOf('CREATE OR REPLACE FUNCTION public.admin_resolve_attendance_correction'),
    migration.indexOf('CREATE OR REPLACE FUNCTION public.hris_submit_my_movement_request'),
  );
  assert.match(resolveCorrection, /'client_name',coalesce\(v_request\.client_name,v_current\.client_name,''\)/);
  assert.doesNotMatch(resolveCorrection, /Attendance record not found for correction\./);
  assert.match(migration, /v_effective_check_out<=v_effective_check_in/);
  assert.match(workspace, /effectiveCheckOut <= effectiveCheckIn/);
  assert.match(migration, /storage\.objects/);
  assert.match(migration, /attendance-evidence/);
  assert.match(migration, /storage\.foldername\(v_evidence_path\)/);
  assert.match(migration, /CREATE POLICY attendance_evidence_employee_upload[\s\S]+?FOR INSERT TO authenticated[\s\S]+?split_part\(name,'\/',1\)=\(SELECT auth\.uid\(\)\)::text[\s\S]+?hris_own_employee_for_tenant/);
  assert.match(migration, /CREATE POLICY attendance_evidence_employee_delete_unattached[\s\S]+?FOR DELETE TO authenticated[\s\S]+?NOT EXISTS \([\s\S]+?attendance_corrections/);
  assert.match(isolatedAcceptance, /E06 attendance evidence Storage permits own-tenant upload and orphan cleanup only/);
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
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.hris_get_my_attendance_period\([\s\S]*?a\.work_mode,\s*a\.client_name,a\.status/);
  assert.match(workspace, /Boolean\(row\.client_name\) && <span className="mt-1 block text-xs text-slate-500">\{tx\('Client name'\)\}/);
});

test('E11 manager decisions use the tenant-scoped approval path and keep unrelated requests on the old workflow', () => {
  assert.match(managerRequests, /hris_resolve_tenant_movement_request/);
  assert.match(managerRequests, /MovementSummary/);
  assert.match(managerRequests, /request\.request_data\?\.form_version === 'e11_v1'/);
  assert.match(managerRequests, /The movement request was approved\./);
  assert.match(migration, /public\.has_tenant_permission\(p_tenant_id,'employees\.manage'\)/);
  assert.match(migration, /p_next_status NOT IN \('approved','rejected'\)/);
  assert.match(migration, /a\.work_mode IN \('office','home','client','field','client_meeting'\)/);
});

test('isolated acceptance applies E06/E11 SQL and exercises movement decisions and attendance projection', () => {
  assert.match(isolatedAcceptance, /20261110193754_hris_attendance_correction_movement_parity\.sql/);
  assert.match(isolatedAcceptance, /E11 official movement persists its typed destination/);
  assert.match(isolatedAcceptance, /E11 movement decisions deny a foreign-tenant manager/);
  assert.match(isolatedAcceptance, /E11 approved client meeting updates only its existing attendance row/);
  assert.match(correctionBrowser, /correction_categories/);
  assert.match(isolatedAcceptance, /E06-04 employee evidence is optional by default, required by tenant policy/);
  assert.match(isolatedAcceptance, /E06-06 pending edits and cancellation work only under their tenant policy/);
  assert.match(isolatedAcceptance, /E06 pending edit and cancellation are denied when organization policy is disabled/);
  assert.doesNotMatch(isolatedAcceptance, /E06-0[46] partial:/);
  assert.match(correctionBrowser, /E06-04_PRIVATE_EVIDENCE_UPLOAD_AND_SIGNED_READ_BROWSER_PASS/);
  assert.match(correctionBrowser, /E06-06_POLICY_ENABLED_PENDING_EDIT_CANCEL_AND_RECOVERY_BROWSER_PASS/);
  assert.match(correctionBrowser, /hris_employee_update_attendance_correction/);
  assert.match(correctionBrowser, /hris_employee_cancel_attendance_correction/);
  assert.match(correctionBrowser, /Check-in time/);
  assert.match(correctionBrowser, /Decision note \(required when rejecting\)/);
  assert.match(correctionBrowser, /চেক-ইনের সময়/);
  assert.match(dashboardAttendanceBrowser, /An attendance correction with no selected category remained submittable/);
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
    migration.indexOf('CREATE OR REPLACE FUNCTION public.hris_get_my_attendance_period'),
  );
  const raisedMessages = source => [...new Set([...source.matchAll(/RAISE EXCEPTION '([^']+)'/g)].map(match => match[1]))];
  for (const message of raisedMessages(e06Sql)) assert.ok(projectKeys.has(message), `Missing Bengali E06 translation: ${message}`);
  for (const message of raisedMessages(e11Sql)) assert.ok(serviceKeys.has(message), `Missing Bengali E11 translation: ${message}`);
  assert.ok(projectKeys.has('Choose a calendar month up to the current organization month.'));
});

test('E06/E11 production release is pinned, protected, recovery-gated, and required before Pages', () => {
  execFileSync('bash', ['-n', fileURLToPath(releaseScriptPath)], { encoding: 'utf8' });
  assert.match(releaseScript, /20261110193754_hris_attendance_correction_movement_parity\.sql/);
  const migrationSha256 = createHash('sha256').update(migration).digest('hex');
  assert.ok(releaseScript.includes(migrationSha256), 'Release checksum must match the exact reviewed migration bytes.');
  assert.match(releaseScript, /pulls\/196/);
  assert.match(releaseScript, /supabase db push --db-url .*--dry-run/);
  assert.match(releaseScript, /ATTENDANCE_PRODUCTION_POSTCHECK_PASS/);
  assert.match(releaseWorkflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(releaseWorkflow, /inputs\.release_approved == true/);
  assert.match(releaseWorkflow, /inputs\.offsite_recovery_verified == true/);
  assert.match(releaseDispatcher, /'attendance':rf'\/hris-prod attendance/);
  assert.match(releaseDispatcher, /hris-attendance-gated-sql-release\.yml/);
  assert.match(pagesWorkflow, /version='20261110193754' AND name='hris_attendance_correction_movement_parity'/);
  assert.match(pagesWorkflow, /hris_get_my_attendance_correction_context/);
  assert.match(pagesWorkflow, /hris_resolve_tenant_movement_request/);
  assert.match(pagesWorkflow, /attendance_evidence_own_select/);
});
