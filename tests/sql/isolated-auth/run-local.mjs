Warning: truncated output (original token count: 175467)
Total output lines: 9907

// Run only against a disposable Supabase CLI stack. The local GoTrue service
// creates real synthetic Auth sessions; psql uses their JWT claims as the
// authenticated database role so RLS and SECURITY DEFINER paths are exercised.
// This harness never logs local API keys, access tokens, or synthetic passwords.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { createTrackedAuthUser, deleteTrackedAuthUser, signInTrackedAuthUser } from './auth-user-fixture.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const mainRoot = path.resolve(here, '../../..');
const workdir = path.resolve(process.env.HRIS_SUPABASE_TEST_WORKDIR || '/private/tmp/synesis-local-hris-test');
const dockerContext = process.env.HRIS_DOCKER_CONTEXT || 'colima-hris-scratch';
const expectedApiPort = process.env.HRIS_SUPABASE_API_PORT || '55421';
const expectedDatabasePort = process.env.HRIS_SUPABASE_DB_PORT || '55422';
const allowedTestWorkdirs = new Set([
  path.resolve('/private/tmp/synesis-local-hris-test'),
  path.resolve('/tmp/synesis-local-hris-test'),
]);
if (!allowedTestWorkdirs.has(workdir)) {
  throw new Error('Refusing to test: use only the dedicated /private/tmp or /tmp Synesis HRIS acceptance workdir.');
}
const dockerEndpoint = execFileSync('docker', [
  'context', 'inspect', dockerContext, '--format', '{{.Endpoints.docker.Host}}',
], { env: process.env, encoding: 'utf8' }).trim();
const cliEnv = {
  ...process.env,
  DOCKER_HOST: dockerEndpoint,
  DOCKER_CONTEXT: dockerContext,
  SUPABASE_HOME: process.env.SUPABASE_HOME || '/private/tmp/synesis-supabase-home',
  SUPABASE_TELEMETRY_DISABLED: '1',
};

function cli(args) {
  return execFileSync('supabase', [...args, '--workdir', workdir], {
    cwd: mainRoot, env: cliEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    // Supabase reset can emit several megabytes of container logs while
    // restarting services in this disposable test stack.
    maxBuffer: 16 * 1024 * 1024,
  });
}

function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const raw = match[2].trim();
    values[match[1]] = raw.startsWith('"') ? JSON.parse(raw) : raw;
  }
  return values;
}

const services = parseEnv(cli(['status', '--output', 'env']));
const apiUrlOverride = process.env.HRIS_SUPABASE_API_URL;
if (apiUrlOverride) {
  let override;
  try { override = new URL(apiUrlOverride); }
  catch { throw new Error('Refusing to test: the explicit isolated API URL is invalid.'); }
  if (override.protocol !== 'http:' || override.hostname !== '127.0.0.1'
      || override.username || override.password || override.pathname !== '/'
      || override.search || override.hash) {
    throw new Error('Refusing to test: an explicit isolated API URL must be a plain HTTP loopback origin.');
  }
  services.API_URL = override.origin;
}
if (!services.API_URL || !services.ANON_KEY || !services.SERVICE_ROLE_KEY) {
  throw new Error('Local Supabase status did not provide the API URL and local keys.');
}
const apiUrl = new URL(services.API_URL);
const databaseUrl = new URL(services.DB_URL);
if (apiUrl.hostname !== '127.0.0.1' || apiUrl.port !== expectedApiPort
    || databaseUrl.hostname !== '127.0.0.1' || databaseUrl.port !== expectedDatabasePort) {
  throw new Error(`Refusing to test: expected isolated Supabase ports ${expectedApiPort}/${expectedDatabasePort}.`);
}
if (execFileSync('docker', ['--context', dockerContext, 'context', 'show'], {
  env: cliEnv, encoding: 'utf8',
}).trim() !== dockerContext) {
  throw new Error(`Refusing to test: Docker context ${dockerContext} is unavailable.`);
}

const dbContainer = execFileSync('docker', [
  '--context', dockerContext,
  'ps', '--filter', `name=supabase_db_${path.basename(workdir)}`, '--format', '{{.Names}}',
], { env: cliEnv, encoding: 'utf8' }).trim().split(/\r?\n/)[0];
if (!dbContainer) throw new Error('No local Supabase Postgres container matched the disposable test workspace.');

function psqlSync(input) {
  return execFileSync('docker', [
    '--context', dockerContext,
    'exec', '-i', dbContainer, 'psql', '-X', '-A', '-t', '-q', '--set=ON_ERROR_STOP=1',
    '--username', 'postgres', '--dbname', 'postgres',
  ], { env: cliEnv, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

function psqlAsync(input) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', [
      '--context', dockerContext,
      'exec', '-i', dbContainer, 'psql', '-X', '-A', '-t', '-q', '--set=ON_ERROR_STOP=1',
      '--username', 'postgres', '--dbname', 'postgres',
    ], { env: cliEnv, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(Object.assign(new Error(stderr || `psql exited with ${code}`), { stdout, stderr, code }));
    });
    child.stdin.end(input);
  });
}

function applySql(file) {
  return psqlSync(readFileSync(file, 'utf8'));
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function addCalendarDays(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function sessionSql(session, statement, role = 'authenticated') {
  const claims = JSON.parse(Buffer.from(session.accessToken.split('.')[1], 'base64url').toString('utf8'));
  if (!claims.sub || !claims.session_id) throw new Error('Local Auth token lacks user or session identity claims.');
  const claimsJson = JSON.stringify(claims);
  return `BEGIN;
SET LOCAL ROLE ${role};
DO $claims$
BEGIN
  PERFORM set_config('request.jwt.claims', ${sqlLiteral(claimsJson)}, true);
  PERFORM set_config('request.jwt.claim.sub', ${sqlLiteral(claims.sub)}, true);
END
$claims$;
${statement};
COMMIT;
`;
}

function jsonResult(output) {
  return JSON.parse(output.trim().split(/\r?\n/).at(-1));
}

function queryAs(session, sql) {
  return jsonResult(psqlSync(sessionSql(session, sql)));
}

function queryAnon(sql) {
  return jsonResult(psqlSync(`BEGIN;\nSET LOCAL ROLE anon;\n${sql};\nCOMMIT;\n`));
}

function attemptAs(session, sql, role = 'authenticated') {
  const input = role === 'anon'
    ? `BEGIN;\nSET LOCAL ROLE anon;\n${sql};\nCOMMIT;\n`
    : sessionSql(session, sql, role);
  try { return { ok: true, value: psqlSync(input).trim() }; }
  catch (error) { return { ok: false, error }; }
}

function queryAdmin(sql) {
  return jsonResult(psqlSync(sql));
}

function cleanupAttendanceCorrectionBrowserFixture() {
  if (!attendanceCorrectionBrowserFixtureId || !attendanceCorrectionBrowserDate
      || attendanceCorrectionBrowserReasons.length === 0) return;
  const reasons = attendanceCorrectionBrowserReasons.map(sqlLiteral).join(',');
  psqlSync(`DELETE FROM public.admin_audit_logs
    WHERE (target_type='attendance_correction' AND target_id IN (
      SELECT id::text FROM public.attendance_corrections
      WHERE tenant_id='11111111-1111-4111-8111-111111111111'::uuid
        AND employee_id='55555555-5555-4555-8555-555555555555'::uuid AND reason IN (${reasons})
    )) OR (target_type='attendance_record' AND target_id=${sqlLiteral(attendanceCorrectionBrowserFixtureId)}
      AND action='attendance.record.saved');
    DELETE FROM public.attendance_corrections
    WHERE tenant_id='11111111-1111-4111-8111-111111111111'::uuid
      AND employee_id='55555555-5555-4555-8555-555555555555'::uuid AND reason IN (${reasons});
    DELETE FROM public.attendance_records
    WHERE id=${sqlLiteral(attendanceCorrectionBrowserFixtureId)}::uuid
      AND tenant_id='11111111-1111-4111-8111-111111111111'::uuid
      AND employee_id='55555555-5555-4555-8555-555555555555'::uuid
      AND attendance_date=${sqlLiteral(attendanceCorrectionBrowserDate)}::date;`);
}

const localCurrentDate = psqlSync("SELECT (now() AT TIME ZONE 'Asia/Dhaka')::date::text;").trim();
const currentAttendanceMonth = `${localCurrentDate.slice(0, 7)}-01`;
const currentAttendanceMonthParts = currentAttendanceMonth.split('-').map(Number);
const attendanceMonthDays = new Date(Date.UTC(currentAttendanceMonthParts[0], currentAttendanceMonthParts[1], 0)).getUTCDate();
const previousAttendanceMonthStart = `${addCalendarDays(currentAttendanceMonth, -1).slice(0, 7)}-01`;
const previousAttendanceMonthDate = `${previousAttendanceMonthStart.slice(0, 7)}-10`;
const nextAttendanceMonthStart = addCalendarDays(currentAttendanceMonth, attendanceMonthDays);
const emptyAttendanceMonth = `${addCalendarDays(previousAttendanceMonthStart, -1).slice(0, 7)}-01`;

function quoteNote(note) {
  return note === null ? 'NULL' : sqlLiteral(note);
}

function resolveLeave(session, id, decision, note = null) {
  return queryAs(session, `SELECT public.admin_resolve_leave_request(${sqlLiteral(id)}::uuid, ${sqlLiteral(decision)}, ${quoteNote(note)})::jsonb`);
}

function resolveAttendance(session, id, decision, note = null) {
  return queryAs(session, `SELECT public.admin_resolve_attendance_correction(${sqlLiteral(id)}::uuid, ${sqlLiteral(decision)}, ${quoteNote(note)})::jsonb`);
}

function saveTimesheet(session, tenantId, id, periodType, startDate, endDate, entries) {
  return queryAs(session, `SELECT jsonb_build_object('id', public.hris_save_my_timesheet(
    ${sqlLiteral(tenantId)}::uuid, ${id ? `${sqlLiteral(id)}::uuid` : 'NULL::uuid'},
    ${sqlLiteral(periodType)}, ${sqlLiteral(startDate)}::date, ${sqlLiteral(endDate)}::date,
    ${sqlLiteral(JSON.stringify(entries))}::jsonb))`);
}

function submitTimesheet(session, tenantId, id) {
  return queryAs(session, `SELECT jsonb_build_object('id', public.hris_submit_my_timesheet(
    ${sqlLiteral(tenantId)}::uuid, ${sqlLiteral(id)}::uuid))`);
}

function resolveProjectTimesheet(session, tenantId, timesheetId, projectId, revision, decision, reason = null) {
  return queryAs(session, `SELECT public.hris_resolve_project_timesheet(
    ${sqlLiteral(tenantId)}::uuid,${sqlLiteral(timesheetId)}::uuid,${sqlLiteral(projectId)}::uuid,
    ${revision},${sqlLiteral(decision)},${quoteNote(reason)})::jsonb`);
}

function resubmitRejectedProjectTimesheet(session, tenantId, timesheetId, projectId, revision, entries) {
  return queryAs(session, `SELECT public.hris_resubmit_rejected_project_timesheet(
    ${sqlLiteral(tenantId)}::uuid,${sqlLiteral(timesheetId)}::uuid,${sqlLiteral(projectId)}::uuid,
    ${revision},${sqlLiteral(JSON.stringify(entries))}::jsonb)::jsonb`);
}

function tableRow(table, id) {
  const allowed = new Set(['leave_requests', 'attendance_records', 'attendance_corrections',
    'employee_shift_assignments', 'service_requests']);
  if (!allowed.has(table)) throw new Error(`Unexpected local fixture table: ${table}`);
  return queryAdmin(`SELECT to_jsonb(t) FROM public.${table} t WHERE id=${sqlLiteral(id)}::uuid`);
}

function balance(leaveType, year) {
  return queryAdmin(`SELECT to_jsonb(b) FROM public.employee_leave_balances b
    WHERE tenant_id='11111111-1111-4111-8111-111111111111'
      AND employee_id='55555555-5555-4555-8555-555555555555'
      AND leave_type_id=${sqlLiteral(leaveType)}::uuid AND balance_year=${year}`);
}

function auditCount(targetId, action) {
  return queryAdmin(`SELECT jsonb_build_object('count',count(*)) FROM public.admin_audit_logs
    WHERE target_id=${sqlLiteral(targetId)} AND action=${sqlLiteral(action)}`).count;
}

const authOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const recoveryEmail = `password-recovery-${randomBytes(8).toString('hex')}@hris.test`;
const adminAuth = createClient(services.API_URL, services.SERVICE_ROLE_KEY, authOptions);
const emails = [
  'manager-a@hris.test', 'manager-b@hris.test', 'no-permission@hris.test',
  'global-only@hris.test', 'tenant-viewer@hris.test',
  'employee-a@hris.test', 'employee-b@hris.test', 'manager-a2@hris.test',
  'employee-clock@hris.test', 'report-viewer-a@hris.test', 'super-admin@hris.test',
  'recruiter-a@hris.test',
  'employee-directory-a@hris.test',
  'learning-manager-a@hris.test',
  recoveryEmail,
  'payroll-viewer-a@hris.test',
  'recruitment-manager-a@hris.test',
  'assessment-candidate-a@hris.test',
  'assessment-candidate-b@hris.test',
  'notices-platform-super-admin@hris.test',
  'notices-unassigned-platform-super-admin@hris.test',
  'notices-global-admin-45@hris.test',
];

// Refuse to touch Auth unless this disposable stack is demonstrably empty.
const existing = await adminAuth.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (existing.error) throw existing.error;
const authRowsBeforeFixture = Number(psqlSync('SELECT count(*) FROM auth.users;').trim());
if (existing.data.users.length !== 0 || authRowsBeforeFixture !== 0) {
  throw new Error('Refusing to test: the isolated Auth service and database must both start with zero users.');
}

// This harness reapplies test migrations directly, so reset a reused local stack by default.
// A newly created stack may skip that service-restarting reset only after proving its
// application schema, Auth users, and private storage are empty.
if (process.env.HRIS_SUPABASE_SKIP_LOCAL_RESET === '1') {
  const applicationTableCount = Number(psqlSync(`SELECT count(*) FROM pg_catalog.pg_tables
    WHERE schemaname='public' AND tablename <> 'schema_migrations';`).trim());
  const authUserCount = Number(psqlSync('SELECT count(*) FROM auth.users;').trim());
  const storageRowCount = Number(psqlSync(`SELECT
    (SELECT count(*) FROM storage.buckets) + (SELECT count(*) FROM storage.objects);`).trim());
  if (applicationTableCount !== 0 || authUserCount !== 0 || storageRowCount !== 0) {
    throw new Error('Refusing to skip reset: the disposable database must have no application tables, Auth users, or storage rows.');
  }
} else {
  cli(['db', 'reset', '--local', '--no-seed', '--yes']);
  if (Number(psqlSync('SELECT count(*) FROM auth.users;').trim()) !== 0) {
    throw new Error('Refusing to test: the isolated Auth database was not empty after its local reset.');
  }
}

const discovery = await fetch(new URL('/auth/v1/.well-known/openid-configuration', services.API_URL));
if (!discovery.ok) throw new Error('Refusing to test: local Auth discovery endpoint is unavailable.');
const issuer = (await discovery.json()).issuer;
if (issuer !== `${apiUrl.origin}/auth/v1`) {
  throw new Error('Refusing to test: Auth issuer does not match the isolated Supabase API URL.');
}

const createdUserIds = [];
const uploadedEvidencePaths = [];
const uploadedExpensePaths = [];
const uploadedReferralPaths = [];
const uploadedLearningEvidencePaths = [];
let createdEvidenceBucket = false;
let createdExpenseBucket = false;
let expenseBucketSafeToClean = false;
let createdReferralBucket = false;
let referralBucketSafeToClean = false;
let createdLearningEvidenceBucket = false;
let learningEvidenceBucketSafeToClean = false;
let createdEmployeeDocumentsBucket = false;
let employeeDocumentsBucketSafeToClean = false;
const employeeDocumentStoragePaths = [];
const candidateTenantGuardStoragePaths = [];
let createdCandidateTenantGuardBucket = false;
let createdAttendanceTenantGuardBucket = false;
const attendanceTenantGuardStoragePaths = [];
let attendanceCorrectionBrowserFixtureId = null;
let attendanceCorrectionBrowserDate = null;
let attendanceCorrectionBrowserReasons = [];
let attendanceCorrectionBrowserRequestIds = [];
let attendanceCorrectionBrowserEvidencePaths = [];
const password = randomBytes(24).toString('base64url');
try {
  for (const email of emails) {
    await createTrackedAuthUser({
      email,
      createUser: () => adminAuth.auth.admin.createUser({ email, password, email_confirm: true }),
      findUserId: async (targetEmail) => psqlSync(
        `SELECT id FROM auth.users WHERE lower(email)=lower(${sqlLiteral(targetEmail)}) LIMIT 1;`,
      ).trim() || null,
      trackUserId: (userId) => {
        if (!createdUserIds.includes(userId)) createdUserIds.push(userId);
      },
    });
  }
  const createdIds = createdUserIds.map(sqlLiteral).join(',');
  const matchedAuthRows = Number(psqlSync(
    `SELECT count(*) FROM auth.users WHERE id IN (${createdIds}) AND email IN (${emails.map(sqlLiteral).join(',')});`,
  ).trim());
  if (matchedAuthRows !== emails.length) {
    throw new Error('Refusing to continue: Auth-created users did not appear in the selected isolated database.');
  }

  async function signIn(email) {
    const client = createClient(services.API_URL, services.ANON_KEY, authOptions);
    const result = await signInTrackedAuthUser({
      signIn: () => client.auth.signInWithPassword({ email, password }),
    });
    return { client, userId: result.user.id, accessToken: result.session.access_token };
  }

const managerA = await signIn(emails[0]);
const managerB = await signIn(emails[1]);
const noPermission = await signIn(emails[2]);
const globalOnly = await signIn(emails[3]);
const tenantViewer = await signIn(emails[4]);
const employeeA = await signIn(emails[5]);
const employeeB = await signIn(emails[6]);
const managerA2 = await signIn(emails[7]);
const employeeClock = await signIn(emails[8]);
const reportViewerA = await signIn(emails[9]);
const superAdmin = await signIn(emails[10]);
const recruiterOnly = await signIn(emails[11]);
const employeesViewer = await signIn(emails[12]);
const learningManagerA = await signIn(emails[13]);
const payrollViewerA = await signIn(emails[15]);
const recruitmentManagerA = await signIn(emails[16]);
const assessmentCandidateA = await signIn(emails[17]);
const assessmentCandidateB = await signIn(emails[18]);
const noticesPlatformSuperAdmin = await signIn(emails[19]);
const noticesUnassignedPlatformSuperAdmin = await signIn(emails[20]);
const noticesGlobalAdmin45 = await signIn(emails[21]);
for (const file of [
  path.join(here, 'fixture.sql'),
  path.join(here, 'recruitment-fixture.sql'),
  path.join(mainRoot, 'supabase/migrations/20261011_02_hris_revoke_anon_helpers.sql'),
  path.join(mainRoot, 'supabase/migrations/20261012091930_hris_tenant_membership_role_permissions.sql'),
  path.join(mainRoot, 'supabase/migrations/20261017074518_hris_employee_attendance_correction_existing_record.sql'),
  path.join(mainRoot, 'supabase/migrations/20261012111928_hris_tenant_shift_roster_read.sql'),
  path.join(mainRoot, 'supabase/migrations/20261012113020_hris_tenant_shift_assignment_manage.sql'),
  path.join(mainRoot, 'supabase/migrations/20261012115907_hris_employee_web_attendance_event.sql'),
  path.join(mainRoot, 'supabase/migrations/20261012183000_hris_attendance_report_team_name.sql'),
  path.join(mainRoot, 'supabase/migrations/20261016003910_attendance_detail_team_name.sql'),
  path.join(mainRoot, 'supabase/migrations/20261014030722_hris_dashboard_team_report.sql'),
  path.join(mainRoot, 'supabase/migrations/20261015120000_hris_dashboard_team_report_date_filter.sql'),
  path.join(mainRoot, 'supabase/migrations/20261012230100_hris_membership_tenant_read_guards.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013023141_hris_performance_appraisal_membership_read.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013073243_hris_tenant_employee_directory.sql'),
  path.join(mainRoot, 'supabase/migrations/20261017092147_employee_directory_team_filter.sql'),
  path.join(mainRoot, 'supabase/migrations/20261014171952_employee_contact_details_editing.sql'),
  path.join(mainRoot, 'supabase/migrations/20261015173616_prevent_direct_employee_row_updates.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013124000_hris_appraisal_narrative_workflow.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013130829_hris_recruitment_pipeline_read.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013132335_hris_recruitment_offer_issue.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013170556_hris_candidate_assessment_journey.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013190200_hris_candidate_preboarding_workflow.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013113718_hris_candidate_context_active_profile_tenant_scope.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013221500_hris_candidate_interview_journey.sql'),
  path.join(mainRoot, 'supabase/migrations/20261014153343_hris_candidate_interview_panel_debrief.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013011651_hris_performance_goal_self_progress_tenant_scope.sql'),
  path.join(mainRoot, 'supabase/migrations/20261012173106_hris_employee_timesheets_tenant_scope.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013203000_hris_travel_request_workflow.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013090000_hris_projects_and_allocations_tenant_scope.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013100000_hris_project_superadmin_and_project_manager_permissions.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013100001_hris_project_tasks_and_peer_reviews.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013153500_hris_learning_employee_self_service.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013095450_hris_learning_manager_decisions.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013174500_hris_learning_program_management.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013184000_hris_peer_review_eligibility_enforcement.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013222433_hris_peer_review_in_app_notifications.sql'),
  path.join(mainRoot, 'supabase/migrations/20261016033936_hris_project_scoped_timesheet_review.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013224251_hris_project_task_edit_workflow.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013225608_hris_project_manager_task_portfolio.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013190000_hris_learning_session_roster.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013190100_learning_session_join_access.sql'),
  path.join(mainRoot, 'supabase/migrations/20261014120100_employee_skill_self_service.sql'),
  path.join(mainRoot, 'supabase/migrations/20261014133000_harden_public_foundation_tables.sql'),
  path.join(mainRoot, 'supabase/migrations/20261014160000_hris_learning_completion_verification.sql'),
  path.join(mainRoot, 'supabase/migrations/20261014160001_hris_learning_completion_evidence_requirement.sql'),
  path.join(mainRoot, 'supabase/migrations/20261014160002_hris_system_notifications_inbox.sql'),
  path.join(mainRoot, 'supabase/migrations/20261015022305_hris_travel_decision_notifications.sql'),
  path.join(mainRoot, 'supabase/migrations/20261015195145_hris_leave_decision_notifications.sql'),
  path.join(mainRoot, 'supabase/migrations/20261016141629_hris_service_request_decision_notifications.sql'),
  path.join(mainRoot, 'supabase/migrations/20261016105659_hris_tenant_leave_date_filter.sql'),
  path.join(mainRoot, 'supabase/migrations/20261016142000_hris_leave_type_policy_management.sql'),
  path.join(mainRoot, 'supabase/migrations/20261015050029_candidate_application_update_notifications.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013143711_hris_expense_claims_employee_tenant_workflow.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013210500_hris_employee_service_request_self_service.sql'),
  path.join(mainRoot, 'supabase/migrations/20261016061104_hris_employee_service_request_review.sql'),
  // The staged tenant-guard contract below replaces the same leave resolver.
  // Apply the newer submission-allocation contract after it so local acceptance
  // verifies the shipped resolver rather than the older staged replacement.
  path.join(mainRoot, 'supabase/staging/approval-resolution/20261012_04_hris_leave_approval_tenant_guard.sql'),
  path.join(mainRoot, 'supabase/staging/approval-resolution/20261012_05_hris_attendance_approval_tenant_and_partial_fields.sql'),
  path.join(mainRoot, 'supabase/migrations/20261016183000_hris_leave_balance_allocation_snapshot.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013175151_employee_referral_workflow.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013221600_hris_organization_holiday_calendar.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013221700_employee_leave_history_private_evidence.sql'),
  path.join(mainRoot, 'supabase/migrations/20261014110000_hris_employee_payslip_history.sql'),
  path.join(mainRoot, 'supabase/migrations/20261014120000_hris_tenant_payroll_register_read.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013215431_employee_dashboard_attendance_period_read.sql'),
  // Reapply WFH last so the compatibility attendance reader above cannot
  // replace its approved-schedule projection in the isolated acceptance DB.
  path.join(mainRoot, 'supabase/migrations/20261110120000_hris_work_from_home_request_parity.sql'),
  path.join(mainRoot, 'supabase/migrations/20261014150000_hris_candidate_initial_application_history.sql'),
  path.join(mainRoot, 'supabase/migrations/20261014012249_recruiter_application_stage_transition.sql'),
  path.join(mainRoot, 'supabase/migrations/20261014070848_hris_candidate_employee_activation.sql'),
  path.join(mainRoot, 'supabase/migrations/20261014100459_gate_candidate_employee_activation_until_policy_approval.sql'),
  // Apply the newest Candidate stage-history contract after older notification
  // migrations that recreate its check constraint.
  path.join(mainRoot, 'supabase/migrations/20261016081154_hris_candidate_interview_completion.sql'),
  path.join(mainRoot, 'supabase/migrations/20261016092922_candidate_context_authenticated_execute.sql'),
  path.join(mainRoot, 'supabase/migrations/20261016170000_hris_candidate_employee_activation_policy.sql'),
  path.join(mainRoot, 'supabase/migrations/20261016171104_employee_family_tenant_scoped_read.sql'),
  path.join(mainRoot, 'supabase/migrations/20261016221620_employee_personal_leave_calendar.sql'),
  path.join(mainRoot, 'supabase/migrations/20261016223226_employee_documents_tenant_read.sql'),
  path.join(mainRoot, 'supabase/migrations/20261016230201_hris_employee_roster_notifications.sql'),
  path.join(mainRoot, 'supabase/migrations/20261017095321_roster_shift_change_history.sql'),
  path.join(mainRoot, 'supabase/migrations/20261016233237_employee_dashboard_official_phone.sql'),
  path.join(mainRoot, 'supabase/migrations/20261017010000_hris_employee_document_self_service.sql'),
  path.join(mainRoot, 'supabase/migrations/20261017020000_hris_employee_identity_card.sql'),
  path.join(mainRoot, 'supabase/migrations/20261017030000_hris_employee_announcement_audience.sql'),
  path.join(mainRoot, 'supabase/migrations/20261017040000_hris_employee_dashboard_work_identity.sql'),
  path.join(mainRoot, 'supabase/migrations/20261017050000_hris_employee_dashboard_team_identity.sql'),
  path.join(mainRoot, 'supabase/migrations/20261017060000_hris_employee_dashboard_pending_requests.sql'),
  path.join(mainRoot, 'supabase/migrations/20261017060001_hris_employee_unavailable_leave_type_reason.sql'),
  path.join(mainRoot, 'supabase/migrations/20261016141000_employee_profile_change_requests.sql'),
  path.join(mainRoot, 'supabase/migrations/20261017100000_employee_profile_change_request_tenant_scope.sql'),
  path.join(mainRoot, 'supabase/migrations/20261017130000_employee_profile_change_schema_contract.sql'),
  // Hosted parity rollback expects this historical production base table to exist
  // in the isolated schema as well as production before Phase 03/04 guards install.
  path.join(mainRoot, 'supabase/migrations/20261019070000_hris_restore_expense_travel_links_source_parity.sql'),
  path.join(mainRoot, 'supabase/migrations/20261020121500_hris_candidate_activation_employee_id.sql'),
  path.join(here, 'overgrant-leave-types-for-hosted-parity.sql'),
  path.join(mainRoot, 'supabase/migrations/20261021084635_leave_types_authenticated_read_only_acl.sql'),
  path.join(mainRoot, 'supabase/migrations/20261023130800_hris_private_storage_tenant_read_guard.sql'),
  path.join(mainRoot, 'supabase/migrations/20261027040642_employee_profile_tenant_scoped_contract.sql'),
  path.join(mainRoot, 'supabase/migrations/20261030114500_employee_profile_certificate_policy_guards.sql'),
  // Apply the newly tracked E06/E11 contract after all historical schema and RPC fixtures.
  path.join(mainRoot, 'supabase/migrations/20261110193754_hris_attendance_correction_movement_parity.sql'),
  // Prove the tenant-aware private-storage guard also repairs the hosted drift after E06.
  path.join(mainRoot, 'supabase/migrations/20261111031236_hris_restore_private_storage_tenant_read_guard.sql'),
]) {
  const noticesPolicyMigration = file.endsWith(
    '20261017030000_hris_employee_announcement_audience.sql',
  );
  const identityAuditSnapshotBefore = noticesPolicyMigration ? psqlSync(`
    SELECT jsonb_build_object(
      'admins', (SELECT jsonb_build_object(
        'count', count(*),
        'fingerprint', md5(coalesce(string_agg(to_jsonb(a)::text, '|' ORDER BY user_id), ''))
      ) FROM public.admin_users a),
      'audit', (SELECT jsonb_build_object(
        'count', count(*),
        'fingerprint', md5(coalesce(string_agg(to_jsonb(l)::text, '|' ORDER BY id), ''))
      ) FROM public.admin_audit_logs l)
    )::text;`).trim() : null;
  applySql(file);
  if (noticesPolicyMigration) {
    const identityAuditSnapshotAfter = psqlSync(`
      SELECT jsonb_build_object(
        'admins', (SELECT jsonb_build_object(
          'count', count(*),
          'fingerprint', md5(coalesce(string_agg(to_jsonb(a)::text, '|' ORDER BY user_id), ''))
        ) FROM public.admin_users a),
        'audit', (SELECT jsonb_build_object(
          'count', count(*),
          'fingerprint', md5(coalesce(string_agg(to_jsonb(l)::text, '|' ORDER BY id), ''))
        ) FROM public.admin_audit_logs l)
      )::text;`).trim();
    if (identityAuditSnapshotBefore !== identityAuditSnapshotAfter) {
      throw new Error('The notices policy transition changed administrator rows or audit history.');
    }
  }
}
// Reapply the current contact RPC source after later authorization and employee
// table migrations have run. This compatibility check stays in the disposable
// database and does not replay or change hosted SQL.
const contactRpcSource = path.join(mainRoot, 'supabase/migrations/20261014171952_employee_contact_details_editing.sql');
applySql(contactRpcSource);
const contactRpcSourceCompatibility = JSON.parse(psqlSync(`SELECT jsonb_build_object(
  'read_signature',to_regprocedure('public.hris_get_tenant_employee_contact_details(uuid,uuid)') IS NOT NULL,
  'update_signature',to_regprocedure('public.hris_update_tenant_employee_contact_details(uuid,uuid,jsonb)') IS NOT NULL,
  'read_security_definer',(SELECT prosecdef FROM pg_proc WHERE oid=to_regprocedure('public.hris_get_tenant_employee_contact_details(uuid,uuid)')),
  'update_security_definer',(SELECT prosecdef FROM pg_proc WHERE oid=to_regprocedure('public.hris_update_tenant_employee_contact_details(uuid,uuid,jsonb)')),
  'read_empty_search_path',(SELECT proconfig @> ARRAY['search_path=""'] FROM pg_proc WHERE oid=to_regprocedure('public.hris_get_tenant_employee_contact_details(uuid,uuid)')),
  'update_empty_search_path',(SELECT proconfig @> ARRAY['search_path=""'] FROM pg_proc WHERE oid=to_regprocedure('public.hris_update_tenant_employee_contact_details(uuid,uuid,jsonb)')),
  'authenticated_execute',has_function_privilege('authenticated','public.hris_get_tenant_employee_contact_details(uuid,uuid)','EXECUTE')
    AND has_function_privilege('authenticated','public.hris_update_tenant_employee_contact_detai…159467 tokens truncated…ossTenantUpdate.error?.code,
    directInsert: holidayDirectInsert.error?.code }));

const employeeHolidaySummary = await employeeA.client.rpc('hris_get_my_dashboard_data', { p_tenant_id: ids.tenantA });
const employeeForeignHolidaySummary = await employeeA.client.rpc('hris_get_my_dashboard_data', { p_tenant_id: ids.tenantB });
record('E01-05 employee upcoming holidays include the managed active entry and remain tenant-bound',
  !employeeHolidaySummary.error
    && employeeHolidaySummary.data?.holidays?.some(holiday => holiday.name === 'Isolated Calendar Acceptance Day')
    && !employeeHolidaySummary.data?.holidays?.some(holiday => holiday.name === 'Synthetic QA holiday B')
    && Boolean(employeeForeignHolidaySummary.error?.code === '42501'),
  JSON.stringify({ ownHoliday: employeeHolidaySummary.data?.holidays?.some(holiday => holiday.name === 'Isolated Calendar Acceptance Day'),
    foreignHoliday: employeeHolidaySummary.data?.holidays?.some(holiday => holiday.name === 'Synthetic QA holiday B'),
    crossTenant: employeeForeignHolidaySummary.error?.code }));

let holidayBrowserOutput = '';
let holidayBrowserError = '';
try {
  holidayBrowserOutput = execFileSync('node', [path.join(here, 'run-holiday-calendar-browser.mjs')], {
    cwd: mainRoot,
    env: {
      ...process.env,
      HRIS_LOCAL_SUPABASE_URL: services.API_URL,
      HRIS_LOCAL_SUPABASE_ANON_KEY: services.ANON_KEY,
      HRIS_LOCAL_TEST_PASSWORD: password,
      HRIS_LOCAL_HOLIDAY_MANAGER_EMAIL: emails[0],
      HRIS_LOCAL_HOLIDAY_EMPLOYEE_EMAIL: emails[5],
      HRIS_LOCAL_HOLIDAY_TENANT_ID: ids.tenantA,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
} catch (error) {
  holidayBrowserError = String(error.stderr || error.message || 'local holiday browser run failed').slice(-1800);
}
record('Real local Auth-to-Postgres holiday calendar journey passes validation, cancellation, retry, persistence, and responsive recovery',
  holidayBrowserOutput.includes('Local Auth/Postgres holiday calendar journey passed: outage retry, cancel, manager create/edit/deactivate/activate, EN/BN mobile/desktop, persisted employee upcoming-holiday visibility, tenant isolation, and refresh.'),
  holidayBrowserError);

const globalOnlyRole = queryAdmin(`SELECT jsonb_build_object('global_role',EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role_id=ur.role_id
    WHERE ur.user_id='${globalOnly.userId}'::uuid AND rp.permission_id='leave.manage'))`);
const globalOnlyAuth = queryAs(globalOnly, `SELECT jsonb_build_object(
  'legacy_permission',public.has_permission('leave.manage'),
  'tenant_a',public.has_tenant_permission('${ids.tenantA}'::uuid,'leave.manage'),
  'tenant_b',public.has_tenant_permission('${ids.tenantB}'::uuid,'leave.manage'))`);
const globalOnlyLeaves = queryAs(globalOnly, `SELECT coalesce(jsonb_agg(tenant_id ORDER BY tenant_id),'[]'::jsonb)
  FROM (SELECT DISTINCT tenant_id FROM public.leave_requests) visible`);
record('Global admin role alone grants no tenant authorization or visibility',
  globalOnlyRole.global_role === true && globalOnlyAuth.legacy_permission === false
  && globalOnlyAuth.tenant_a === false
  && globalOnlyAuth.tenant_b === false && globalOnlyLeaves.length === 0);

const globalOnlyDecision = attemptAs(globalOnly, `SELECT public.admin_resolve_leave_request(
  '${ids.leaveMissingLedger}'::uuid,'approved',NULL)::jsonb`);
record('Global admin role alone cannot resolve a tenant leave request', !globalOnlyDecision.ok
  && tableRow('leave_requests', ids.leaveMissingLedger).status === 'pending');

psqlSync(`UPDATE public.tenant_memberships SET status='inactive'
  WHERE tenant_id='${ids.tenantB}'::uuid AND user_id='${managerB.userId}'::uuid;`);
const afterMembershipRevocation = queryAs(managerB, `SELECT jsonb_build_object(
  'manage',public.has_tenant_permission('${ids.tenantB}'::uuid,'leave.manage'),
  'visible',coalesce((SELECT jsonb_agg(tenant_id) FROM (SELECT DISTINCT tenant_id
    FROM public.leave_requests) visible),'[]'::jsonb))`);
record('Inactive membership immediately removes tenant permissions and rows',
  afterMembershipRevocation.manage === false
  && new Set(afterMembershipRevocation.visible).size === 0);

const noPermissionCall = attemptAs(noPermission, `SELECT public.admin_resolve_leave_request(
  '${ids.leaveMissingLedger}'::uuid,'approved',NULL)::jsonb`);
record('Authenticated user without an active HR permission is denied', !noPermissionCall.ok,
  noPermissionCall.ok ? 'unexpectedly accepted' : 'denied');

const noAttendancePermission = attemptAs(noPermission, `SELECT public.admin_resolve_attendance_correction(
  '${ids.attendanceUnauthorized}'::uuid,'approved',NULL)::jsonb`);
record('Authenticated user without attendance management is denied', !noAttendancePermission.ok
  && tableRow('attendance_corrections', ids.attendanceUnauthorized).status === 'pending');

const anonymousCall = attemptAs(null, `SELECT public.admin_resolve_leave_request(
  '${ids.leaveMissingLedger}'::uuid,'approved',NULL)::jsonb`, 'anon');
record('Anonymous database role cannot execute the privileged leave RPC', !anonymousCall.ok,
  anonymousCall.ok ? 'unexpectedly accepted' : 'denied');
const anonymousAttendance = attemptAs(null, `SELECT public.admin_resolve_attendance_correction(
  '${ids.attendanceUnauthorized}'::uuid,'approved',NULL)::jsonb`, 'anon');
record('Anonymous database role cannot execute the privileged attendance RPC', !anonymousAttendance.ok
  && tableRow('attendance_corrections', ids.attendanceUnauthorized).status === 'pending');

const revoked = await adminAuth.auth.admin.signOut(managerA.accessToken, 'global');
if (revoked.error) throw revoked.error;
const revokedCall = attemptAs(managerA, `SELECT public.admin_resolve_leave_request(
  '${ids.leaveMissingLedger}'::uuid,'approved',NULL)::jsonb`);
const revokedAttendanceCall = attemptAs(managerA, `SELECT public.admin_resolve_attendance_correction(
  '${ids.attendanceRevoked}'::uuid,'approved',NULL)::jsonb`);
const afterRevocation = tableRow('leave_requests', ids.leaveMissingLedger);
record('Revoked Auth session cannot use previously issued leave or attendance tokens',
  !revokedCall.ok && afterRevocation.status === 'pending' && !revokedAttendanceCall.ok
  && tableRow('attendance_corrections', ids.attendanceRevoked).status === 'pending',
  revokedCall.ok || revokedAttendanceCall.ok ? 'unexpectedly accepted' : 'denied');

const hr0106ProfileAuditFields = [
  'full_name', 'official_email', 'personal_email', 'official_phone', 'address', 'mailing_address',
  'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relation',
];
const managerAForProfileAudit = await signIn(emails[0]);
const hr0106ProfileBaseline = await adminAuth.from('employees')
  .select(hr0106ProfileAuditFields.join(','))
  .eq('id', '55555555-5555-4555-8555-555555555555').single();
const hr0106ProfileAuditResults = [];
if (!hr0106ProfileBaseline.error) {
  try {
    for (const field of hr0106ProfileAuditFields) {
      const suffix = randomUUID();
      const value = field.endsWith('email')
        ? `hr0106-${suffix}@example.test`
        : field.endsWith('phone')
          ? `+880${Date.now().toString().slice(-10)}`
        : `HR01-06 synthetic ${field} ${suffix}`;
      const submitted = await employeeA.client.rpc('employee_submit_profile_change_request', {
        p_tenant_id: ids.tenantA,
        p_field_key: field,
        p_requested_value: value,
        p_reason: 'Synthetic HR01-06 field-level audit acceptance.',
      });
      if (submitted.error || typeof submitted.data !== 'string') {
        hr0106ProfileAuditResults.push({ field, submitted: submitted.error?.code || 'missing_id', passed: false });
        continue;
      }
      const reviewed = await managerAForProfileAudit.client.rpc('admin_review_profile_change_request', {
        p_tenant_id: ids.tenantA,
        p_id: submitted.data,
        p_decision: 'approved',
        p_note: 'Synthetic field-level audit verification.',
      });
      const persisted = await adminAuth.from('employees').select(field)
        .eq('id', '55555555-5555-4555-8555-555555555555').single();
      const audit = queryAdmin(`SELECT jsonb_build_object(
          'count', count(*)::integer,
          'actor_matches', bool_and(actor_id=${sqlLiteral(managerAForProfileAudit.userId)}::uuid),
          'details', max(details::text)
        ) FROM public.admin_audit_logs
        WHERE target_id=${sqlLiteral(submitted.data)}
          AND action='self_service.profile_change.approved'`);
      const detailsText = String(audit.details || '');
      let details = {};
      try { details = JSON.parse(detailsText); } catch { /* invalid audit JSON fails below */ }
      hr0106ProfileAuditResults.push({
        field,
        submitted: 'ok',
        reviewed: reviewed.data?.status || reviewed.error?.code || 'missing_status',
        persisted: !persisted.error && persisted.data?.[field] === value,
        auditCount: audit.count,
        fieldKey: details.field_key,
        redacted: !Object.hasOwn(details, 'requested_value') && !detailsText.includes(value),
        actorMatches: audit.actor_matches,
        passed: !reviewed.error && reviewed.data?.status === 'approved'
          && !persisted.error && persisted.data?.[field] === value
          && audit.count === 1 && audit.actor_matches === true
          && details.field_key === field
          && !Object.hasOwn(details, 'requested_value') && !detailsText.includes(value),
      });
    }
  } finally {
    const restoreAssignments = hr0106ProfileAuditFields.map((field) => {
      const originalValue = hr0106ProfileBaseline.data[field];
      return `${field}=${originalValue === null ? 'NULL' : sqlLiteral(originalValue)}`;
    }).join(', ');
    psqlSync(`UPDATE public.employees SET ${restoreAssignments}
      WHERE id='55555555-5555-4555-8555-555555555555'::uuid
        AND tenant_id='${ids.tenantA}'::uuid;`);
  }
}
record('HR01-06 partial: all nine supported protected profile fields persist with field-only audit events',
  !hr0106ProfileBaseline.error
    && hr0106ProfileAuditResults.length === hr0106ProfileAuditFields.length
    && hr0106ProfileAuditResults.every(result => result.passed),
  JSON.stringify({
    baselineRead: !hr0106ProfileBaseline.error,
    testedFieldCount: hr0106ProfileAuditResults.length,
    passedFieldCount: hr0106ProfileAuditResults.filter(result => result.passed).length,
    fields: hr0106ProfileAuditResults.map(({ field, passed }) => ({ field, passed })),
  }));

async function attemptEmployeeDuplicateProbe(row) {
  const inserted = await adminAuth.from('employees').insert(row);
  if (inserted.error) return { errorCode: inserted.error.code || 'unknown', cleanupPassed: true };
  const removed = await adminAuth.from('employees').delete()
    .eq('tenant_id', row.tenant_id).eq('id', row.id).select('id');
  return { errorCode: null, cleanupPassed: !removed.error && removed.data?.length === 1 };
}

const duplicateEmployeeNumberProbe = await attemptEmployeeDuplicateProbe({
  id: randomUUID(), tenant_id: ids.tenantA, employee_number: 'QA-A-001',
  full_name: 'HR01-08 synthetic duplicate number probe',
  official_email: `hr01-08-number-${randomUUID()}@example.test`, joining_date: '2026-01-01',
});
const duplicateOfficialEmailProbe = await attemptEmployeeDuplicateProbe({
  id: randomUUID(), tenant_id: ids.tenantA, employee_number: `HR01-08-${randomUUID()}`,
  full_name: 'HR01-08 synthetic duplicate email probe',
  official_email: 'employee-a@hris.test', joining_date: '2026-01-01',
});
const sameEmailOtherTenantProbe = await attemptEmployeeDuplicateProbe({
  id: randomUUID(), tenant_id: ids.tenantB, employee_number: `HR01-08-${randomUUID()}`,
  full_name: 'HR01-08 synthetic isolated tenant control',
  official_email: 'employee-a@hris.test', joining_date: '2026-01-01',
});
record('HR01-08 partial: tenant employee-number and email duplicates are rejected without cross-tenant collision',
  duplicateEmployeeNumberProbe.errorCode === '23505'
    && duplicateOfficialEmailProbe.errorCode === '23505'
    && duplicateEmployeeNumberProbe.cleanupPassed
    && duplicateOfficialEmailProbe.cleanupPassed
    && sameEmailOtherTenantProbe.errorCode === null
    && sameEmailOtherTenantProbe.cleanupPassed,
  JSON.stringify({ employeeNumberDuplicate: duplicateEmployeeNumberProbe,
    sameTenantEmailDuplicate: duplicateOfficialEmailProbe,
    sameEmailInOtherTenant: sameEmailOtherTenantProbe }));

record('HR01-02/06 contact RPC source migration reapplies after current authorization schema with the expected signatures, ACL, and search path',
  contactRpcSourceCompatibility.read_signature
    && contactRpcSourceCompatibility.update_signature
    && contactRpcSourceCompatibility.read_security_definer
    && contactRpcSourceCompatibility.update_security_definer
    && contactRpcSourceCompatibility.read_empty_search_path
    && contactRpcSourceCompatibility.update_empty_search_path
    && contactRpcSourceCompatibility.authenticated_execute
    && contactRpcSourceCompatibility.anon_denied
    && contactRpcSourceCompatibility.service_role_denied,
  JSON.stringify(contactRpcSourceCompatibility));

// HR01-01 has one partial live path: HR can create an employee by activating
// a fully verified accepted-offer candidate. General manual HR creation stays
// outside this approved implementation.
const hr0101JobId = 'ab010001-0000-4000-8000-000000000001';
const hr0101ApplicationId = 'ab010001-0000-4000-8000-000000000002';
const hr0101HandoffId = 'ab010001-0000-4000-8000-000000000003';
const hr0101OfferId = 'ab010001-0000-4000-8000-000000000004';
const hr0101EmployeeNumber = 'HR01-01-E001';
// The suite intentionally revokes managerA's earlier token in its session
// revocation checks. Sign in again here so the HR activation test uses a live
// Auth session rather than the deliberately revoked token.
const hr0101Manager = await signIn(emails[0]);
psqlSync(`INSERT INTO public.jobs(id,tenant_id,reference_number,title,status,is_published,is_active)
  VALUES('${hr0101JobId}'::uuid,'${ids.tenantA}'::uuid,'HR01-01-QA','HR01-01 synthetic role','open',true,true);
INSERT INTO public.job_applications(id,tenant_id,job_id,candidate_user_id,full_name,email,stage)
  VALUES('${hr0101ApplicationId}'::uuid,'${ids.tenantA}'::uuid,'${hr0101JobId}'::uuid,
    '${assessmentCandidateA.userId}'::uuid,'HR01-01 Synthetic Candidate','assessment-candidate-a@hris.test','offer_accepted');
INSERT INTO public.job_offers(id,application_id,offered_title,status,proposed_joining_date,responded_at)
  VALUES('${hr0101OfferId}'::uuid,'${hr0101ApplicationId}'::uuid,'HR01-01 synthetic role','accepted','2020-01-01',now());
INSERT INTO public.onboarding_handoffs(
  id,application_id,status,candidate_personal_data,candidate_completed_steps,candidate_submitted_at
) VALUES('${hr0101HandoffId}'::uuid,'${hr0101ApplicationId}'::uuid,'submitted_for_verification','{}'::jsonb,
  ARRAY['step_identity','step_emergency','step_payroll','step_policies']::text[],now());`);
const hr0101ManagerPermission = await hr0101Manager.client.rpc('has_tenant_permission', {
  p_tenant_id: ids.tenantA, p_permission_id: 'employees.manage',
});
const hr0101NoPermission = await noPermission.client.rpc('hris_activate_candidate_employee', {
  p_tenant_id: ids.tenantA, p_application_id: hr0101ApplicationId,
  p_employee_number: `${hr0101EmployeeNumber}-DENY`, p_joining_date: '2020-01-01', p_details_verified: true,
});
const hr0101CrossTenant = await managerB.client.rpc('hris_activate_candidate_employee', {
  p_tenant_id: ids.tenantA, p_application_id: hr0101ApplicationId,
  p_employee_number: `${hr0101EmployeeNumber}-CROSS`, p_joining_date: '2020-01-01', p_details_verified: true,
});
const hr0101Unverified = await hr0101Manager.client.rpc('hris_activate_candidate_employee', {
  p_tenant_id: ids.tenantA, p_application_id: hr0101ApplicationId,
  p_employee_number: `${hr0101EmployeeNumber}-UNVERIFIED`, p_joining_date: '2020-01-01', p_details_verified: false,
});
const hr0101FutureDate = await hr0101Manager.client.rpc('hris_activate_candidate_employee', {
  p_tenant_id: ids.tenantA, p_application_id: hr0101ApplicationId,
  p_employee_number: `${hr0101EmployeeNumber}-FUTURE`, p_joining_date: '2099-01-01', p_details_verified: true,
});
record('HR01-01 activation denies users without employees.manage, cross-tenant HR, unverified details, and future joining dates',
  hr0101ManagerPermission.data === true
    && hr0101NoPermission.error?.code === '42501'
    && hr0101CrossTenant.error?.code === '42501'
    && hr0101Unverified.error?.code === '22023'
    && hr0101FutureDate.error?.code === '55000',
  JSON.stringify({ managerHasPermission: hr0101ManagerPermission.data,
    managerPermissionError: hr0101ManagerPermission.error?.message,
    noPermission: { code: hr0101NoPermission.error?.code, message: hr0101NoPermission.error?.message },
    crossTenant: { code: hr0101CrossTenant.error?.code, message: hr0101CrossTenant.error?.message },
    unverified: { code: hr0101Unverified.error?.code, message: hr0101Unverified.error?.message },
    futureDate: { code: hr0101FutureDate.error?.code, message: hr0101FutureDate.error?.message } }));

let hr0101BrowserOutput = '';
let hr0101BrowserError = '';
try {
  hr0101BrowserOutput = execFileSync('node', [path.join(here, 'run-hr01-01-employee-creation-browser.mjs')], {
    cwd: mainRoot,
    env: {
      ...process.env,
      HRIS_LOCAL_SUPABASE_URL: services.API_URL,
      HRIS_LOCAL_SUPABASE_ANON_KEY: services.ANON_KEY,
      HRIS_LOCAL_TEST_PASSWORD: password,
      HRIS_LOCAL_HR01_EMPLOYEE_MANAGER_EMAIL: emails[0],
      HRIS_LOCAL_HR01_EMPLOYEE_TENANT_ID: ids.tenantA,
      HRIS_LOCAL_HR01_APPLICATION_ID: hr0101ApplicationId,
      HRIS_LOCAL_HR01_CANDIDATE_NAME: 'HR01-01 Synthetic Candidate',
      HRIS_LOCAL_HR01_EMPLOYEE_NUMBER: hr0101EmployeeNumber,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
} catch (error) {
  hr0101BrowserError = String(error.stderr || error.message || 'local HR01-01 employee-creation browser run failed').slice(-1400);
}
const hr0101Employee = queryAdmin(`SELECT COALESCE((SELECT to_jsonb(e) FROM public.employees e
  WHERE e.tenant_id=${sqlLiteral(ids.tenantA)}::uuid AND e.user_id=${sqlLiteral(assessmentCandidateA.userId)}::uuid
    AND e.employee_number=${sqlLiteral(hr0101EmployeeNumber)} LIMIT 1),'{}'::jsonb);`);
const hr0101Handoff = queryAdmin(`SELECT COALESCE((SELECT to_jsonb(h) FROM public.onboarding_handoffs h
  WHERE h.id=${sqlLiteral(hr0101HandoffId)}::uuid),'{}'::jsonb);`);
const hr0101Application = queryAdmin(`SELECT COALESCE((SELECT to_jsonb(a) FROM public.job_applications a
  WHERE a.id=${sqlLiteral(hr0101ApplicationId)}::uuid),'{}'::jsonb);`);
const hr0101Audit = queryAdmin(`SELECT jsonb_build_object('count',count(*)::integer,'details',min(details::text))
  FROM public.admin_audit_logs WHERE action='candidate.employee.activated'
    AND target_id=(SELECT e.id::text FROM public.employees e WHERE e.employee_number=${sqlLiteral(hr0101EmployeeNumber)}
      AND e.tenant_id=${sqlLiteral(ids.tenantA)}::uuid);`);
const hr0101Retry = await hr0101Manager.client.rpc('hris_activate_candidate_employee', {
  p_tenant_id: ids.tenantA, p_application_id: hr0101ApplicationId,
  p_employee_number: hr0101EmployeeNumber, p_joining_date: '2020-01-01', p_details_verified: true,
});
const hr0101EmployeeRoleMembership = queryAdmin(`SELECT jsonb_build_object('count',count(*)::integer,
    'role',min(role),'status',min(status)) FROM public.tenant_memberships
  WHERE tenant_id=${sqlLiteral(ids.tenantA)}::uuid AND user_id=${sqlLiteral(assessmentCandidateA.userId)}::uuid
    AND role='qa_hris_employee_role';`);
record('HR01-01 partial: the HR workspace activates a verified candidate into a tenant employee record with safe retry',
  hr0101BrowserOutput.includes('HR01-01_PARTIAL_CANDIDATE_ACTIVATION_BROWSER_PASS')
    && Boolean(hr0101Employee?.id)
    && hr0101Employee?.user_id === assessmentCandidateA.userId
    && hr0101Employee?.employee_number === hr0101EmployeeNumber
    && hr0101Employee?.full_name === 'HR01-01 Synthetic Candidate'
    && hr0101Employee?.employment_status === 'active'
    && hr0101Application?.stage === 'hired'
    && hr0101Handoff?.status === 'completed'
    && Boolean(hr0101Handoff?.verified_at)
    && hr0101Handoff?.verified_by === managerA.userId
    && hr0101Audit.count === 1
    && String(hr0101Audit.details).includes('"joining_date": "2020-01-01"')
    && hr0101EmployeeRoleMembership.count === 1
    && hr0101EmployeeRoleMembership.role === 'qa_hris_employee_role'
    && hr0101EmployeeRoleMembership.status === 'active'
    && !hr0101Retry.error
    && hr0101Retry.data?.success === true
    && hr0101Retry.data?.idempotent === true
    && hr0101Retry.data?.employee_id === hr0101Employee.id,
  JSON.stringify({ employee: hr0101Employee, applicationStage: hr0101Application?.stage,
    handoffStatus: hr0101Handoff?.status, auditCount: hr0101Audit.count,
    membership: hr0101EmployeeRoleMembership, retry: hr0101Retry.data,
    browserMarker: hr0101BrowserOutput.includes('HR01-01_PARTIAL_CANDIDATE_ACTIVATION_BROWSER_PASS'),
    browserError: hr0101BrowserError }));

const x0307BrowserPass = hr0101BrowserOutput.includes('X03-07_PARTIAL_HR_ONBOARDING_ACTIVATION_BROWSER_PASS');
record('X03-07 partial: HR activates the accepted-offer candidate as an active employee through the existing onboarding handoff',
  x0307BrowserPass
    && Boolean(hr0101Employee?.id)
    && hr0101Employee?.user_id === hr0101Application?.candidate_user_id
    && hr0101Employee?.employment_status === 'active'
    && hr0101Application?.stage === 'hired'
    && hr0101Handoff?.status === 'completed'
    && hr0101Retry.data?.idempotent === true
    && hr0101Retry.data?.employee_id === hr0101Employee.id,
  JSON.stringify({ employeeId: hr0101Employee?.id,
    employeeUserId: hr0101Employee?.user_id,
    applicationCandidateUserId: hr0101Application?.candidate_user_id,
    employeeStatus: hr0101Employee?.employment_status,
    applicationStage: hr0101Application?.stage,
    handoffStatus: hr0101Handoff?.status,
    retry: hr0101Retry.data,
    browserMarker: x0307BrowserPass }));

const x0308BrowserPass = hr0101BrowserOutput.includes('X03-08_PARTIAL_CANDIDATE_DATA_REUSE_BROWSER_PASS');
record('X03-08 partial: HR activation reuses the candidate name, email, and Auth identity in the employee record',
  x0308BrowserPass
    && hr0101Employee?.full_name === hr0101Application?.full_name
    && hr0101Employee?.official_email === hr0101Application?.email
    && hr0101Employee?.user_id === hr0101Application?.candidate_user_id,
  JSON.stringify({ employeeName: hr0101Employee?.full_name,
    candidateName: hr0101Application?.full_name,
    employeeOfficialEmail: hr0101Employee?.official_email,
    candidateEmail: hr0101Application?.email,
    employeeUserId: hr0101Employee?.user_id,
    candidateUserId: hr0101Application?.candidate_user_id,
    browserMarker: x0308BrowserPass }));

const failed = results.filter((result) => !result.ok);
console.log(`\nLocal Auth/RLS acceptance: ${results.length - failed.length}/${results.length} passed; ${failed.length} failed.`);
console.log('Tenant-isolation failures are release blockers; this test uses only a disposable local database.');
if (failed.length) process.exitCode = 1;
} catch (error) {
  console.error('Local Auth/RLS acceptance failed before cleanup:', error instanceof Error ? error.stack || error.message : String(error));
  throw error;
} finally {
  if (uploadedEvidencePaths.length) {
    const removed = await adminAuth.storage.from('leave-evidence').remove(uploadedEvidencePaths);
    if (removed.error) throw removed.error;
  }
  if (createdEvidenceBucket) {
    // Only this runner's newly-created disposable bucket may be emptied here.
    // Browser acceptance can upload additional nested evidence outside the tracked
    // paths, which otherwise leaves the bucket nonempty and masks test failures.
    const emptiedBucket = await adminAuth.storage.emptyBucket('leave-evidence');
    if (emptiedBucket.error) throw emptiedBucket.error;
    const deletedBucket = await adminAuth.storage.deleteBucket('leave-evidence');
    if (deletedBucket.error) throw new Error(`Disposable leave-evidence bucket cleanup failed: ${deletedBucket.error.message}`);
  }
  const expenseStorage = adminAuth.storage.from('expense-receipts');
  if (expenseBucketSafeToClean) {
    const expensePaths = new Set(uploadedExpensePaths);
    async function collectExpenseObjects(prefix = '') {
      const listed = await expenseStorage.list(prefix, { limit: 100 });
      if (listed.error) throw listed.error;
      for (const item of listed.data || []) {
        const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id) expensePaths.add(itemPath);
        else await collectExpenseObjects(itemPath);
      }
    }
    await collectExpenseObjects();
    if (expensePaths.size) {
      const removed = await expenseStorage.remove([...expensePaths]);
      if (removed.error) throw removed.error;
    }
  }
  if (createdExpenseBucket) {
    const deletedBucket = await adminAuth.storage.deleteBucket('expense-receipts');
    if (deletedBucket.error) throw new Error(`Disposable expense-receipts bucket cleanup failed: ${deletedBucket.error.message}`);
  }
  const referralStorage = adminAuth.storage.from('employee-referral-files');
  if (referralBucketSafeToClean) {
    const referralPaths = new Set(uploadedReferralPaths);
    async function collectReferralObjects(prefix = '') {
      const listed = await referralStorage.list(prefix, { limit: 100 });
      if (listed.error) throw listed.error;
      for (const item of listed.data || []) {
        const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id) referralPaths.add(itemPath);
        else await collectReferralObjects(itemPath);
      }
    }
    await collectReferralObjects();
    if (referralPaths.size) {
      const removed = await referralStorage.remove([...referralPaths]);
      if (removed.error) throw removed.error;
    }
  }
  if (createdReferralBucket) {
    const deletedBucket = await adminAuth.storage.deleteBucket('employee-referral-files');
    if (deletedBucket.error) throw new Error(`Disposable employee-referral-files bucket cleanup failed: ${deletedBucket.error.message}`);
  }
  const learningEvidenceStorage = adminAuth.storage.from('learning-completion-evidence');
  if (learningEvidenceBucketSafeToClean) {
    const learningEvidencePaths = new Set(uploadedLearningEvidencePaths);
    async function collectLearningEvidenceObjects(prefix = '') {
      let offset = 0;
      while (true) {
        const listed = await learningEvidenceStorage.list(prefix, { limit: 100, offset });
        if (listed.error) throw listed.error;
        const items = listed.data || [];
        for (const item of items) {
          const objectPath = prefix ? `${prefix}/${item.name}` : item.name;
          if (item.id) learningEvidencePaths.add(objectPath);
          else await collectLearningEvidenceObjects(objectPath);
        }
        if (items.length < 100) break;
        offset += items.length;
      }
    }
    await collectLearningEvidenceObjects();
    if (learningEvidencePaths.size) {
      const removed = await learningEvidenceStorage.remove([...learningEvidencePaths]);
      if (removed.error) throw removed.error;
    }
  }
  if (createdLearningEvidenceBucket) {
    const deletedBucket = await adminAuth.storage.deleteBucket('learning-completion-evidence');
    if (deletedBucket.error) throw new Error(`Disposable learning-completion-evidence bucket cleanup failed: ${deletedBucket.error.message}`);
  }
  if (attendanceCorrectionBrowserEvidencePaths.length) {
    const correctionEvidenceStorage = adminAuth.storage.from('attendance-evidence');
    const removed = await correctionEvidenceStorage.remove(attendanceCorrectionBrowserEvidencePaths);
    if (removed.error) throw removed.error;
  }
  if (attendanceTenantGuardStoragePaths.length) {
    const attendanceStorage = adminAuth.storage.from('attendance-evidence');
    const removed = await attendanceStorage.remove(attendanceTenantGuardStoragePaths);
    if (removed.error) throw removed.error;
  }
  if (createdAttendanceTenantGuardBucket) {
    const deleted = await adminAuth.storage.deleteBucket('attendance-evidence');
    if (deleted.error) throw new Error(`Disposable attendance-evidence bucket cleanup failed: ${deleted.error.message}`);
  }
  if (candidateTenantGuardStoragePaths.length) {
    const candidateStorage = adminAuth.storage.from('candidate-documents');
    const removed = await candidateStorage.remove(candidateTenantGuardStoragePaths);
    if (removed.error) throw removed.error;
  }
  if (createdCandidateTenantGuardBucket) {
    const deleted = await adminAuth.storage.deleteBucket('candidate-documents');
    if (deleted.error) throw new Error(`Disposable candidate-documents bucket cleanup failed: ${deleted.error.message}`);
  }
  const employeeDocumentStorage = adminAuth.storage.from('employee-documents');
  if (employeeDocumentsBucketSafeToClean && employeeDocumentStoragePaths.length) {
    const removed = await employeeDocumentStorage.remove(employeeDocumentStoragePaths);
    if (removed.error) throw removed.error;
  }
  if (createdEmployeeDocumentsBucket) {
    const deletedBucket = await adminAuth.storage.deleteBucket('employee-documents');
    if (deletedBucket.error) throw new Error(`Disposable employee-documents bucket cleanup failed: ${deletedBucket.error.message}`);
  }
  cleanupAttendanceCorrectionBrowserFixture();
  // Remove the exact HR01-01 synthetic activation rows before deleting their
  // Auth fixtures. These IDs and employee number are reserved by this runner.
  psqlSync(`DELETE FROM public.admin_audit_logs
    WHERE action='candidate.employee.activated' AND details->>'application_id'='ab010001-0000-4000-8000-000000000002';
    DELETE FROM public.candidate_application_stage_history
      WHERE application_id='ab010001-0000-4000-8000-000000000002'::uuid AND stage='hired';
    DELETE FROM public.onboarding_handoffs
      WHERE application_id='ab010001-0000-4000-8000-000000000002'::uuid;
    DELETE FROM public.job_offers
      WHERE application_id='ab010001-0000-4000-8000-000000000002'::uuid;
    DELETE FROM public.employees
      WHERE tenant_id='11111111-1111-4111-8111-111111111111'::uuid AND employee_number='HR01-01-E001';
    DELETE FROM public.tenant_memberships
      WHERE tenant_id='11111111-1111-4111-8111-111111111111'::uuid
        AND user_id=(SELECT id FROM auth.users WHERE email='assessment-candidate-a@hris.test')
        AND role='qa_hris_employee_role';
    DELETE FROM public.job_applications WHERE id='ab010001-0000-4000-8000-000000000002'::uuid;
    DELETE FROM public.jobs WHERE id='ab010001-0000-4000-8000-000000000001'::uuid;`);
  // Reviewer attribution is intentionally restrictive so historical audit rows
  // are not silently detached from their actor. Remove only these synthetic
  // profile-request fixtures before deleting Auth users from the empty test DB.
  const createdIds = createdUserIds.map(sqlLiteral).join(',');
  if (createdIds) {
    const deleteProfileRequestFixture = `DELETE FROM public.employee_profile_change_requests
      WHERE requested_by IN (${createdIds}) OR reviewed_by IN (${createdIds})`;
    psqlSync(`DO $cleanup$
    BEGIN
      IF pg_catalog.to_regclass('public.employee_profile_change_requests') IS NOT NULL THEN
        EXECUTE ${sqlLiteral(deleteProfileRequestFixture)};
      END IF;
    END
    $cleanup$;`);
  }
  for (const userId of createdUserIds) {
    await deleteTrackedAuthUser({
      userId,
      deleteUser: () => adminAuth.auth.admin.deleteUser(userId),
      userStillExists: async (targetId) => psqlSync(
        `SELECT EXISTS(SELECT 1 FROM auth.users WHERE id=${sqlLiteral(targetId)}::uuid);`,
      ).trim() === 't',
    });
  }
}
