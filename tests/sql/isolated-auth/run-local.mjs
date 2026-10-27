Warning: truncated output (original token count: 159838)
Total output lines: 8991

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
      || attendanceCorrectionBrowserReasons.length !== 2) return;
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
  const allowed = new Set(['leave_requests', 'attendance_records', 'attendance_corrections', 'employee_shift_assignments']);
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
  path.join(mainRoot, 'supabase/migrations/20261027030311_employee_profile_tenant_scoped_contract.sql'),
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
    AND has_function_privilege('authenticated','public.hris_update_tenant_employee_contact_details(uuid,uuid,jsonb)','EXECUTE'),
  'anon_denied',NOT has_function_privilege('anon','public.hris_get_tenant_employee_contact_details(uuid,uuid)','EXECUTE')
    AND NOT has_function_privilege('anon','public.hris_update_tenant_employee_contact_details(uuid,uuid,jsonb)','EXECUTE'),
  'service_role_denied',NOT has_function_privilege('service_role','public.hris_get_tenant_employee_contact_details(uuid,uuid)','EXECUTE')
    AND NOT has_function_privilege('service_role','public.hris_update_tenant_employee_contact_details(uuid,uuid,jsonb)','EXECUTE')
)::text;`).trim());
const candidateStageHistoryConstraint = psqlSync(`SELECT pg_get_constraintdef(oid)
  FROM pg_constraint
  WHERE conrelid='public.candidate_application_stage_history'::regclass
    AND conname='candidate_application_stage_history_stage_check';`).trim();
if (!candidateStageHistoryConstraint.includes('interview_completed')) {
  throw new Error('The isolated Candidate stage-history constraint is missing interview_completed.');
}
// The local PostgREST container predates SQL applied directly by this harness.
// Refresh its function catalog before testing newly installed RPCs.
psqlSync("NOTIFY pgrst, 'reload schema';");
await new Promise(resolve => setTimeout(resolve, 500));
const evidenceBucketCheck = await adminAuth.storage.getBucket('leave-evidence');
const evidenceMimeTypes = [
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg', 'image/png',
];
if (evidenceBucketCheck.data) {
  const bucket = evidenceBucketCheck.data;
  const existingEvidence = await adminAuth.storage.from('leave-evidence').list('', { limit: 100 });
  if (existingEvidence.error) throw existingEvidence.error;
  if (bucket.public || bucket.file_size_limit !== 10485760
      || JSON.stringify(bucket.allowed_mime_types || []) !== JSON.stringify(evidenceMimeTypes)
      || existingEvidence.data?.length) {
    throw new Error('Refusing to test: the isolated evidence bucket must be empty and match its production restrictions.');
  }
} else {
  const statusCode = String(evidenceBucketCheck.error?.statusCode || '');
  if (!evidenceBucketCheck.error || statusCode !== '404') {
    throw evidenceBucketCheck.error || new Error('Unable to inspect the isolated leave-evidence bucket.');
  }
  const bucket = await adminAuth.storage.createBucket('leave-evidence', {
    public: false, fileSizeLimit: 10485760, allowedMimeTypes: evidenceMimeTypes,
  });
  if (bucket.error) throw bucket.error;
  createdEvidenceBucket = true;
}
const expenseBucketCheck = await adminAuth.storage.getBucket('expense-receipts');
const expenseMimeTypes = ['application/pdf', 'image/jpeg', 'image/png'];
if (expenseBucketCheck.data) {
  const bucket = expenseBucketCheck.data;
  const existingReceipts = await adminAuth.storage.from('expense-receipts').list('', { limit: 100 });
  if (existingReceipts.error) throw existingReceipts.error;
  if (bucket.public || bucket.file_size_limit !== 10485760
      || JSON.stringify(bucket.allowed_mime_types || []) !== JSON.stringify(expenseMimeTypes)
      || existingReceipts.data?.length) {
    throw new Error('Refusing to test: the isolated expense-receipts bucket must be empty and match its production restrictions.');
  }
  expenseBucketSafeToClean = true;
} else {
  const statusCode = String(expenseBucketCheck.error?.statusCode || '');
  if (!expenseBucketCheck.error || statusCode !== '404') {
    throw expenseBucketCheck.error || new Error('Unable to inspect the isolated expense-receipts bucket.');
  }
  const bucket = await adminAuth.storage.createBucket('expense-receipts', {
    public: false, fileSizeLimit: 10485760, allowedMimeTypes: expenseMimeTypes,
  });
  if (bucket.error) throw bucket.error;
  createdExpenseBucket = true;
  expenseBucketSafeToClean = true;
}
const referralBucketCheck = await adminAuth.storage.getBucket('employee-referral-files');
const referralMimeTypes = [
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
if (referralBucketCheck.data) {
  const bucket = referralBucketCheck.data;
  const existingReferralFiles = await adminAuth.storage.from('employee-referral-files').list('', { limit: 100 });
  if (existingReferralFiles.error) throw existingReferralFiles.error;
  if (bucket.public || bucket.file_size_limit !== 5242880
      || JSON.stringify(bucket.allowed_mime_types || []) !== JSON.stringify(referralMimeTypes)
      || existingReferralFiles.data?.length) {
    throw new Error('Refusing to test: the isolated employee-referral-files bucket must be empty and match its restrictions.');
  }
  referralBucketSafeToClean = true;
} else {
  const statusCode = String(referralBucketCheck.error?.statusCode || '');
  if (!referralBucketCheck.error || statusCode !== '404') {
    throw referralBucketCheck.error || new Error('Unable to inspect the isolated employee-referral-files bucket.');
  }
  const bucket = await adminAuth.storage.createBucket('employee-referral-files', {
    public: false, fileSizeLimit: 5242880, allowedMimeTypes: referralMimeTypes,
  });
  if (bucket.error) throw bucket.error;
  createdReferralBucket = true;
  referralBucketSafeToClean = true;
}
const learningEvidenceBucketCheck = await adminAuth.storage.getBucket('learning-completion-evidence');
const learningEvidenceMimeTypes = ['application/pdf', 'image/png', 'image/jpeg'];
if (learningEvidenceBucketCheck.data) {
  const bucket = learningEvidenceBucketCheck.data;
  const existingLearningEvidence = await adminAuth.storage.from('learning-completion-evidence').list('', { limit: 100 });
  if (existingLearningEvidence.error) throw existingLearningEvidence.error;
  if (bucket.public || bucket.file_size_limit !== 5242880
      || JSON.stringify(bucket.allowed_mime_types || []) !== JSON.stringify(learningEvidenceMimeTypes)
      || existingLearningEvidence.data?.length) {
    throw new Error('Refusing to test: the isolated learning-completion-evidence bucket must be empty and match its restrictions.');
  }
  learningEvidenceBucketSafeToClean = true;
} else {
  const statusCode = String(learningEvidenceBucketCheck.error?.statusCode || '');
  if (!learningEvidenceBucketCheck.error || statusCode !== '404') {
    throw learningEvidenceBucketCheck.error || new Error('Unable to inspect the isolated learning-completion-evidence bucket.');
  }
  const bucket = await adminAuth.storage.createBucket('learning-completion-evidence', {
    public: false, fileSizeLimit: 5242880, allowedMimeTypes: learningEvidenceMimeTypes,
  });
  if (bucket.error) throw bucket.error;
  createdLearningEvidenceBucket = true;
  learningEvidenceBucketSafeToClean = true;
}
const employeeDocumentsBucketCheck = await adminAuth.storage.getBucket('employee-documents');
if (employeeDocumentsBucketCheck.data) {
  const existingEmployeeDocuments = await adminAuth.storage.from('employee-documents').list('', { limit: 100 });
  if (existingEmployeeDocuments.error) throw existingEmployeeDocuments.error;
  if (employeeDocumentsBucketCheck.data.public || existingEmployeeDocuments.data?.length) {
    throw new Error('Refusing to test: the isolated employee-documents bucket must be private and empty.');
  }
  employeeDocumentsBucketSafeToClean = true;
} else {
  const statusCode = String(employeeDocumentsBucketCheck.error?.statusCode || '');
  if (!employeeDocumentsBucketCheck.error || statusCode !== '404') {
    throw employeeDocumentsBucketCheck.error || new Error('Unable to inspect the isolated employee-documents bucket.');
  }
  const bucket = await adminAuth.storage.createBucket('employee-documents', { public: false });
  if (bucket.error) throw bucket.error;
  createdEmployeeDocumentsBucket = true;
  employeeDocumentsBucketSafeToClean = true;
}
const ids = {
  leaveApprove: '88888888-8888-4888-8888-888888888801',
  leaveYearBoundary: '88888888-8888-4888-8888-888888888802',
  leaveMissingLedger: '88888888-8888-4888-8888-888888888803',
  leaveHalfDay: '88888888-8888-4888-8888-888888888804',
  leaveConcurrent: '88888888-8888-4888-8888-888888888805',
  leaveCrossTenant: '88888888-8888-4888-8888-888888888806',
  leaveTenantB: '88888888-8888-4888-8888-888888888807',
  leaveTenantBViewer: '88888888-8888-4888-8888-888888888808',
  attendanceCorrection: 'cccccccc-0000-4000-8000-000000000001',
  attendanceCrossTenant: 'cccccccc-0000-4000-8000-000000000002',
  attendanceCorrectionB: 'cccccccc-0000-4000-8000-000000000003',
  attendanceCheckoutOnly: 'cccccccc-0000-4000-8000-000000000004',
  attendanceWorkModeOnly: 'cccccccc-0000-4000-8000-000000000005',
  attendanceNoExistingRow: 'cccccccc-0000-4000-8000-000000000006',
  attendanceConcurrent: 'cccccccc-0000-4000-8000-000000000007',
  attendanceUnauthorized: 'cccccccc-0000-4000-8000-000000000008',
  attendanceRevoked: 'cccccccc-0000-4000-8000-000000000009',
  attendanceRecord: 'bbbbbbbb-0000-4000-8000-000000000001',
  clockEmployee: '55555555-5555-4555-8555-555555555560',
  tenantA: '11111111-1111-4111-8111-111111111111',
  tenantB: '22222222-2222-4222-8222-222222222222',
  leaveTypeA: '99999999-9999-4999-8999-999999999901',
  leaveTypeMissingLedger: '99999999-9999-4999-8999-999999999902',
  leaveTypeB: '99999999-9999-4999-8999-999999999903',
  leaveTypeEvidence: '99999999-9999-4999-8999-999999999904',
};
psqlSync(`INSERT INTO public.attendance_records(
  id,tenant_id,employee_id,attendance_date,check_in,check_out,work_mode,status,source,remarks
) VALUES (
  'bbbbbbbb-0000-4000-8000-000000000006','${ids.tenantA}','55555555-5555-4555-8555-555555555555',
  '${previousAttendanceMonthDate}'::date,
  (('${previousAttendanceMonthDate}'::date + time '09:00') AT TIME ZONE 'Asia/Dhaka'),
  (('${previousAttendanceMonthDate}'::date + time '17:00') AT TIME ZONE 'Asia/Dhaka'),
  'office','present','employee','Synthetic isolated prior-month attendance acceptance fixture'
);`);
// Preserve the seeded holiday-boundary request dates. Rewriting them to the
// runner's current date makes the charge depend on its weekday and skews the
// separate current-day dashboard fixture.
const results = [];
function record(label, ok, note = '') {
  results.push({ label, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${note ? ` — ${note}` : ''}`);
}

const superAdminTenantPermission = await noticesPlatformSuperAdmin.client.rpc(
  'has_tenant_permission', { p_tenant_id: ids.tenantA, p_permission_id: 'notices.view' },
);
assert.ifError(superAdminTenantPermission.error);
const superAdminTenantManagePermission = await noticesPlatformSuperAdmin.client.rpc(
  'has_tenant_permission', { p_tenant_id: ids.tenantA, p_permission_id: 'notices.manage' },
);
assert.ifError(superAdminTenantManagePermission.error);
const scopedSuperAdminCheck = await noticesPlatformSuperAdmin.client.rpc(
  'hris_notices_super_admin_tenant_member', { p_tenant_id: ids.tenantA },
);
assert.ifError(scopedSuperAdminCheck.error);
const otherTenantSuperAdminCheck = await noticesPlatformSuperAdmin.client.rpc(
  'hris_notices_super_admin_tenant_member', { p_tenant_id: ids.tenantB },
);
assert.ifError(otherTenantSuperAdminCheck.error);
const scopedSuperAdminNotices = await noticesPlatformSuperAdmin.client.from('notices')
  .select('id,tenant_id').order('id');
assert.ifError(scopedSuperAdminNotices.error);
const superAdminNoticeTenants = [...new Set(scopedSuperAdminNotices.data.map(row => row.tenant_id))];
record('Tenant Super Admin notice exception requires active membership and stays within that tenant',
  superAdminTenantPermission.data === false
    && superAdminTenantManagePermission.data === false
    && scopedSuperAdminCheck.data === true
    && otherTenantSuperAdminCheck.data === false
    && superAdminNoticeTenants.length === 1
    && superAdminNoticeTenants[0] === ids.tenantA
    && scopedSuperAdminNotices.data.some(row => row.id === 'b1111111-1111-4111-8111-111111111111'));

const unassignedPlatformSuperAdminScope = await noticesUnassignedPlatformSuperAdmin.client.rpc(
  'hris_notices_super_admin_tenant_member', { p_tenant_id: ids.tenantA },
);
assert.ifError(unassignedPlatformSuperAdminScope.error);
const unassignedPlatformSuperAdminNotices = await noticesUnassignedPlatformSuperAdmin.client
  .from('notices').select('id,tenant_id').order('id');
assert.ifError(unassignedPlatformSuperAdminNotices.error);
const unassignedPlatformSuperAdminFacts = queryAdmin(`SELECT jsonb_build_object(
  'is_active_super_admin', EXISTS (SELECT 1 FROM public.admin_users a
    WHERE a.user_id=${sqlLiteral(noticesUnassignedPlatformSuperAdmin.userId)}::uuid
      AND a.active IS TRUE AND a.is_super_admin IS TRUE),
  'active_tenant_membership_count', (SELECT count(*) FROM public.tenant_memberships m
    WHERE m.user_id=${sqlLiteral(noticesUnassignedPlatformSuperAdmin.userId)}::uuid
      AND lower(m.status)='active')
)`);
record('Active platform Super Admin without tenant membership remains denied tenant notices',
  unassignedPlatformSuperAdminFacts.is_active_super_admin === true
    && unassignedPlatformSuperAdminFacts.active_tenant_membership_count === 0
    && unassignedPlatformSuperAdminScope.data === false
    && unassignedPlatformSuperAdminNotices.data.length === 0);

const globalAdmin45Facts = queryAdmin(`SELECT jsonb_build_object(
  'global_permission_count', (
    SELECT count(DISTINCT rp.permission_id)
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role_id=ur.role_id
    WHERE ur.user_id=${sqlLiteral(noticesGlobalAdmin45.userId)}
  ),
  'active_tenant_membership_count', (
    SELECT count(*) FROM public.tenant_memberships tm
    WHERE tm.user_id=${sqlLiteral(noticesGlobalAdmin45.userId)}::uuid
      AND lower(tm.status)='active'
  )
)`);
const unassignedAdminNotices = await noticesGlobalAdmin45.client.from('notices')
  .select('id,tenant_id').order('id');
assert.ifError(unassignedAdminNotices.error);
record('Unassigned 45-permission global administrator remains denied tenant notices',
  globalAdmin45Facts.global_permission_count === 45
    && globalAdmin45Facts.active_tenant_membership_count === 0
    && unassignedAdminNotices.data.length === 0);

const tenantManagerNotices = await managerA.client.from('notices').select('id,tenant_id').order('id');
assert.ifError(tenantManagerNotices.error);
record('Existing tenant notice manager retains authorized reads without cross-tenant rows',
  tenantManagerNotices.data.length > 0
    && tenantManagerNotices.data.every(row => row.tenant_id === ids.tenantA));

const anonNoticesClient = createClient(services.API_URL, services.ANON_KEY, authOptions);
const anonNotices = await anonNoticesClient.from('notices').select('id,tenant_id');
const anonNoticeHelper = await anonNoticesClient.rpc(
  'hris_notices_super_admin_tenant_member', { p_tenant_id: ids.tenantA },
);
record('Anonymous clients cannot read tenant notices or call the Super Admin scope helper',
  (Boolean(anonNotices.error) || (anonNotices.data || []).length === 0)
    && Boolean(anonNoticeHelper.error));

const profileChangeValue = `Verified profile request ${randomUUID()}`;
const profileChangeSubmit = await employeeA.client.rpc('employee_submit_profile_change_request', {
  p_tenant_id: ids.tenantA,
  p_field_key: 'address', p_requested_value: profileChangeValue,
  p_reason: 'Synthetic employee profile correction acceptance.',
});
const profileChangeId = profileChangeSubmit.data;
const profileEmployeeHistory = await employeeA.client.rpc('employee_get_my_profile_change_requests', { p_tenant_id: ids.tenantA });
const profileDirectValueRead = await employeeA.client.from('employee_profile_change_requests').select('requested_value').limit(1);
const profileDirectOwnRows = await employeeA.client.from('employee_profile_change_requests').select('id,field_key,status');
const profileOtherTenantHistory = await employeeB.client.rpc('employee_get_my_profile_change_requests', { p_tenant_id: ids.tenantB });
const profileDuplicate = await employeeA.client.rpc('employee_submit_profile_change_request', {
  p_tenant_id: ids.tenantA,
  p_field_key: 'address', p_requested_value: 'A second concurrent address', p_reason: 'Duplicate should be denied.',
});
let profileInactiveMembership;
psqlSync(`UPDATE public.tenant_memberships SET status='inactive'
  WHERE user_id=${sqlLiteral(employeeA.userId)}::uuid AND tenant_id='${ids.tenantA}'::uuid;`);
try {
  profileInactiveMembership = await employeeA.client.rpc('employee_get_my_profile_change_requests', { p_tenant_id: ids.tenantA });
} finally {
  psqlSync(`UPDATE public.tenant_memberships SET status='active'
    WHERE user_id=${sqlLiteral(employeeA.userId)}::uuid AND tenant_id='${ids.tenantA}'::uuid;`);
}
const profileCrossTenantSubmit = await employeeA.client.rpc('employee_submit_profile_change_request', {
  p_tenant_id: ids.tenantB, p_field_key: 'address', p_requested_value: 'Cross-tenant attempt',
  p_reason: 'This must be rejected.',
});
const profileEmployeeReview = await employeeA.client.rpc('admin_list_profile_change_requests', { p_tenant_id: ids.tenantA });
const profileNoPermissionReview = await noPermission.client.rpc('admin_list_profile_change_requests', { p_tenant_id: ids.tenantA });
const profileManagerAQueue = await managerA.client.rpc('admin_list_profile_change_requests', { p_tenant_id: ids.tenantA });
const profileManagerBQueue = await managerB.client.rpc('admin_list_profile_change_requests', { p_tenant_id: ids.tenantA });
record('E02-03 employee requests a protected field correction and sees tenant-scoped status without reading proposed values',
  !profileChangeSubmit.error && typeof profileChangeId === 'string'
    && !profileEmployeeHistory.error && profileEmployeeHistory.data?.some(row => row.id === profileChangeId && row.status === 'pending')
    && !profileDirectOwnRows.error && profileDirectOwnRows.data?.length === 1
    && Boolean(profileDirectValueRead.error)
    && profileOtherTenantHistory.data?.length === 0
    && profileDuplicate.error?.code === '23505'
    && profileInactiveMembership.error?.code === '42501'
    && profileCrossTenantSubmit.error?.code === '42501',
  JSON.stringify({ submit: profileChangeSubmit.error?.code || 'ok', ownHistory: profileEmployeeHistory.data?.length,
    rawValueDenied: Boolean(profileDirectValueRead.error), otherTenant: profileOtherTenantHistory.data?.length,
    duplicate: profileDuplicate.error?.code, inactiveMembership: profileInactiveMembership.error?.code,
    crossTenant: profileCrossTenantSubmit.error?.code }));
record('E02 profile review is denied to employees and users without permission and scoped to the reviewer active tenant',
  profileEmployeeReview.error?.code === '42501'
    && profileNoPermissionReview.error?.code === '42501'
    && profileManagerAQueue.data?.some(row => row.id === profileChangeId)
    && !profileManagerAQueue.error
    && profileManagerBQueue.error?.code === '42501'
    && profileCrossTenantSubmit.error?.code === '42501');
const profileApproval = await managerA.client.rpc('admin_review_profile_change_request', {
  p_tenant_id: ids.tenantA,
  p_id: profileChangeId, p_decision: 'approved', p_note: 'Verified synthetic employee correction.',
});
const profileDuplicateDecision = await managerA.client.rpc('admin_review_profile_change_request', {
  p_tenant_id: ids.tenantA,
  p_id: profileChangeId, p_decision: 'approved', p_note: null,
});
const profileHistoryAfterReview = await employeeA.client.rpc('employee_get_my_profile_change_requests', { p_tenant_id: ids.tenantA });
const profileEmployeeAfterReview = await adminAuth.from('employees').select('address,full_name')
  .eq('id', '55555555-5555-4555-8555-555555555555').single();
const profileAudit = queryAdmin(`SELECT jsonb_build_object('count',count(*),'redacted',bool_and(details ? 'field_key' AND NOT (details ? 'requested_value')))
  FROM public.admin_audit_logs WHERE target_id=${sqlLiteral(profileChangeId)} AND action='self_service.profile_change.approved'`);
record('E02-17 approved profile changes update only the requested field, persist employee history, redact audit values, and reject duplicate decisions',
  !profileApproval.error && profileApproval.data?.status === 'approved'
    && profileDuplicateDecision.error?.code === 'P0002'
    && profileHistoryAfterReview.data?.some(row => row.id === profileChangeId && row.status === 'approved' && row.review_note === 'Verified synthetic employee correction.')
    && profileEmployeeAfterReview.data?.address === profileChangeValue
    && profileEmployeeAfterReview.data?.full_name === 'Synthetic Employee A'
    && profileAudit.count === 1 && profileAudit.redacted === true,
  JSON.stringify({ approval: profileApproval.data?.status || profileApproval.error?.code, duplicateDecision: profileDuplicateDecision.error?.code, history: profileHistoryAfterReview.data?.find(row => row.id === profileChangeId)?.status, fieldPersisted: profileEmployeeAfterReview.data?.address === profileChangeValue, audit: profileAudit }));


const profileOwnRead = await employeeA.client.rpc('employee_get_my_profile_v1', { p_tenant_id: ids.tenantA });
const profileCrossTenantRead = await employeeA.client.rpc('employee_get_my_profile_v1', { p_tenant_id: ids.tenantB });
const profileMemberWithoutEmployee = await noPermission.client.rpc('employee_get_my_profile_v1', { p_tenant_id: ids.tenantA });
record('E02-01 v1 profile projection returns only the linked tenant employee and handles a member without an employee row',
  !profileOwnRead.error
    && profileOwnRead.data?.tenant_id === ids.tenantA
    && profileOwnRead.data?.employee?.id === '55555555-5555-4555-8555-555555555555'
    && profileOwnRead.data?.employee?.address === profileChangeValue
    && profileOwnRead.data?.employee?.mailing_address === 'QA A mailing address'
    && profileCrossTenantRead.error?.code === '42501'
    && !profileMemberWithoutEmployee.error
    && profileMemberWithoutEmployee.data?.employee === null,
  JSON.stringify({ own: profileOwnRead.error?.code || profileOwnRead.data?.employee?.id,
    crossTenant: profileCrossTenantRead.error?.code || 'unexpected success',
    noEmployee: profileMemberWithoutEmployee.data?.employee }));

const educationPayload = {
  education_level: 'Bachelor', institution: 'Synthetic Profile University',
  subject_major: 'Product Design', degree_title: 'Bachelor of Design',
  result_type: 'GPA', result: '3.8', currently_studying: false,
  starting_year: 2015, passing_year: 2019, duration: '4 years',
  achievements: 'Synthetic portfolio distinction',
};
const profileEducationSave = await employeeA.client.rpc('employee_save_my_education_v1', {
  p_tenant_id: ids.tenantA, p_payload: educationPayload,
});
const profileEducationUpdate = await employeeA.client.rpc('employee_save_my_education_v1', {
  p_tenant_id: ids.tenantA,
  p_payload: { ...educationPayload, id: profileEducationSave.data, institution: 'Synthetic Updated University' },
});
const profileEducationStored = await adminAuth.from('employee_education')
  .select('employee_id,institution,subject_major,passing_year,currently_studying')
  .eq('id', profileEducationSave.data).single();
const invalidEducation = await employeeA.client.rpc('employee_save_my_education_v1', {
  p_tenant_id: ids.tenantA, p_payload: { ...educationPayload, starting_year: 1899 },
});

const experiencePayload = {
  role_title: 'Synthetic Product Designer', company: 'Synthetic Design Lab', job_type: 'Full time',
  company_website: 'https://example.invalid', joining_date: '2020-01-01',
  departure_date: '2022-01-01', total_duration: '2 years', office_address: 'Synthetic Dhaka office',
  description: 'Synthetic product design responsibilities',
};
const profileExperienceSave = await employeeA.client.rpc('employee_save_my_experience_v1', {
  p_tenant_id: ids.tenantA, p_payload: experiencePayload,
});
const profileExperienceUpdate = await employeeA.client.rpc('employee_save_my_experience_v1', {
  p_tenant_id: ids.tenantA,
  p_payload: { ...experiencePayload, id: profileExperienceSave.data, company: 'Synthetic Updated Design Lab' },
});
const profileExperienceStored = await adminAuth.from('employee_experience')
  .select('employee_id,company,job_type,company_website,departure_date')
  .eq('id', profileExperienceSave.data).single();
const invalidExperience = await employeeA.client.rpc('employee_save_my_experience_v1', {
  p_tenant_id: ids.tenantA, p_payload: { ...experiencePayload, departure_date: '2019-12-31' },
});

const familyPayload = {
  name: 'Synthetic Profile Family Member', phone: '+880 1700 000202',
  nid_number: 'SYNTHETIC-FAMILY-NID', date_of_birth: '1992-02-03',
  relationship: 'Sibling', present_address: 'Synthetic present address',
  permanent_address: 'Synthetic permanent address', is_nominee: true,
};
const profileFamilySave = await employeeA.client.rpc('employee_save_my_family_member_v1', {
  p_tenant_id: ids.tenantA, p_payload: familyPayload,
});
const profileFamilyUpdate = await employeeA.client.rpc('employee_save_my_family_member_v1', {
  p_tenant_id: ids.tenantA,
  p_payload: { ...familyPayload, id: profileFamilySave.data, relationship: 'Spouse' },
});
const profileFamilyStored = await adminAuth.from('employee_family_members')
  .select('employee_id,name,phone,nid_number,relationship,is_nominee')
  .eq('id', profileFamilySave.data).single();
const invalidFamily = await employeeA.client.rpc('employee_save_my_family_member_v1', {
  p_tenant_id: ids.tenantA, p_payload: { ...familyPayload, phone: 'abc' },
});

const bankPayload = {
  bank_name: 'Synthetic Profile Bank', account_number: 'SYNTHETIC-ACCOUNT-12345',
  branch_name: 'Synthetic Branch',
  routing_number: '123456789',
};
const profileBankSave = await employeeA.client.rpc('employee_save_my_bank_v1', {
  p_tenant_id: ids.tenantA, p_payload: bankPayload,
});
const profileBankUpdate = await employeeA.client.rpc('employee_save_my_bank_v1', {
  p_tenant_id: ids.tenantA, p_payload: { ...bankPayload, branch_name: 'Synthetic Updated Branch' },
});
const profileBankStored = await adminAuth.from('employee_bank_details')
  .select('employee_id,tenant_id,bank_name,account_number,branch_name,routing_number')
  .eq('employee_id', '55555555-5555-4555-8555-555555555555').single();
const invalidBank = await employeeA.client.rpc('employee_save_my_bank_v1', {
  p_tenant_id: ids.tenantA, p_payload: { ...bankPayload, routing_number: 'ABC' },
});
const unauthorizedBankSave = await managerA.client.rpc('employee_save_my_bank_v1', {
  p_tenant_id: ids.tenantA, p_payload: bankPayload,
});
const crossTenantBankSave = await employeeA.client.rpc('employee_save_my_bank_v1', {
  p_tenant_id: ids.tenantB, p_payload: bankPayload,
});
const directBankRead = await employeeA.client.from('employee_bank_details').select('account_number');
const directEmployeeWrite = await employeeA.client.from('employees')
  .update({ address: 'Direct bypass attempt' }).eq('id', '55555555-5555-4555-8555-555555555555');
const profileDirectFamilyWrite = await employeeA.client.from('employee_family_members').insert({
  employee_id: '55555555-5555-4555-8555-555555555555', name: 'Direct bypass attempt',
});

record('E02 v1 education, experience, family, and bank RPCs persist their approved payload fields',
  !profileEducationSave.error && !profileEducationStored.error
    && profileEducationStored.data?.employee_id === '55555555-5555-4555-8555-555555555555'
    && !profileEducationUpdate.error
    && profileEducationStored.data?.institution === 'Synthetic Updated University'
    && profileEducationStored.data?.currently_studying === false
    && !profileExperienceSave.error && !profileExperienceStored.error
    && !profileExperienceUpdate.error
    && profileExperienceStored.data?.company === 'Synthetic Updated Design Lab'
    && profileExperienceStored.data?.job_type === 'Full time'
    && profileExperienceStored.data?.company_website === 'https://example.invalid'
    && !profileFamilySave.error && !profileFamilyUpdate.error && !profileFamilyStored.error
    && profileFamilyStored.data?.name === 'Synthetic Profile Family Member'
    && profileFamilyStored.data?.relationship === 'Spouse'
    && profileFamilyStored.data?.is_nominee === true
    && !profileBankSave.error && !profileBankUpdate.error && !profileBankStored.error
    && profileBankStored.data?.branch_name === 'Synthetic Updated Branch'
    && profileBankStored.data?.account_number === 'SYNTHETIC-ACCOUNT-12345',
  JSON.stringify({ education: profileEducationSave.error?.code || profileEducationStored.data?.institution,
    experience: profileExperienceSave.error?.code || profileExperienceStored.data?.company,
    family: profileFamilySave.error?.code || profileFamilyStored.data?.name,
    bank: profileBankSave.error?.code || profileBankStored.data?.bank_name }));

record('E02 v1 profile RPCs reject invalid values, unauthorized roles, cross-tenant calls, and direct table writes',
  invalidEducation.error?.code === '22023'
    && invalidExperience.error?.code === '22023'
    && invalidFamily.error?.code === '22023'
    && invalidBank.error?.code === '22023'
    && unauthorizedBankSave.error?.code === '42501'
    && crossTenantBankSave.error?.code === '42501'
    && Boolean(directBankRead.error)
    && Boolean(directEmployeeWrite.error)
    && Boolean(profileDirectFamilyWrite.error),
  JSON.stringify({ education: invalidEducation.error?.code, experience: invalidExperience.error?.code,
    family: invalidFamily.error?.code, bank: invalidBank.error?.code,
    unauthorized: unauthorizedBankSave.error?.code, crossTenant: crossTenantBankSave.error?.code,
    directBank: directBankRead.error?.code, directEmployee: directEmployeeWrite.error?.code,
    directFamily: profileDirectFamilyWrite.error?.code }));

const profileCertificatePath = employeeA.userId + '/' + ids.tenantA + '/profile-certificates/' + randomUUID() + '.pdf';
const profileCertificateUpload = await employeeA.client.storage.from('employee-documents').upload(
  profileCertificatePath, new Blob(['%PDF-1.4\nSynthetic profile training certificate\n'], { type: 'application/pdf' }),
  { contentType: 'application/pdf', upsert: false },
);
const profileTrainingSave = await employeeA.client.rpc('employee_save_my_training_v1', {
  p_tenant_id: ids.tenantA,
  p_payload: {
    title: 'Synthetic profile training', institute_name: 'Synthetic QA Institute',
    training_number: 'TRAIN-LOCAL-001', year: '2024', duration: '3 days',
    certificate_url: profileCertificatePath,
  },
});
const profileTrainingUpdate = await employeeA.client.rpc('employee_save_my_training_v1', {
  p_tenant_id: ids.tenantA,
  p_payload: {
    id: profileTrainingSave.data, title: 'Synthetic updated profile training',
    institute_name: 'Synthetic QA Institute', training_number: 'TRAIN-LOCAL-001',
    year: '2024', duration: '4 days', certificate_url: profileCertificatePath,
  },
});
const profileTrainingStored = await adminAuth.from('employee_training')
  .select('employee_id,title,training_number,year,duration,certificate_url')
  .eq('id', profileTrainingSave.data).single();
const profileCertificateDocument = await adminAuth.from('employee_documents')
  .select('employee_id,name,document_type,file_url,verification_status')
  .eq('file_url', profileCertificatePath).single();
const profileCertificateOwnerDownload = await employeeA.client.storage
  .from('employee-documents').download(profileCertificatePath);
const profileCertificateForeignDownload = await employeeB.client.storage
  .from('employee-documents').download(profileCertificatePath);
const profileCertificationPath = employeeA.userId + '/' + ids.tenantA + '/profile-certificates/' + randomUUID() + '.png';
const profileCertificationUpload = await employeeA.client.storage.from('employee-documents').upload(
  profileCertificationPath, new Blob([new Uint8Array([137,80,78,71,13,10,26,10])], { type: 'image/png' }),
  { contentType: 'image/png', upsert: false },
);
const profileCertificationSave = await employeeA.client.rpc('employee_save_my_certification_v1', {
  p_tenant_id: ids.tenantA,
  p_payload: {
    title: 'Synthetic employee certification', institute_name: 'Synthetic QA Board',
    issued_by: 'Synthetic QA Board', issue_date: '2024-01-01', expiry_date: '2027-01-01',
    certificate_document_url: profileCertificationPath,
  },
});
const profileCertificationUpdate = await employeeA.client.rpc('employee_save_my_certification_v1', {
  p_tenant_id: ids.tenantA,
  p_payload: {
    id: profileCertificationSave.data, title: 'Synthetic updated employee certification',
    institute_name: 'Synthetic QA Board', issued_by: 'Synthetic QA Board',
    issue_date: '2024-01-01', expiry_date: '2028-01-01',
    certificate_document_url: profileCertificationPath,
  },
});
const profileCertificationStored = await adminAuth.from('employee_certifications')
  .select('employee_id,title,issue_date,expiry_date,certificate_document_url')
  .eq('id', profileCertificationSave.data).single();
const profileCertificationDocument = await adminAuth.from('employee_documents')
  .select('employee_id,name,document_type,file_url,expires_at,verification_status')
  .eq('file_url', profileCertificationPath).single();
const invalidCertification = await employeeA.client.rpc('employee_save_my_certification_v1', {
  p_tenant_id: ids.tenantA,
  p_payload: {
    title: 'Invalid certification', institute_name: 'Synthetic QA Board',
    issue_date: '2024-02-01', expiry_date: '2024-01-01',
  },
});
const invalidTraining = await employeeA.client.rpc('employee_save_my_training_v1', {
  p_tenant_id: ids.tenantA,
  p_payload: {
    title: 'Invalid training', institute_name: 'Synthetic QA Institute',
    training_number: 'TRAIN-INVALID', year: 'not-a-year', duration: '1 day',
  },
});
const profileCrossTenantEducation = await employeeA.client.rpc('employee_save_my_education_v1', {
  p_tenant_id: ids.tenantB, p_payload: educationPayload,
});
const profileOtherEmployeeSeed = await employeeB.client.rpc('employee_save_my_education_v1', {
  p_tenant_id: ids.tenantB, p_payload: { ...educationPayload, institution: 'Synthetic Tenant B University' },
});
const profileOtherEmployeeUpdate = await employeeA.client.rpc('employee_save_my_education_v1', {
  p_tenant_id: ids.tenantA,
  p_payload: { ...educationPayload, id: profileOtherEmployeeSeed.data },
});
record('E02 v1 training certificate upload is owner and tenant scoped, persists its document row, and malformed input is rejected',
  !profileCertificateUpload.error
    && !profileTrainingSave.error && !profileTrainingUpdate.error && !profileTrainingStored.error
    && profileTrainingStored.data?.employee_id === '55555555-5555-4555-8555-555555555555'
    && profileTrainingStored.data?.certificate_url === profileCertificatePath
    && profileTrainingStored.data?.title === 'Synthetic updated profile training'
    && profileTrainingStored.data?.duration === '4 days'
    && !profileCertificateDocument.error
    && profileCertificateDocument.data?.document_type === 'certificate'
    && profileCertificateDocument.data?.file_url === profileCertificatePath
    && !profileCertificateOwnerDownload.error
    && Boolean(profileCertificateOwnerDownload.data)
    && Boolean(profileCertificateForeignDownload.error)
    && invalidTraining.error?.code === '22023'
    && !profileOtherEmployeeSeed.error
    && !profileCertificationUpload.error
    && !profileCertificationSave.error && !profileCertificationUpdate.error
    && !profileCertificationStored.error
    && profileCertificationStored.data?.employee_id === '55555555-5555-4555-8555-555555555555'
    && profileCertificationStored.data?.certificate_document_url === profileCertificationPath
    && profileCertificationStored.data?.title === 'Synthetic updated employee certification'
    && profileCertificationStored.data?.expiry_date === '2028-01-01'
    && !profileCertificationDocument.error
    && profileCertificationDocument.data?.document_type === 'certificate'
    && profileCertificationDocument.data?.expires_at === '2028-01-01'
    && invalidCertification.error?.code === '22023'
    && profileCrossTenantEducation.error?.code === '42501'
    && profileOtherEmployeeUpdate.error?.code === '42501',
  JSON.stringify({ upload: profileCertificateUpload.error?.message || 'ok',
    save: profileTrainingSave.error?.code || 'ok', registeredType: profileCertificateDocument.data?.document_type,
    certification: profileCertificationSave.error?.code || profileCertificationDocument.data?.document_type,
    invalidCertification: invalidCertification.error?.code,
    ownDownload: profileCertificateOwnerDownload.error?.message || 'ok',
    foreignDownload: profileCertificateForeignDownload.error?.message || 'denied',
    invalidYear: invalidTraining.error?.code, crossTenant: profileCrossTenantEducation.error?.code,
    otherEmployee: profileOtherEmployeeUpdate.error?.code }));

const profileInvalidEmail = await employeeA.client.rpc('employee_submit_profile_change_request', {
  p_tenant_id: ids.tenantA, p_field_key: 'personal_email',
  p_requested_value: 'not-an-email', p_reason: 'Invalid profile input acceptance.',
});
const profileInvalidGender = await employeeA.client.rpc('employee_submit_profile_change_request', {
  p_tenant_id: ids.tenantA, p_field_key: 'gender',
  p_requested_value: 'Unknown', p_reason: 'Invalid profile input acceptance.',
});
const profileInvalidDob = await employeeA.client.rpc('employee_submit_profile_change_request', {
  p_tenant_id: ids.tenantA, p_field_key: 'date_of_birth',
  p_requested_value: '2999-12-31', p_reason: 'Invalid profile input acceptance.',
});
const profilePostWriteRead = await employeeA.client.rpc('employee_get_my_profile_v1', { p_tenant_id: ids.tenantA });
const employeeProfileReads = profilePostWriteRead.data?.employee;
const retiredProfileRpcExecute = queryAdmin("SELECT jsonb_build_object(" +
  "'read',CASE WHEN to_regprocedure('public.employee_get_my_profile()') IS NULL THEN true ELSE NOT has_function_privilege('authenticated',to_regprocedure('public.employee_get_my_profile()'),'EXECUTE') END," +
  "'update',CASE WHEN to_regprocedure('public.employee_update_my_profile(jsonb)') IS NULL THEN true ELSE NOT has_function_privilege('authenticated',to_regprocedure('public.employee_update_my_profile(jsonb)'),'EXECUTE') END," +
  "'bank_update',CASE WHEN to_regprocedure('public.employee_update_my_bank(jsonb)') IS NULL THEN true ELSE NOT has_function_privilege('authenticated',to_regprocedure('public.employee_update_my_bank(jsonb)'),'EXECUTE') END)");
record('E02 v1 profile projection returns saved employee-owned records and legacy tenantless writes are retired',
  !profilePostWriteRead.error
    && employeeProfileReads?.education?.some(row => row.id === profileEducationSave.data)
    && employeeProfileReads?.experience?.some(row => row.id === profileExperienceSave.data)
    && employeeProfileReads?.training?.some(row => row.id === profileTrainingSave.data)
    && employeeProfileReads?.family_members?.some(row => row.id === profileFamilySave.data)
    && employeeProfileReads?.bank?.account_number === 'SYNTHETIC-ACCOUNT-12345'
    && profileInvalidEmail.error?.code === '22023'
    && profileInvalidGender.error?.code === '22023'
    && profileInvalidDob.error?.code === '22023'
    && retiredProfileRpcExecute.read === true
    && retiredProfileRpcExecute.update === true
    && retiredProfileRpcExecute.bank_update === true,
  JSON.stringify({ education: employeeProfileReads?.education?.length,
    experience: employeeProfileReads?.experience?.length, training: employeeProfileReads?.training?.length,
    family: employeeProfileReads?.family_members?.length, bank: employeeProfileReads?.bank?.bank_name,
    invalidEmail: profileInvalidEmail.error?.code, invalidGender: profileInvalidGender.error?.code,
    invalidDob: profileInvalidDob.error?.code, retired: retiredProfileRpcExecute }));
const profileRoleWithoutEmployeeWrite = await noPermission.client.rpc('employee_save_my_family_member_v1', {
  p_tenant_id: ids.tenantA, p_payload: familyPayload,
});
record('E02 unlinked active tenant members cannot mutate an employee profile',
  profileRoleWithoutEmployeeWrite.error?.code === '42501',
  profileRoleWithoutEmployeeWrite.error?.code || 'unexpected success');

const familyPolicyState = queryAdmin(`SELECT jsonb_build_object(
  'rls_enabled', c.relrowsecurity,
  'admin_policy', (SELECT qual FROM pg_policies WHERE schemaname='public'
    AND tablename='employee_family_members' AND policyname='employee_family_admin_read'),
  'self_policy', (SELECT qual FROM pg_policies WHERE schemaname='public'
    AND tablename='employee_family_members' AND policyname='employee_family_members_self_read'),
  'tenant_guard', (SELECT jsonb_build_object('permissive',permissive,'qual',qual)
    FROM pg_policies WHERE schemaname='public' AND tablename='employee_family_members'
      AND policyname='employee_family_tenant_guard'),
  'anon_privileges', COALESCE((
    SELECT jsonb_agg(p.privilege_type ORDER BY p.privilege_type)
    FROM aclexplode(COALESCE(c.relacl, acldefault('r'::"char", c.relowner))) p
    WHERE p.grantee=(SELECT oid FROM pg_roles WHERE rolname='anon')
  ), '[]'::jsonb),
  'authenticated_privileges', COALESCE((
    SELECT jsonb_agg(p.privilege_type ORDER BY p.privilege_type)
    FROM aclexplode(COALESCE(c.relacl, acldefault('r'::"char", c.relowner))) p
    WHERE p.grantee=(SELECT oid FROM pg_roles WHERE rolname='authenticated')
  ), '[]'::jsonb),
  'anon_select',has_table_privilege('anon','public.employee_family_members','SELECT'),
  'select_grant',has_table_privilege('authenticated','public.employee_family_members','SELECT'),
  'insert_grant',has_table_privilege('authenticated','public.employee_family_members','INSERT'),
  'update_grant',has_table_privilege('authenticated','public.employee_family_members','UPDATE'),
  'delete_grant',has_table_privilege('authenticated','public.employee_family_members','DELETE')
) FROM pg_class c WHERE c.oid='public.employee_family_members'::regclass`);
record('Family RLS uses active tenant membership roles and own-row policies',
  familyPolicyState.rls_enabled === true
    && String(familyPolicyState.admin_policy).includes('hris_employee_family_admin_can_read')
    && !String(familyPolicyState.admin_policy).includes('has_permission')
    && String(familyPolicyState.self_policy).includes('hris_employee_family_own_row')
    && familyPolicyState.tenant_guard?.permissive === 'RESTRICTIVE'
    && String(familyPolicyState.tenant_guard?.qual).includes('hris_employee_family_admin_can_read')
    && String(familyPolicyState.tenant_guard?.qual).includes('hris_employee_family_own_row')
    && familyPolicyState.anon_privileges?.length === 0
    && familyPolicyState.anon_select === false
    && JSON.stringify(familyPolicyState.authenticated_privileges) === '["SELECT"]'
    && familyPolicyState.select_grant === true
    && familyPolicyState.insert_grant === false
    && familyPolicyState.update_grant === false
    && familyPolicyState.delete_grant === false,
  JSON.stringify(familyPolicyState));

const [familyAdminA, familyAdminB, familyViewerA, familyEmployeeA, familyEmployeeB, familyGlobalOnly] = await Promise.all([
  managerA.client.from('employee_family_members').select('id,name').order('id'),
  managerB.client.from('employee_family_members').select('id,name').order('id'),
  employeesViewer.client.from('employee_family_members').select('id,name').order('id'),
  employeeA.client.from('employee_family_members').select('id,name').order('id'),
  employeeB.client.from('employee_family_members').select('id,name').order('id'),
  globalOnly.client.from('employee_family_members').select('id,name').order('id'),
]);
const familyRowA = 'a1111111-1111-4111-8111-111111111111';
const familyRowB = 'a2222222-2222-4222-8222-222222222222';
const directAnonymousFamilyRead = attemptAs(null, 'SELECT id FROM public.employee_family_members', 'anon');
record('Anonymous role has no direct employee-family-table privileges', !directAnonymousFamilyRead.ok);
record('Family read/manage access returns only rows from each manager active tenant',
  !familyAdminA.error && !familyAdminB.error
    && familyAdminA.data?.length === 1 && familyAdminA.data[0]?.id === familyRowA
    && familyAdminB.data?.length === 1 && familyAdminB.data[0]?.id === familyRowB);
record('Employee directory viewer reads only family rows in its tenant',
  !familyViewerA.error && familyViewerA.data?.length === 1 && familyViewerA.data[0]?.id === familyRowA);
record('Employees read only their own linked family rows in either tenant',
  !familyEmployeeA.error && !familyEmployeeB.error
    && familyEmployeeA.data?.length === 1 && familyEmployeeA.data[0]?.id === familyRowA
    && familyEmployeeB.data?.length === 1 && familyEmployeeB.data[0]?.id === familyRowB);
record('Global legacy role without tenant membership cannot read family rows',
  !familyGlobalOnly.error && familyGlobalOnly.data?.length === 0);
const directFamilyWrite = await employeeA.client.from('employee_family_members').insert({
  id: 'a3333333-3333-4333-8333-333333333333',
  employee_id: '55555555-5555-4555-8555-555555555555',
  name: 'Synthetic Unauthorized Dependent',
}).select('id');
record('Direct family table writes remain denied', !!directFamilyWrite.error);

const employeeDocumentPolicyState = queryAdmin(`SELECT jsonb_build_object(
  'rls_enabled', c.relrowsecurity,
  'manager_policy', (SELECT jsonb_build_object('permissive',permissive,'qual',qual)
    FROM pg_policies WHERE schemaname='public' AND tablename='employee_documents'
      AND policyname='employee_documents_admin_read'),
  'tenant_guard', (SELECT jsonb_build_object('permissive',permissive,'qual',qual)
    FROM pg_policies WHERE schemaname='public' AND tablename='employee_documents'
      AND policyname='employee_documents_tenant_read_guard'),
  'anon_select',has_table_privilege('anon','public.employee_documents','SELECT'),
  'authenticated_select',has_table_privilege('authenticated','public.employee_documents','SELECT'),
  'authenticated_truncate',has_table_privilege('authenticated','public.employee_documents','TRUNCATE'),
  'authenticated_trigger',has_table_privilege('authenticated','public.employee_documents','TRIGGER'),
  'authenticated_references',has_table_privilege('authenticated','public.employee_documents','REFERENCES'),
  'authenticated_privileges', COALESCE((
    SELECT jsonb_agg(p.privilege_type ORDER BY p.privilege_type)
    FROM aclexplode(COALESCE(c.relacl, acldefault('r'::"char", c.relowner))) p
    WHERE p.grantee=(SELECT oid FROM pg_roles WHERE rolname='authenticated')
  ), '[]'::jsonb)
) FROM pg_class c WHERE c.oid='public.employee_documents'::regclass`);
record('Employee-document metadata uses restrictive tenant RLS and removes excessive client grants',
  employeeDocumentPolicyState.rls_enabled === true
    && employeeDocumentPolicyState.manager_policy?.permissive === 'PERMISSIVE'
    && String(employeeDocumentPolicyState.manager_policy?.qual).includes('hris_employee_document_manager_read')
    && employeeDocumentPolicyState.tenant_guard?.permissive === 'RESTRICTIVE'
    && String(employeeDocumentPolicyState.tenant_guard?.qual).includes('hris_employee_document_own_read')
    && employeeDocumentPolicyState.anon_select === false
    && employeeDocumentPolicyState.authenticated_select === true
    && employeeDocumentPolicyState.authenticated_truncate === false
    && employeeDocumentPolicyState.authenticated_trigger === false
    && employeeDocumentPolicyState.authenticated_references === false
    && JSON.stringify(employeeDocumentPolicyState.authenticated_privileges) === '["SELECT"]',
  JSON.stringify(employeeDocumentPolicyState));

const [documentManagerA, documentManagerB, documentEmployeeA, documentEmployeeB,
  documentViewerA, documentGlobalOnly] = await Promise.all([
  managerA.client.from('employee_documents').select('id,employee_id,name').order('id'),
  managerB.client.from('employee_documents').select('id,employee_id,name').order('id'),
  employeeA.client.from('employee_documents').select('id,employee_id,name').order('id'),
  employeeB.client.from('employee_documents').select('id,employee_id,name').order('id'),
  employeesViewer.client.from('employee_documents').select('id,employee_id,name').order('id'),
  globalOnly.client.from('employee_documents').select('id,employee_id,name').order('id'),
]);
const documentRowA = 'a3333333-3333-4333-8333-333333333333';
const documentRowB = 'a4444444-4444-4444-8444-444444444444';
record('Employee-document managers and directory viewers read only documents in their active tenant',
  !documentManagerA.error && !documentManagerB.error && !documentViewerA.error
    && documentManagerA.data?.length === 2 && documentManagerA.data.some(row => row.id === documentRowA)
    && documentManagerB.data?.length === 1 && documentManagerB.data[0]?.id === documentRowB
    && documentViewerA.data?.length === 2 && documentViewerA.data.some(row => row.id === documentRowA));
record('Employees read only their own document metadata and global roles alone grant no document access',
  !documentEmployeeA.error && !documentEmployeeB.error && !documentGlobalOnly.error
    && documentEmployeeA.data?.length === 2 && documentEmployeeA.data.some(row => row.id === documentRowA)
    && documentEmployeeB.data?.length === 1 && documentEmployeeB.data[0]?.id === documentRowB
    && documentGlobalOnly.data?.length === 0);
const directAnonymousEmployeeDocuments = attemptAs(null,
  'SELECT id FROM public.employee_documents', 'anon');
record('Anonymous clients cannot read employee-document metadata', !directAnonymousEmployeeDocuments.ok);

const employeeDocumentStoragePath = `${employeeA.userId}/synthetic-document.pdf`;
const employeeDocumentUpload = await adminAuth.storage.from('employee-documents').upload(
  employeeDocumentStoragePath, new Blob(['synthetic employee document']),
  { contentType: 'application/pdf', upsert: false },
);
if (employeeDocumentUpload.error) throw employeeDocumentUpload.error;
employeeDocumentStoragePaths.push(employeeDocumentStoragePath);
const documentStorageOwner = await employeeA.client.storage.from('employee-documents').download(employeeDocumentStoragePath);
const documentStoragePeer = await employeeB.client.storage.from('employee-documents').download(employeeDocumentStoragePath);
const documentStorageManager = await managerA.client.storage.from('employee-documents').download(employeeDocumentStoragePath);
const documentStorageGlobalOnly = await globalOnly.client.storage.from('employee-documents').download(employeeDocumentStoragePath);
const documentStorageForeignManager = await managerB.client.storage.from('employee-documents').download(employeeDocumentStoragePath);
const documentStorageManagerSigned = await managerA.client.storage.from('employee-documents').createSignedUrl(employeeDocumentStoragePath, 60);
const documentStorageForeignSigned = await managerB.client.storage.from('employee-documents').createSignedUrl(employeeDocumentStoragePath, 60);
const documentStorageAnonymous = await createClient(services.API_URL, services.ANON_KEY, authOptions).storage.from('employee-documents').download(employeeDocumentStoragePath);
const employeeStorageAccessResults = {
  ownerAllowed: !documentStorageOwner.error,
  sameTenantManagerAllowed: !documentStorageManager.error,
  sameTenantSignedAllowed: !documentStorageManagerSigned.error && Boolean(documentStorageManagerSigned.data?.signedUrl),
  foreignEmployeeDenied: Boolean(documentStoragePeer.error),
  foreignManagerDenied: Boolean(documentStorageForeignManager.error),
  foreignSignedDenied: Boolean(documentStorageForeignSigned.error),
  globalOnlyDenied: Boolean(documentStorageGlobalOnly.error),
  anonymousDenied: Boolean(documentStorageAnonymous.error),
};
record('Private employee Storage permits own and authorized same-tenant manager downloads and signed URLs only',
  Object.values(employeeStorageAccessResults).every(Boolean),
  JSON.stringify(employeeStorageAccessResults));
// Authenticated tenant reviewers must retain access to business-linked
// historical documents. The departed employee's own self-service must
// fail closed. Update and restore only a disposable synthetic fixture.
let formerEmployeeDocumentResult = {};
psqlSync(`UPDATE public.employees SET employment_status='terminated'
  WHERE id='55555555-5555-4555-8555-555555555555'::uuid
    AND tenant_id='${ids.tenantA}'::uuid;`);
try {
  const [formerManager, formerOwner, formerForeign] = await Promise.all([
    managerA.client.storage.from('employee-documents').download(employeeDocumentStoragePath),
    employeeA.client.storage.from('employee-documents').download(employeeDocumentStoragePath),
    managerB.client.storage.from('employee-documents').download(employeeDocumentStoragePath),
  ]);
  formerEmployeeDocumentResult = {
    tenantReviewerAllowed: !formerManager.error,
    terminatedOwnerDenied: Boolean(formerOwner.error),
    foreignTenantDenied: Boolean(formerForeign.error),
  };
} finally {
  psqlSync(`UPDATE public.employees SET employment_status='active'
    WHERE id='55555555-5555-4555-8555-555555555555'::uuid
      AND tenant_id='${ids.tenantA}'::uuid;`);
}
record('WS02 historical employee evidence remains tenant-reviewable while terminated owner and foreign tenant are denied',
  Object.values(formerEmployeeDocumentResult).every(Boolean),
  JSON.stringify(formerEmployeeDocumentResult));
// Exercise the approved attendance-correction evidence_path contract with
// real tenant A/B Auth sessions through Storage, then restore the fixture row.
const attendanceGuardBucketBefore = await adminAuth.storage.getBucket('attendance-evidence');
if (attendanceGuardBucketBefore.error) {
  if (String(attendanceGuardBucketBefore.error.statusCode) !== '404') {
    throw attendanceGuardBucketBefore.error;
  }
  const created = await adminAuth.storage.createBucket('attendance-evidence', {
    public: false, fileSizeLimit: 10485760, allowedMimeTypes: ['application/pdf'],
  });
  if (created.error) throw created.error;
  createdAttendanceTenantGuardBucket = true;
} else if (attendanceGuardBucketBefore.data.public) {
  throw new Error('Refusing isolated attendance evidence test: bucket is public.');
}
const evidenceObjectA = `${employeeA.userId}/ws02-attendance-a.pdf`;
const evidenceObjectB = `${employeeB.userId}/ws02-attendance-b.pdf`;
for (const objectPath of [evidenceObjectA,evidenceObjectB]) {
  const uploaded = await adminAuth.storage.from('attendance-evidence').upload(
    objectPath, new Blob(['%PDF-1.4\\nSynthetic attendance evidence\\n'], { type:'application/pdf' }),
    { contentType:'application/pdf', upsert:false },
  );
  if (uploaded.error) throw uploaded.error;
  attendanceTenantGuardStoragePaths.push(objectPath);
}
psqlSync(`UPDATE public.attendance_corrections SET evidence_path=${sqlLiteral(evidenceObjectA)}
  WHERE id='cccccccc-0000-4000-8000-000000000001'::uuid AND tenant_id='${ids.tenantA}'::uuid;
  UPDATE public.attendance_corrections SET evidence_path=${sqlLiteral(evidenceObjectB)}
  WHERE id='cccccccc-0000-4000-8000-000000000003'::uuid AND tenant_id='${ids.tenantB}'::uuid;`);
try {
  const [ownerA, ownerB, managerLocalA, managerLocalB, managerForeign,
    employeeForeign, anonEvidence, signedLocal, signedForeign] = await Promise.all([
    employeeA.client.storage.from('attendance-evidence').download(evidenceObjectA),
    employeeB.client.storage.from('attendance-evidence').download(evidenceObjectB),
    managerA.client.storage.from('attendance-evidence').download(evidenceObjectA),
    managerB.client.storage.from('attendance-evidence').download(evidenceObjectB),
    managerA.client.storage.from('attendance-evidence').download(evidenceObjectB),
    employeeA.client.storage.from('attendance-evidence').download(evidenceObjectB),
    createClient(services.API_URL, services.ANON_KEY, authOptions).storage.from('attendance-evidence').download(evidenceObjectA),
    managerA.client.storage.from('attendance-evidence').createSignedUrl(evidenceObjectA,60),
    managerA.client.storage.from('attendance-evidence').createSignedUrl(evidenceObjectB,60),
  ]);
  record('WS02 attendance evidence: actual sessions enforce owner, manager tenant and signed-link issuance',
    !ownerA.error && !ownerB.error && !managerLocalA.error && !managerLocalB.error
      && !signedLocal.error && Boolean(signedLocal.data?.signedUrl)
      && Boolean(managerForeign.error) && Boolean(employeeForeign.error)
      && Boolean(anonEvidence.error) && Boolean(signedForeign.error));
} finally {
  psqlSync(`UPDATE public.attendance_corrections SET evidence_path=NULL
    WHERE id='cccccccc-0000-4000-8000-000000000001'::uuid AND tenant_id='${ids.tenantA}'::uuid;
    UPDATE public.attendance_corrections SET evidence_path=NULL
    WHERE id='cccccccc-0000-4000-8000-000000000003'::uuid AND tenant_id='${ids.tenantB}'::uuid;`);
}

const ownEmployeeDocuments = await employeeA.client.rpc('hris_get_my_employee_documents', { p_tenant_id: ids.tenantA });
const otherTenantEmployeeDocuments = await employeeA.client.rpc('hris_get_my_employee_documents', { p_tenant_id: ids.tenantB });
const crossTenantEmployeeDocuments = await employeeB.client.rpc('hris_get_my_employee_documents', { p_tenant_id: ids.tenantA });
const managerEmployeeDocuments = await managerA.client.rpc('hris_get_my_employee_documents', { p_tenant_id: ids.tenantA });
const anonymousEmployeeDocuments = await createClient(services.API_URL, services.ANON_KEY, authOptions)
  .rpc('hris_get_my_employee_documents', { p_tenant_id: ids.tenantA });
const ownDocumentRows = ownEmployeeDocuments.data?.documents;
const rejectedEmployeeDocument = ownDocumentRows?.find(row => row.id === 'a3333333-3333-4333-8333-333333333334');
record('Employee document self-service returns only own metadata and exposes correction reasons only for rejected documents',
  !ownEmployeeDocuments.error && ownEmployeeDocuments.data?.tenant_id === ids.tenantA
    && ownEmployeeDocuments.data?.employee_id === '55555555-5555-4555-8555-555555555555'
    && ownDocumentRows?.length === 2
    && ownDocumentRows.some(row => row.id === documentRowA && row.verification_note === null)
    && rejectedEmployeeDocument?.verification_note === 'Synthetic correction reason for the employee.');
record('Employee document self-service denies mismatched tenant, cross-tenant identity, manager, and anonymous sessions',
  Boolean(otherTenantEmployeeDocuments.error) && Boolean(crossTenantEmployeeDocuments.error)
    && Boolean(managerEmployeeDocuments.error) && Boolean(anonymousEmployeeDocuments.error));

const candidateStageHistoryAccess = queryAdmin(`SELECT jsonb_build_object(
  'rls_enabled', c.relrowsecurity,
  'public_select', EXISTS (
    SELECT 1
    FROM aclexplode(COALESCE(c.relacl, acldefault('r'::"char", c.relowner))) privilege
    WHERE privilege.grantee = 0 AND privilege.privilege_type = 'SELECT'
  ),
  'anon_select', has_table_privilege('anon', c.oid, 'SELECT'),
  'authenticated_select', has_table_privilege('authenticated', c.oid, 'SELECT'),
  'service_role_select', has_table_privilege('service_role', c.oid, 'SELECT')
) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'candidate_application_stage_history'`);
record('Candidate stage history keeps RLS enabled, denies direct client SELECT, and preserves server access',
  candidateStageHistoryAccess.rls_enabled === true
    && candidateStageHistoryAccess.public_select === false
    && candidateStageHistoryAccess.anon_select === false
    && candidateStageHistoryAccess.authenticated_select === false
    && candidateStageHistoryAccess.service_role_select === true,
  JSON.stringify(candidateStageHistoryAccess));

const foundationTables = [
  'employee_shift_assignments', 'roles', 'permissions', 'role_permissions', 'user_roles', 'admin_audit_logs',
];
const foundationReads = await Promise.all(foundationTables.map(async table => ({
  table,
  result: await employeeA.client.from(table).select('*').limit(1),
})));
const anonFoundationReads = await Promise.all([
  ...foundationTables, 'tenants', 'admin_users', 'tenant_memberships',
].map(async table => ({
  table,
  result: await createClient(services.API_URL, services.ANON_KEY, authOptions).from(table).select('*').limit(1),
})));
const memberAFoundations = await Promise.all([
  managerA.client.from('tenant_memberships').select('tenant_id,role,status'),
  managerA.client.from('admin_users').select('user_id,active,is_super_admin'),
  managerA.client.from('tenants').select('id,name').order('name'),
]);
const employeeATenants = await employeeA.client.from('tenants').select('id,name').order('name');
const superAdminTenants = await superAdmin.client.from('tenants').select('id,name').order('name');
const crossOwnerMembershipRead = await managerA.client.from('tenant_memberships').select('tenant_id,role,status')
  .eq('user_id', managerB.userId);
const directMembershipWrite = await managerA.client.from('tenant_memberships').update({ status: 'inactive' })
  .eq('user_id', managerA.userId).eq('tenant_id', '11111111-1111-4111-8111-111111111111');
const directAdminWrite = await managerA.client.from('admin_users').update({ is_super_admin: true })
  .eq('user_id', managerA.userId);
const directTenantWrite = await managerA.client.from('tenants').update({ name: 'Unauthorized tenant overwrite' })
  .eq('id', '11111111-1111-4111-8111-111111111111');
record('Foundation tables deny anonymous access and default-deny direct reads where no LiveApp projection exists',
  foundationReads.every(({ result }) => Boolean(result.error))
    && anonFoundationReads.every(({ result }) => Boolean(result.error)),
  JSON.stringify({ authenticatedDenied: foundationReads.filter(({ result }) => result.error).length,
    authenticatedTotal: foundationReads.length, anonymousDenied: anonFoundationReads.filter(({ result }) => result.error).length,
    anonymousTotal: anonFoundationReads.length }));
record('LiveApp foundation reads are restricted to own membership/admin row and authorized tenant list',
  !memberAFoundations[0].error && memberAFoundations[0].data.length === 1
    && memberAFoundations[0].data[0].tenant_id === '11111111-1111-4111-8111-111111111111'
    && !memberAFoundations[1].error && memberAFoundations[1].data.length === 1
    && memberAFoundations[1].data[0].user_id === managerA.userId
    && !memberAFoundations[2].error && memberAFoundations[2].data.map(row => row.id).join() === '11111111-1111-4111-8111-111111111111'
    && !employeeATenants.error && employeeATenants.data.map(row => row.id).join() === '11111111-1111-4111-8111-111111111111'
    && !superAdminTenants.error && superAdminTenants.data.length === 2
    && !crossOwnerMembershipRead.error && crossOwnerMembershipRead.data.length === 0,
  JSON.stringify({ managerMembershipRows: memberAFoundations[0].data?.length,
    managerAdminRows: memberAFoundations[1].data?.length,
    managerTenants: memberAFoundations[2].data?.map(row => row.id),
    employeeTenants: employeeATenants.data?.map(row => row.id),
    superAdminTenantCount: superAdminTenants.data?.length,
    crossOwnerRows: crossOwnerMembershipRead.data?.length }));
record('Foundation table direct mutations are denied without changing membership, tenant, or admin data',
  Boolean(directMembershipWrite.error) && Boolean(directAdminWrite.error) && Boolean(directTenantWrite.error)
    && queryAdmin(`SELECT jsonb_build_object(
      'membership', (SELECT status FROM public.tenant_memberships WHERE user_id='${managerA.userId}'::uuid AND tenant_id='11111111-1111-4111-8111-111111111111'::uuid),
      'super_admin', (SELECT is_super_admin FROM public.admin_users WHERE user_id='${managerA.userId}'::uuid),
      'tenant_name', (SELECT name FROM public.tenants WHERE id='11111111-1111-4111-8111-111111111111'::uuid)
    )`).membership === 'active'
    && queryAdmin(`SELECT jsonb_build_object('value',is_super_admin) FROM public.admin_users WHERE user_id='${managerA.userId}'::uuid`).value === false
    && queryAdmin(`SELECT jsonb_build_object('value',name) FROM public.tenants WHERE id='11111111-1111-4111-8111-111111111111'::uuid`).value === 'Synthetic Synesis',
  JSON.stringify({ membershipError: directMembershipWrite.error?.code || null,
    adminError: directAdminWrite.error?.code || null, tenantError: directTenantWrite.error?.code || null }));

const learningIds = {
  directProgram: '90000000-0000-4000-8000-000000000001',
  approvalProgram: '90000000-0000-4000-8000-000000000002',
  fullProgram: '90000000-0000-4000-8000-000000000003',
  tenantBProgram: '90000000-0000-4000-8000-000000000004',
  concurrentProgram: '90000000-0000-4000-8000-000000000006',
  directSession: '91000000-0000-4000-8000-000000000001',
  approvalSession: '91000000-0000-4000-8000-000000000002',
  fullSession: '91000000-0000-4000-8000-000000000003',
  tenantBSession: '91000000-0000-4000-8000-000000000004',
  concurrentSession: '91000000-0000-4000-8000-000000000005',
  approvalCapacityProgram: '90000000-0000-4000-8000-000000000007',
  approvalCapacitySession: '91000000-0000-4000-8000-000000000006',
  mandatoryEnrollment: '92000000-0000-4000-8000-000000000003',
  completionBrowserEnrollment: '92000000-0000-4000-8000-000000000008',
  managerApprovalRequest: '92000000-0000-4000-8000-000000000004',
  managerRejectionRequest: '92000000-0000-4000-8000-000000000005',
  capacityRequestOne: '92000000-0000-4000-8000-000000000006',
  capacityRequestTwo: '92000000-0000-4000-8000-000000000007',
};
const payslipA = await employeeA.client.rpc('hris_get_my_payslips', { p_tenant_id: ids.tenantA });
const payslipB = await employeeB.client.rpc('hris_get_my_payslips', { p_tenant_id: ids.tenantB });
const payslipCrossTenant = await employeeA.client.rpc('hris_get_my_payslips', { p_tenant_id: ids.tenantB });
const payslipNoPermission = await noPermission.client.rpc('hris_get_my_payslips', { p_tenant_id: ids.tenantA });
const payslipGlobalOnly = await globalOnly.client.rpc('hris_get_my_payslips', { p_tenant_id: ids.tenantA });
const payslipAnonymous = await createClient(services.API_URL, services.ANON_KEY, authOptions)
  .rpc('hris_get_my_payslips', { p_tenant_id: ids.tenantA });
const payslipAcl = queryAdmin(`SELECT jsonb_build_object(
  'anon',has_function_privilege('anon','public.hris_get_my_payslips(uuid)','EXECUTE'),
  'authenticated',has_function_privilege('authenticated','public.hris_get_my_payslips(uuid)','EXECUTE'),
  'rls', (SELECT relrowsecurity FROM pg_class WHERE oid='public.payslips'::regclass))`);
const payrollRegister = await payrollViewerA.client.rpc('hris_get_tenant_payroll_register', {
  p_tenant_id: ids.tenantA, p_pay_period_id: null, p_status: null, p_search: null, p_limit: 25, p_offset: 0,
});
const payrollRegisterReleased = await payrollViewerA.client.rpc('hris_get_tenant_payroll_register', {
  p_tenant_id: ids.tenantA, p_pay_period_id: null, p_status: 'released', p_search: 'QA-A-001', p_limit: 25, p_offset: 0,
});
const payrollRegisterPage = await payrollViewerA.client.rpc('hris_get_tenant_payroll_register', {
  p_tenant_id: ids.tenantA, p_pay_period_id: null, p_status: null, p_search: null, p_limit: 2, p_offset: 2,
});
const payrollRegisterCrossTenant = await payrollViewerA.client.rpc('hris_get_tenant_payroll_register', {
  p_tenant_id: ids.tenantB, p_pay_period_id: null, p_status: null, p_search: null, p_limit: 25, p_offset: 0,
});
const payrollRegisterForeignPeriod = await payrollViewerA.client.rpc('hris_get_tenant_payroll_register', {
  p_tenant_id: ids.tenantA, p_pay_period_id: '99999999-0000-4000-8000-000000000002',
  p_status: null, p_search: null, p_limit: 25, p_offset: 0,
});
const payrollRegisterInvalidStatus = await payrollViewerA.client.rpc('hris_get_tenant_payroll_register', {
  p_tenant_id: ids.tenantA, p_pay_period_id: null, p_status: 'pending', p_search: null, p_limit: 25, p_offset: 0,
});
const payrollRegisterNoPermission = await noPermission.client.rpc('hris_get_tenant_payroll_register', {
  p_tenant_id: ids.tenantA, p_pay_period_id: null, p_status: null, p_search: null, p_limit: 25, p_offset: 0,
});
const payrollRegisterGlobalOnly = await globalOnly.client.rpc('hris_get_tenant_payroll_register', {
  p_tenant_id: ids.tenantA, p_pay_period_id: null, p_status: null, p_search: null, p_limit: 25, p_offset: 0,
});
const payrollRegisterEmployee = await employeeA.client.rpc('hris_get_tenant_payroll_register', {
  p_tenant_id: ids.tenantA, p_pay_period_id: null, p_status: null, p_search: null, p_limit: 25, p_offset: 0,
});
const payrollRegisterAnonymous = await createClient(services.API_URL, services.ANON_KEY, authOptions)
  .rpc('hris_get_tenant_payroll_register', {
    p_tenant_id: ids.tenantA, p_pay_period_id: null, p_status: null, p_search: null, p_limit: 25, p_offset: 0,
  });
const payrollRegisterAcl = queryAdmin(`SELECT jsonb_build_object(
  'anon',has_function_privilege('anon','public.hris_get_tenant_payroll_register(uuid,uuid,text,text,integer,integer)','EXECUTE'),
  'authenticated',has_function_privilege('authenticated','public.hris…109838 tokens truncated… ...travelDecisionNotificationIntegrity }));
const releaseNotificationsDirectA = await employeeA.client.from('hris_in_app_notifications').select('id,tenant_id')
  .eq('tenant_id', ids.tenantA);
const releaseNotificationsDirectForeign = await employeeB.client.from('hris_in_app_notifications').select('id')
  .eq('tenant_id', ids.tenantA);
const releaseNotificationRowsA = releaseNotificationsA.data?.notifications || [];
record('Eligible task-review notification is visible only to its reviewer in the active tenant',
  !releaseNotificationsA.error && releaseNotificationsA.data.unread_count === 1
    && releaseNotificationRowsA.length === 1
    && releaseNotificationRowsA[0].task_id === projectTaskId
    && releaseNotificationRowsA[0].review_status === 'pending'
    && !releaseNotificationsB.error && releaseNotificationsB.data.notifications.length === 0
    && !releaseNotificationsTenantB.error && releaseNotificationsTenantB.data.notifications.length === 0
    && !releaseNotificationsDirectA.error && releaseNotificationsDirectA.data.length === 1
    && !releaseNotificationsDirectForeign.error && releaseNotificationsDirectForeign.data.length === 0,
  JSON.stringify({ reviewerUnread: releaseNotificationsA.data?.unread_count,
    reviewerRows: releaseNotificationRowsA.length,
    otherTenantMemberRows: releaseNotificationsDirectForeign.data?.length }));

const taskStart = await employeeA.client.rpc('hris_start_project_task', { p_tenant_id: ids.tenantA, p_task_id: projectTaskId });
const taskCompleteDenied = await managerA.client.rpc('hris_complete_project_task', { p_tenant_id: ids.tenantA, p_task_id: projectTaskId });
const taskCompleteBySuperAdmin = await superAdmin.client.rpc('hris_complete_project_task', { p_tenant_id: ids.tenantA, p_task_id: projectTaskId });
const taskComplete = await employeeA.client.rpc('hris_complete_project_task', { p_tenant_id: ids.tenantA, p_task_id: projectTaskId });
const completedTaskEdit = await employeeA.client.rpc('hris_update_project_task', {
  p_tenant_id: ids.tenantA, p_task_id: projectTaskId, p_title: 'Completed task must remain unchanged',
  p_description: 'Completed work history is immutable.', p_due_date: null,
});
const completedTaskWorkspace = await employeeA.client.rpc('hris_get_project_task_workspace', {
  p_tenant_id: ids.tenantA, p_project_id: projectA.id,
});
const duplicateTaskComplete = await employeeA.client.rpc('hris_complete_project_task', { p_tenant_id: ids.tenantA, p_task_id: projectTaskId });
record('Assigned Project Manager completes operational work while two mandatory reviews remain pending',
  !taskStart.error && Boolean(taskCompleteDenied.error?.code === '42501')
    && Boolean(taskCompleteBySuperAdmin.error?.code === '42501') && !taskComplete.error
    && Boolean(completedTaskEdit.error?.code === '42501')
    && taskComplete.data?.task?.status === 'completed' && taskComplete.data?.feedback_pending === 2
    && !completedTaskWorkspace.error && completedTaskWorkspace.data.tasks[0].feedback_pending === 2
    && Boolean(duplicateTaskComplete.error));

const followupTask = await employeeA.client.rpc('hris_create_project_task', {
  p_tenant_id: ids.tenantA, p_project_id: projectA.id, p_title: 'Synthetic follow-up task',
  p_description: 'Exercise member addition and release after task creation.',
  p_due_date: null, p_project_allocation_ids: [allocationA60.data?.id],
});
const unauthorizedTaskMemberAdd = await managerA.client.rpc('hris_assign_project_task_member', {
  p_tenant_id: ids.tenantA, p_task_id: followupTask.data?.id,
  p_project_allocation_id: taskMemberAllocation.data?.id,
});
const authorizedTaskMemberAdd = await employeeA.client.rpc('hris_assign_project_task_member', {
  p_tenant_id: ids.tenantA, p_task_id: followupTask.data?.id,
  p_project_allocation_id: taskMemberAllocation.data?.id,
});
const followupWorkspace = await employeeA.client.rpc('hris_get_project_task_workspace', {
  p_tenant_id: ids.tenantA, p_project_id: projectA.id,
});
const followupMemberAssignment = followupWorkspace.data?.tasks?.find(task => task.id === followupTask.data?.id)
  ?.members?.find(row => row.employee_id === '55555555-5555-4555-8555-555555555556');
const followupMemberRelease = await employeeA.client.rpc('hris_release_project_task_member', {
  p_tenant_id: ids.tenantA, p_task_assignment_id: followupMemberAssignment?.id,
});
const followupManagerAssignment = followupWorkspace.data?.tasks?.find(task => task.id === followupTask.data?.id)
  ?.members?.find(row => row.employee_id === '55555555-5555-4555-8555-555555555555');
const followupManagerRelease = await employeeA.client.rpc('hris_release_project_task_member', {
  p_tenant_id: ids.tenantA, p_task_assignment_id: followupManagerAssignment?.id,
});
const followupReviewerInbox = await employeeA.client.rpc('hris_get_my_project_peer_reviews', { p_tenant_id: ids.tenantA });
const releasedReviewerObligation = (followupReviewerInbox.data?.reviews || []).find(row =>
  row.task_id === followupTask.data?.id
  && row.reviewer_employee_id === '55555555-5555-4555-8555-555555555555'
  && row.reviewee_employee_id === '55555555-5555-4555-8555-555555555556');
const releasedReviewerSubmission = await employeeA.client.rpc('hris_submit_project_peer_review', {
  p_tenant_id: ids.tenantA, p_review_id: releasedReviewerObligation?.id,
  p_scores: { quality_of_work: 4, collaboration_teamwork: 4, delivery_reliability: 3, ownership_communication: 5 },
  p_not_observed: [], p_comments: 'Synthetic review submitted after reviewer release.',
});
const followupCompletion = await employeeA.client.rpc('hris_complete_project_task', {
  p_tenant_id: ids.tenantA, p_task_id: followupTask.data?.id,
});
const followupReviewState = queryAdmin(`SELECT jsonb_build_object(
  'count',count(*)::integer,
  'submitted',count(*) FILTER (WHERE r.status='submitted')::integer,
  'reviewer_released',COALESCE(bool_or(r.status='submitted' AND reviewer.released_at IS NOT NULL),false),
  'reviewee_released',COALESCE(bool_or(r.status='submitted' AND reviewee.released_at IS NOT NULL),false))
  FROM public.project_task_peer_reviews r
  JOIN public.project_task_assignments reviewer ON reviewer.tenant_id=r.tenant_id AND reviewer.id=r.reviewer_task_assignment_id
  JOIN public.project_task_assignments reviewee ON reviewee.tenant_id=r.tenant_id AND reviewee.id=r.reviewee_task_assignment_id
  WHERE r.tenant_id='${ids.tenantA}'::uuid AND r.task_id='${followupTask.data?.id}'::uuid`);
const followupReviewCount = queryAdmin(`SELECT jsonb_build_object('count',count(*)::integer)
  FROM public.project_task_peer_reviews WHERE tenant_id='${ids.tenantA}'::uuid AND task_id='${followupTask.data?.id}'::uuid`);
record('Released reviewers can submit their eligible task review and task completion stays non-blocking',
  !followupTask.error && Boolean(unauthorizedTaskMemberAdd.error?.code === '42501')
    && !authorizedTaskMemberAdd.error && !followupMemberRelease.error
    && !followupManagerRelease.error && !followupReviewerInbox.error
    && Boolean(releasedReviewerObligation?.id) && !releasedReviewerSubmission.error
    && !followupCompletion.error && followupCompletion.data?.task?.status === 'completed'
    && followupCompletion.data?.feedback_pending === 1
    && followupReviewCount.count === 2 && followupReviewState.count === 2
    && followupReviewState.submitted === 1 && followupReviewState.reviewer_released && followupReviewState.reviewee_released);

const reviewMemberA = await employeeA.client.rpc('hris_get_my_project_peer_reviews', { p_tenant_id: ids.tenantA });
const reviewMemberB = await managerA2.client.rpc('hris_get_my_project_peer_reviews', { p_tenant_id: ids.tenantA });
const reviewTenantB = await employeeB.client.rpc('hris_get_my_project_peer_reviews', { p_tenant_id: ids.tenantB });
const reviewIdsA = reviewMemberA.data?.reviews || [];
const reviewIdsB = reviewMemberB.data?.reviews || [];
const reviewAtoB = reviewIdsA.find(row => row.reviewer_employee_id === '55555555-5555-4555-8555-555555555555'
  && row.reviewee_employee_id === '55555555-5555-4555-8555-555555555556' && row.task_id === projectTaskId);
const reviewBtoA = reviewIdsB.find(row => row.reviewer_employee_id === '55555555-5555-4555-8555-555555555556'
  && row.reviewee_employee_id === '55555555-5555-4555-8555-555555555555' && row.task_id === projectTaskId);
const unauthorizedReviewSubmit = await employeeA.client.rpc('hris_submit_project_peer_review', {
  p_tenant_id: ids.tenantA, p_review_id: reviewBtoA?.id,
  p_scores: { quality_of_work: 3, collaboration_teamwork: 3, delivery_reliability: 3, ownership_communication: 3 },
  p_not_observed: [], p_comments: '',
});
const invalidReviewScore = await managerA2.client.rpc('hris_submit_project_peer_review', {
  p_tenant_id: ids.tenantA, p_review_id: reviewBtoA?.id,
  p_scores: { quality_of_work: 6, collaboration_teamwork: 3, delivery_reliability: 3, ownership_communication: 3 },
  p_not_observed: [], p_comments: '',
});
const submitReviewB = await managerA2.client.rpc('hris_submit_project_peer_review', {
  p_tenant_id: ids.tenantA, p_review_id: reviewBtoA?.id,
  p_scores: { quality_of_work: 5, collaboration_teamwork: null, delivery_reliability: 0, ownership_communication: 4 },
  p_not_observed: ['collaboration_teamwork'], p_comments: 'Synthetic verified peer feedback.',
});
const submitReviewA = await employeeA.client.rpc('hris_submit_project_peer_review', {
  p_tenant_id: ids.tenantA, p_review_id: reviewAtoB?.id,
  p_scores: { quality_of_work: 0, collaboration_teamwork: 4, delivery_reliability: 5, ownership_communication: 3 },
  p_not_observed: [], p_comments: 'Synthetic reciprocal feedback.',
});
const duplicateReviewSubmission = await employeeA.client.rpc('hris_submit_project_peer_review', {
  p_tenant_id: ids.tenantA, p_review_id: reviewAtoB?.id,
  p_scores: { quality_of_work: 5, collaboration_teamwork: 5, delivery_reliability: 5, ownership_communication: 5 },
  p_not_observed: [], p_comments: 'This second submission must not overwrite the original review.',
});
const reviewEmployeeHistory = await employeeA.client.rpc('hris_get_my_project_peer_reviews', { p_tenant_id: ids.tenantA });
const reviewsFromOtherTenant = await employeeB.client.rpc('hris_get_my_project_peer_reviews', { p_tenant_id: ids.tenantB });
const revieweeDirectRead = await employeeA.client.from('project_task_peer_reviews').select('id,status,reviewer_employee_id,employee_id')
  .eq('tenant_id', ids.tenantA).eq('id', reviewBtoA?.id);
const ordinaryAdminReviewRead = await managerA.client.from('project_task_peer_reviews').select('id').eq('tenant_id', ids.tenantA);
const completedWorkspaceAfterReviews = await employeeA.client.rpc('hris_get_project_task_workspace', {
  p_tenant_id: ids.tenantA, p_project_id: projectA.id,
});
const reviewRowsAfterSubmit = queryAdmin(`SELECT jsonb_build_object(
  'count',count(*)::integer,'all_submitted',bool_and(status='submitted'),
  'not_observed_separate',bool_or(collaboration_teamwork_not_observed AND collaboration_teamwork_score IS NULL),
  'zero_score',bool_or(quality_of_work_score=0),'self_review_count',count(*) FILTER (WHERE reviewer_employee_id=employee_id)::integer)
  FROM public.project_task_peer_reviews WHERE tenant_id='${ids.tenantA}'::uuid AND task_id='${projectTaskId}'::uuid`);
const submittedReviewNotificationsA = await employeeA.client.rpc('hris_get_my_project_notifications', {
  p_tenant_id: ids.tenantA, p_limit: 100, p_before_created_at: null, p_before_id: null,
});
const submittedReviewNotificationsB = await managerA2.client.rpc('hris_get_my_project_notifications', {
  p_tenant_id: ids.tenantA, p_limit: 100, p_before_created_at: null, p_before_id: null,
});
const submittedNotificationA = submittedReviewNotificationsA.data?.notifications?.find(row => row.peer_review_id === reviewAtoB?.id);
const submittedNotificationB = submittedReviewNotificationsB.data?.notifications?.find(row => row.peer_review_id === reviewBtoA?.id);
const closedFeedbackCount = completedWorkspaceAfterReviews.data?.tasks?.find(task => task.id === projectTaskId)?.feedback_pending;
record('Peer-review authorization, score validation, self-review exclusion, and history visibility',
  Boolean(reviewAtoB) && Boolean(reviewBtoA)
    && Boolean(unauthorizedReviewSubmit.error?.code === '42501') && Boolean(invalidReviewScore.error?.code === '22023')
    && !submitReviewB.error && !submitReviewA.error
    && Boolean(duplicateReviewSubmission.error?.code === '42501')
    && !reviewEmployeeHistory.error && reviewEmployeeHistory.data.reviews.some(row => row.id === reviewBtoA?.id && row.status === 'submitted')
    && !reviewsFromOtherTenant.error && reviewsFromOtherTenant.data.reviews.length === 0
    && !revieweeDirectRead.error && revieweeDirectRead.data.length === 1
    && !ordinaryAdminReviewRead.error && ordinaryAdminReviewRead.data.length === 0
    && !completedWorkspaceAfterReviews.error
    && !submittedReviewNotificationsA.error && !submittedReviewNotificationsB.error
    && Boolean(submittedNotificationA?.read_at) && Boolean(submittedNotificationB?.read_at)
    && reviewRowsAfterSubmit.count === 2 && reviewRowsAfterSubmit.all_submitted
    && reviewRowsAfterSubmit.not_observed_separate && reviewRowsAfterSubmit.zero_score
    && reviewRowsAfterSubmit.self_review_count === 0 && closedFeedbackCount === 0,
  JSON.stringify({
    reviewAtoB: Boolean(reviewAtoB), reviewBtoA: Boolean(reviewBtoA),
    unauthorizedCode: unauthorizedReviewSubmit.error?.code, invalidScoreCode: invalidReviewScore.error?.code,
    duplicateSubmissionCode: duplicateReviewSubmission.error?.code,
    submitBError: submitReviewB.error?.message, submitAError: submitReviewA.error?.message,
    ownHistoryError: reviewEmployeeHistory.error?.message, foreignReviewCount: reviewsFromOtherTenant.data?.reviews?.length,
    incomingRows: revieweeDirectRead.data?.length, adminReviewRows: ordinaryAdminReviewRead.data?.length,
    counts: reviewRowsAfterSubmit, feedbackPending: closedFeedbackCount,
  }));

const ordinaryAdminAssignment = await managerA.client.rpc('hris_assign_tenant_project_allocation', {
  p_tenant_id: ids.tenantA, p_project_id: projectA.id,
  p_employee_id: '55555555-5555-4555-8555-555555555555',
  p_role_on_project: 'Unauthorized', p_allocation_percentage: 1,
  p_assigned_date: localCurrentDate, p_release_date: null,
});
const ordinaryManagerAssignment = await managerB.client.rpc('hris_assign_tenant_project_allocation', {
  p_tenant_id: ids.tenantB, p_project_id: projectB.id,
  p_employee_id: '66666666-6666-4666-8666-666666666666',
  p_role_on_project: 'Unauthorized', p_allocation_percentage: 1,
  p_assigned_date: localCurrentDate, p_release_date: null,
});
const crossTenantAssignment = await managerB.client.rpc('hris_assign_tenant_project_allocation', {
  p_tenant_id: ids.tenantA, p_project_id: projectA.id,
  p_employee_id: '55555555-5555-4555-8555-555555555555',
  p_role_on_project: 'Contributor', p_allocation_percentage: 10,
  p_assigned_date: localCurrentDate, p_release_date: null,
});
const directAllocationWrite = attemptAs(managerA, `INSERT INTO public.project_allocations
  (tenant_id,project_id,employee_id,allocation_percentage,assigned_date) VALUES
  ('${ids.tenantA}'::uuid,'${projectA.id}'::uuid,'55555555-5555-4555-8555-555555555555'::uuid,5,'${localCurrentDate}'::date)`);
record('Ordinary Admin, ordinary Manager, cross-tenant, and direct allocation writes are denied',
  Boolean(ordinaryAdminAssignment.error) && Boolean(ordinaryManagerAssignment.error)
    && Boolean(crossTenantAssignment.error) && !directAllocationWrite.ok);

const myProjectsA = await employeeA.client.rpc('hris_get_my_projects', { p_tenant_id: ids.tenantA });
const myProjectsB = await employeeB.client.rpc('hris_get_my_projects', { p_tenant_id: ids.tenantB });
const employeeOtherTenant = await employeeA.client.rpc('hris_get_my_projects', { p_tenant_id: ids.tenantB });
const employeeDirectAllocations = await employeeA.client.from('project_allocations')
  .select('id,tenant_id,employee_id').eq('tenant_id', ids.tenantA);
record('Employee project view exposes only linked employee allocations and denies a foreign tenant',
  !myProjectsA.error && myProjectsA.data.projects.length === 2
    && !myProjectsB.error && myProjectsB.data.projects.length === 0
    && Boolean(employeeOtherTenant.error)
    && !employeeDirectAllocations.error
    && employeeDirectAllocations.data.length === 3
    && employeeDirectAllocations.data.every(row => ['55555555-5555-4555-8555-555555555555', '55555555-5555-4555-8555-555555555556'].includes(row.employee_id)));

const staggeredEmployeeAllocation = await employeeA.client.rpc('hris_assign_tenant_project_allocation', {
  p_tenant_id: ids.tenantA, p_project_id: projectA.id,
  p_employee_id: '55555555-5555-4555-8555-555555555557',
  p_role_on_project: 'Early collaborator', p_allocation_percentage: 10,
  p_assigned_date: localCurrentDate, p_release_date: null,
});
const lateCollaboratorAllocation = await employeeA.client.rpc('hris_assign_tenant_project_allocation', {
  p_tenant_id: ids.tenantA, p_project_id: projectA.id,
  p_employee_id: '55555555-5555-4555-8555-555555555560',
  p_role_on_project: 'Late collaborator', p_allocation_percentage: 10,
  p_assigned_date: localCurrentDate, p_release_date: null,
});
const releaseObserverAllocation = await employeeA.client.rpc('hris_assign_tenant_project_allocation', {
  p_tenant_id: ids.tenantA, p_project_id: projectA.id,
  p_employee_id: '55555555-5555-4555-8555-555555555559',
  p_role_on_project: 'Release overlap observer', p_allocation_percentage: 10,
  p_assigned_date: localCurrentDate, p_release_date: null,
});
const staggeredTask = await employeeA.client.rpc('hris_create_project_task', {
  p_tenant_id: ids.tenantA, p_project_id: projectA.id, p_title: 'Synthetic staggered overlap task',
  p_description: 'Only task members with overlapping assignment intervals are eligible reviewers.',
  p_due_date: null, p_project_allocation_ids: [staggeredEmployeeAllocation.data?.id],
});
const addOverlappingMember = await employeeA.client.rpc('hris_assign_project_task_member', {
  p_tenant_id: ids.tenantA, p_task_id: staggeredTask.data?.id,
  p_project_allocation_id: taskMemberAllocation.data?.id,
});
const addSecondOverlappingMember = await employeeA.client.rpc('hris_assign_project_task_member', {
  p_tenant_id: ids.tenantA, p_task_id: staggeredTask.data?.id,
  p_project_allocation_id: releaseObserverAllocation.data?.id,
});
const staggeredWorkspace = await employeeA.client.rpc('hris_get_project_task_workspace', {
  p_tenant_id: ids.tenantA, p_project_id: projectA.id,
});
const releasedOverlappingMember = staggeredWorkspace.data?.tasks?.find(task => task.id === staggeredTask.data?.id)
  ?.members?.find(row => row.employee_id === '55555555-5555-4555-8555-555555555556');
const releaseBeforeLateMember = await employeeA.client.rpc('hris_release_project_task_member', {
  p_tenant_id: ids.tenantA, p_task_assignment_id: releasedOverlappingMember?.id,
});
const releaseReviewSnapshot = queryAdmin(`SELECT jsonb_build_object(
  'count',count(*)::integer,
  'distinct_reviewers',count(DISTINCT reviewer_employee_id)::integer,
  'all_review_released_member',COALESCE(bool_and(employee_id='55555555-5555-4555-8555-555555555556'::uuid),false),
  'all_overlapping_reviewers',COALESCE(bool_and(reviewer_employee_id IN (
    '55555555-5555-4555-8555-555555555557'::uuid,'55555555-5555-4555-8555-555555555559'::uuid)),false),
  'self_review_count',count(*) FILTER (WHERE reviewer_employee_id=employee_id)::integer)
  FROM public.project_task_peer_reviews WHERE tenant_id='${ids.tenantA}'::uuid AND task_id='${staggeredTask.data?.id}'::uuid`);
const addNonOverlappingMember = await employeeA.client.rpc('hris_assign_project_task_member', {
  p_tenant_id: ids.tenantA, p_task_id: staggeredTask.data?.id,
  p_project_allocation_id: lateCollaboratorAllocation.data?.id,
});
const staggeredCompletion = await employeeA.client.rpc('hris_complete_project_task', {
  p_tenant_id: ids.tenantA, p_task_id: staggeredTask.data?.id,
});
const staggeredReviewPairs = queryAdmin(`SELECT jsonb_build_object(
  'count',count(*)::integer,
  'all_expected',COALESCE(bool_and(
    (reviewer_employee_id='55555555-5555-4555-8555-555555555557'::uuid AND employee_id='55555555-5555-4555-8555-555555555556'::uuid)
    OR (reviewer_employee_id='55555555-5555-4555-8555-555555555556'::uuid AND employee_id='55555555-5555-4555-8555-555555555557'::uuid)
    OR (reviewer_employee_id='55555555-5555-4555-8555-555555555559'::uuid AND employee_id='55555555-5555-4555-8555-555555555556'::uuid)
    OR (reviewer_employee_id='55555555-5555-4555-8555-555555555556'::uuid AND employee_id='55555555-5555-4555-8555-555555555559'::uuid)
    OR (reviewer_employee_id='55555555-5555-4555-8555-555555555557'::uuid AND employee_id='55555555-5555-4555-8555-555555555560'::uuid)
    OR (reviewer_employee_id='55555555-5555-4555-8555-555555555560'::uuid AND employee_id='55555555-5555-4555-8555-555555555557'::uuid)
    OR (reviewer_employee_id='55555555-5555-4555-8555-555555555559'::uuid AND employee_id='55555555-5555-4555-8555-555555555560'::uuid)
    OR (reviewer_employee_id='55555555-5555-4555-8555-555555555560'::uuid AND employee_id='55555555-5555-4555-8555-555555555559'::uuid)
    OR (reviewer_employee_id='55555555-5555-4555-8555-555555555557'::uuid AND employee_id='55555555-5555-4555-8555-555555555559'::uuid)
    OR (reviewer_employee_id='55555555-5555-4555-8555-555555555559'::uuid AND employee_id='55555555-5555-4555-8555-555555555557'::uuid)
    ),false),
  'nonoverlap_pair_count',count(*) FILTER (WHERE
    (reviewer_employee_id='55555555-5555-4555-8555-555555555556'::uuid AND employee_id='55555555-5555-4555-8555-555555555560'::uuid)
    OR (reviewer_employee_id='55555555-5555-4555-8555-555555555560'::uuid AND employee_id='55555555-5555-4555-8555-555555555556'::uuid))::integer)
  FROM public.project_task_peer_reviews WHERE tenant_id='${ids.tenantA}'::uuid AND task_id='${staggeredTask.data?.id}'::uuid`);
const lateCollaboratorInbox = await employeeClock.client.rpc('hris_get_my_project_peer_reviews', { p_tenant_id: ids.tenantA });
const reviewAssignedToOverlappingMember = queryAdmin(`SELECT jsonb_build_object('id',id::text)
  FROM public.project_task_peer_reviews
  WHERE tenant_id='${ids.tenantA}'::uuid AND task_id='${staggeredTask.data?.id}'::uuid
    AND reviewer_employee_id='55555555-5555-4555-8555-555555555556'::uuid
    AND employee_id='55555555-5555-4555-8555-555555555557'::uuid`);
const nonOverlappingSubmission = await employeeClock.client.rpc('hris_submit_project_peer_review', {
  p_tenant_id: ids.tenantA, p_review_id: reviewAssignedToOverlappingMember.id,
  p_scores: { quality_of_work: 3, collaboration_teamwork: 3, delivery_reliability: 3, ownership_communication: 3 },
  p_not_observed: [], p_comments: '',
});
// A privileged synthetic row models a stale/corrupt pending obligation. The
// submission RPC must independently reject the non-overlapping pair even
// though the task is completed and the reviewer belongs to this tenant.
const injectedNonOverlappingReview = queryAdmin(`INSERT INTO public.project_task_peer_reviews(
  tenant_id,project_id,task_id,reviewer_task_assignment_id,reviewer_project_allocation_id,
  reviewer_employee_id,reviewee_task_assignment_id,reviewee_project_allocation_id,employee_id
) SELECT reviewer.tenant_id,reviewer.project_id,reviewer.task_id,reviewer.id,reviewer.project_allocation_id,
    reviewer.employee_id,reviewee.id,reviewee.project_allocation_id,reviewee.employee_id
  FROM public.project_task_assignments reviewer
  JOIN public.project_task_assignments reviewee ON reviewee.tenant_id=reviewer.tenant_id
    AND reviewee.project_id=reviewer.project_id AND reviewee.task_id=reviewer.task_id
  WHERE reviewer.tenant_id='${ids.tenantA}'::uuid AND reviewer.task_id='${staggeredTask.data?.id}'::uuid
    AND reviewer.employee_id='55555555-5555-4555-8555-555555555556'::uuid
    AND reviewee.employee_id='55555555-5555-4555-8555-555555555560'::uuid
  RETURNING jsonb_build_object('id',id::text)`);
const injectedNonOverlappingSubmission = await managerA2.client.rpc('hris_submit_project_peer_review', {
  p_tenant_id: ids.tenantA, p_review_id: injectedNonOverlappingReview.id,
  p_scores: { quality_of_work: 3, collaboration_teamwork: 3, delivery_reliability: 3, ownership_communication: 3 },
  p_not_observed: [], p_comments: 'This synthetic non-overlapping review must not be accepted.',
});
const injectedReviewState = queryAdmin(`SELECT jsonb_build_object('status',status)
  FROM public.project_task_peer_reviews WHERE tenant_id='${ids.tenantA}'::uuid AND id='${injectedNonOverlappingReview.id}'::uuid`);
record('Peer-review obligations include only collaborators with overlapping task assignments',
  !staggeredEmployeeAllocation.error && !lateCollaboratorAllocation.error && !releaseObserverAllocation.error && !staggeredTask.error
    && !addOverlappingMember.error && !addSecondOverlappingMember.error && !releaseBeforeLateMember.error
    && releaseReviewSnapshot.count === 2 && releaseReviewSnapshot.distinct_reviewers === 2
    && releaseReviewSnapshot.all_review_released_member
    && releaseReviewSnapshot.all_overlapping_reviewers && releaseReviewSnapshot.self_review_count === 0
    && !addNonOverlappingMember.error && !staggeredCompletion.error && staggeredCompletion.data?.feedback_pending === 10
    && staggeredReviewPairs.count === 10 && staggeredReviewPairs.all_expected
    && staggeredReviewPairs.nonoverlap_pair_count === 0
    && !lateCollaboratorInbox.error
    && lateCollaboratorInbox.data.reviews.filter(row => row.task_id === staggeredTask.data?.id).length === 2
    && lateCollaboratorInbox.data.reviews.some(row => row.task_id === staggeredTask.data?.id
      && row.reviewer_employee_id === '55555555-5555-4555-8555-555555555560'
      && row.reviewee_employee_id === '55555555-5555-4555-8555-555555555557')
    && lateCollaboratorInbox.data.reviews.some(row => row.task_id === staggeredTask.data?.id
      && row.reviewer_employee_id === '55555555-5555-4555-8555-555555555560'
      && row.reviewee_employee_id === '55555555-5555-4555-8555-555555555559')
    && Boolean(reviewAssignedToOverlappingMember.id)
    && Boolean(nonOverlappingSubmission.error?.code === '42501'),
  JSON.stringify({ addOverlappingMember: addOverlappingMember.error?.message,
    addSecondOverlappingMember: addSecondOverlappingMember.error?.message, releaseReviewSnapshot,
    releaseBeforeLateMember: releaseBeforeLateMember.error?.message,
    addNonOverlappingMember: addNonOverlappingMember.error?.message,
    completion: staggeredCompletion.error?.message, pairs: staggeredReviewPairs,
    inboxRows: lateCollaboratorInbox.data?.reviews?.filter(row => row.task_id === staggeredTask.data?.id).length,
    nonOverlappingSubmissionCode: nonOverlappingSubmission.error?.code }));
record('Peer-review submission rechecks assignment overlap in the backend',
  Boolean(injectedNonOverlappingReview.id)
    && Boolean(injectedNonOverlappingSubmission.error?.code === '42501')
    && injectedReviewState.status === 'pending',
  JSON.stringify({ reviewId: injectedNonOverlappingReview.id,
    submissionCode: injectedNonOverlappingSubmission.error?.code,
    persistedStatus: injectedReviewState.status }));

const browserTaskTitle = `Local browser integration ${Date.now()}`;
const employeeDashboardTaskTitle = `QA Dashboard assignment ${Date.now()}`;
const dashboardAppraisalBaseline = queryAdmin(`SELECT jsonb_build_object(
  'status',status,'self_overall_comment',self_overall_comment,
  'manager_overall_comment',manager_overall_comment,'updated_at',updated_at::text)
  FROM public.performance_appraisals WHERE id='${appraisalAEmployeeId}'::uuid`);
if (!dashboardAppraisalBaseline?.status) throw new Error('The dashboard appraisal fixture could not be snapshotted.');
psqlSync(`UPDATE public.performance_appraisals SET status='draft',self_overall_comment=NULL,
  manager_overall_comment=NULL WHERE id='${appraisalAEmployeeId}'::uuid`);
const employeeDashboardTask = await employeeA.client.rpc('hris_create_project_task', {
  p_tenant_id: ids.tenantA, p_project_id: projectA.id,
  p_title: employeeDashboardTaskTitle, p_description: 'Synthetic dashboard acceptance task.',
  p_due_date: null, p_project_allocation_ids: [allocationA60.data?.id],
});
const employeeDashboardGoalDueDate = queryAdmin(`SELECT jsonb_build_object('due_date',due_date::text)
  FROM public.performance_goals WHERE id='${employeeAGoalId}'::uuid`).due_date;
const dashboardTodayAttendance = queryAdmin(`SELECT jsonb_build_object(
  'tenant_id',tenant_id::text,'employee_id',employee_id::text,'attendance_date',attendance_date::text,
  'status',status,'work_mode',work_mode,'check_in',check_in::text,'check_out',check_out::text)
  FROM public.attendance_records WHERE id='${ids.attendanceRecord}'::uuid
    AND tenant_id='${ids.tenantA}'::uuid AND employee_id='55555555-5555-4555-8555-555555555555'::uuid
    AND attendance_date='${localCurrentDate}'::date`);
if (!dashboardTodayAttendance?.status || !dashboardTodayAttendance?.work_mode
    || !dashboardTodayAttendance?.check_in || !dashboardTodayAttendance?.check_out) {
  throw new Error('The isolated employee dashboard is missing its persisted today attendance fixture.');
}
const displayAttendanceValue = value => String(value).replaceAll('_', ' ')
  .replace(/\b\w/g, letter => letter.toLocaleUpperCase());
const dashboardPendingServiceId = 'c2222222-2222-4222-8222-222222222221';
psqlSync(`INSERT INTO public.service_requests(id,tenant_id,employee_id,request_type,reason,status,submitted_at)
  VALUES ('${dashboardPendingServiceId}'::uuid,'${ids.tenantA}'::uuid,
    '55555555-5555-4555-8555-555555555555'::uuid,'other',
    'Synthetic pending service request for dashboard acceptance.','pending',clock_timestamp())`);
const dashboardPendingServiceIds = queryAdmin(`SELECT jsonb_build_object('ids',coalesce(jsonb_agg(id ORDER BY submitted_at,id),'[]'::jsonb))
  FROM public.service_requests WHERE tenant_id='${ids.tenantA}'::uuid
    AND employee_id='55555555-5555-4555-8555-555555555555' AND status IN ('pending','in_progress')`).ids || [];
if (dashboardPendingServiceIds.length === 0) throw new Error('The synthetic employee has no pending service request for the dashboard journey.');
psqlSync(`UPDATE public.performance_goals SET due_date='${addCalendarDays(localCurrentDate, -1)}'::date
  WHERE id='${employeeAGoalId}'::uuid AND tenant_id='${ids.tenantA}'::uuid;`);
const employeeDashboardAtBrowserStart = queryAs(employeeA,
  `SELECT public.hris_get_my_dashboard_data('${ids.tenantA}'::uuid)`);
const dashboardLeaveBalanceForBrowser = employeeDashboardAtBrowserStart.balances
  .find(row => row.leave_type_id === ids.leaveTypeA)?.available_days;
if (dashboardLeaveBalanceForBrowser === null || dashboardLeaveBalanceForBrowser === undefined) {
  throw new Error('The isolated employee dashboard has no persisted leave balance for browser acceptance.');
}
const dashboardPendingLeaveFixture = tableRow('leave_requests', ids.leaveMissingLedger);
record('E01-04 browser uses a request that remains pending after earlier leave-decision checks',
  dashboardPendingLeaveFixture?.status === 'pending',
  JSON.stringify({ requestId: ids.leaveMissingLedger, status: dashboardPendingLeaveFixture?.status }));
let employeeAttendanceBrowserOutput = '';
let employeeAttendanceBrowserError = '';
try {
  employeeAttendanceBrowserOutput = execFileSync('node', [path.join(here, 'run-employee-dashboard-attendance-browser.mjs')], {
    cwd: mainRoot,
    env: {
      ...process.env,
      HRIS_LOCAL_SUPABASE_URL: services.API_URL,
      HRIS_LOCAL_SUPABASE_ANON_KEY: services.ANON_KEY,
      HRIS_LOCAL_TEST_PASSWORD: password,
      HRIS_LOCAL_ATTENDANCE_EMPLOYEE_EMAIL: emails[5],
      HRIS_LOCAL_ATTENDANCE_TENANT_ID: ids.tenantA,
      HRIS_LOCAL_ROSTER_ASSIGNMENT_ID: employeeRosterAssignmentId,
      HRIS_LOCAL_ROSTER_ASSIGNMENT_DATE: employeeRosterAssignmentDate,
      HRIS_LOCAL_ROSTER_SHIFT_NAME: 'Synthetic Late Shift',
      HRIS_LOCAL_ROSTER_START_TIME: '13:00',
      HRIS_LOCAL_ROSTER_END_TIME: '21:00',
      HRIS_LOCAL_ROSTER_BREAK_MINUTES: '45',
      HRIS_LOCAL_ROSTER_GRACE_MINUTES: '5',
      HRIS_LOCAL_ATTENDANCE_CURRENT_MONTH: currentAttendanceMonth.slice(0, 7),
      HRIS_LOCAL_ATTENDANCE_PREVIOUS_MONTH: previousAttendanceMonthStart.slice(0, 7),
      HRIS_LOCAL_ATTENDANCE_PREVIOUS_DATE: previousAttendanceMonthDate,
      HRIS_LOCAL_ATTENDANCE_CORRECTION_DATE: localCurrentDate,
      HRIS_LOCAL_ATTENDANCE_EMPTY_MONTH: emptyAttendanceMonth.slice(0, 7),
      HRIS_LOCAL_UPCOMING_TRAINING_SESSION_ID: learningIds.directSession,
      HRIS_LOCAL_UPCOMING_TRAINING_PROGRAM_ID: learningIds.directProgram,
      HRIS_LOCAL_UPCOMING_TRAINING_PROGRAM_TITLE: 'QA A Direct Learning',
      HRIS_LOCAL_UPCOMING_TRAINING_EXPECTED: JSON.stringify(dashboardExpectedUpcomingTraining),
      HRIS_LOCAL_DASHBOARD_EMPLOYEE_ID: '55555555-5555-4555-8555-555555555555',
      HRIS_LOCAL_DASHBOARD_TODAY_STATUS: displayAttendanceValue(dashboardTodayAttendance.status),
      HRIS_LOCAL_DASHBOARD_TODAY_WORK_MODE: displayAttendanceValue(dashboardTodayAttendance.work_mode),
      HRIS_LOCAL_DASHBOARD_TASK_TITLE: employeeDashboardTaskTitle,
      HRIS_LOCAL_DASHBOARD_GOAL_TITLE: 'QA A goal',
      HRIS_LOCAL_DASHBOARD_TEAM_NAME: 'QA A Team',
      HRIS_LOCAL_DASHBOARD_APPRAISAL_ID: appraisalAEmployeeId,
      HRIS_LOCAL_DASHBOARD_ANNOUNCEMENT_ID: 'b1111111-1111-4111-8111-111111111111',
      HRIS_LOCAL_DASHBOARD_ANNOUNCEMENT_TITLE: 'QA A all notice',
      HRIS_LOCAL_DASHBOARD_PENDING_LEAVE_ID: ids.leaveMissingLedger,
      HRIS_LOCAL_DASHBOARD_PENDING_SERVICE_ID: dashboardPendingServiceIds[0],
      HRIS_LOCAL_DASHBOARD_LEAVE_AVAILABLE_DAYS: String(dashboardLeaveBalanceForBrowser),
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
} catch (error) {
  employeeAttendanceBrowserError = String(error.stderr || error.message || 'local employee attendance browser run failed').slice(-1800);
  employeeAttendanceBrowserOutput = String(error.stdout || '');
}
psqlSync(`UPDATE public.performance_appraisals SET
  status=${sqlLiteral(dashboardAppraisalBaseline.status)},
  self_overall_comment=${dashboardAppraisalBaseline.self_overall_comment === null ? 'NULL' : sqlLiteral(dashboardAppraisalBaseline.self_overall_comment)},
  manager_overall_comment=${dashboardAppraisalBaseline.manager_overall_comment === null ? 'NULL' : sqlLiteral(dashboardAppraisalBaseline.manager_overall_comment)},
  updated_at=${sqlLiteral(dashboardAppraisalBaseline.updated_at)}::timestamptz
  WHERE id='${appraisalAEmployeeId}'::uuid`);
psqlSync(`DELETE FROM public.service_requests WHERE id='${dashboardPendingServiceId}'::uuid
  AND tenant_id='${ids.tenantA}'::uuid AND employee_id='55555555-5555-4555-8555-555555555555'::uuid`);
psqlSync(`UPDATE public.performance_goals SET due_date=${employeeDashboardGoalDueDate ? `'${employeeDashboardGoalDueDate}'::date` : 'NULL'}
  WHERE id='${employeeAGoalId}'::uuid AND tenant_id='${ids.tenantA}'::uuid;`);
if (employeeDashboardTask.data?.id) psqlSync(`DELETE FROM public.project_task_peer_reviews
  WHERE tenant_id='${ids.tenantA}'::uuid AND task_id='${employeeDashboardTask.data.id}'::uuid;
  DELETE FROM public.project_task_assignments WHERE tenant_id='${ids.tenantA}'::uuid
    AND task_id='${employeeDashboardTask.data.id}'::uuid;
  DELETE FROM public.project_tasks WHERE tenant_id='${ids.tenantA}'::uuid
    AND id='${employeeDashboardTask.data.id}'::uuid;`);
const employeeDashboardFixtureCleanup = queryAdmin(`SELECT jsonb_build_object(
  'synthetic_task_count',(SELECT count(*)::integer FROM public.project_tasks
    WHERE tenant_id='${ids.tenantA}'::uuid AND title=${sqlLiteral(employeeDashboardTaskTitle)}),
  'synthetic_pending_service_count',(SELECT count(*)::integer FROM public.service_requests
    WHERE id='${dashboardPendingServiceId}'::uuid),
  'goal_due_date',(SELECT due_date::text FROM public.performance_goals WHERE id='${employeeAGoalId}'::uuid))`);
record('Employee dashboard acceptance restores its overdue-goal fixture and removes its synthetic task',
  employeeDashboardFixtureCleanup.synthetic_task_count === 0
    && employeeDashboardFixtureCleanup.synthetic_pending_service_count === 0
    && employeeDashboardFixtureCleanup.goal_due_date === employeeDashboardGoalDueDate,
  JSON.stringify(employeeDashboardFixtureCleanup));
record('Real employee dashboard month selector reads persisted Auth/Postgres attendance with retry, refresh, empty, and responsive states',
  employeeAttendanceBrowserOutput.includes('EMPLOYEE_DASHBOARD_ATTENDANCE_BROWSER_ACCEPTANCE=PASS'),
  employeeAttendanceBrowserError);
record('E02-08 employee views own employment information with cross-tenant access denied',
  employeeAttendanceBrowserOutput.includes('E02-08_EMPLOYMENT_INFORMATION_BROWSER_PASS')
    && !employeeIdentityCardA.error && employeeIdentityCard?.employee_number === 'QA-A-001',
  employeeAttendanceBrowserError);
record('E02-01 employee personal profile browser marker verifies own name and contact details',
  employeeAttendanceBrowserOutput.includes('E02-01_PERSONAL_INFORMATION_BROWSER_PASS'),
  employeeAttendanceBrowserError);
record('E01-01 partially verified: dashboard renders the employee’s persisted current attendance status and work mode',
  employeeAttendanceBrowserOutput.includes('EMPLOYEE_DASHBOARD_TODAY_STATUS_BROWSER_ACCEPTANCE=PASS'), employeeAttendanceBrowserError);
record('E01-02 dashboard reports persisted check-in and check-out times for today',
  employeeAttendanceBrowserOutput.includes('EMPLOYEE_DASHBOARD_TODAY_TIMES_BROWSER_ACCEPTANCE=PASS'), employeeAttendanceBrowserError);
record('E01-03 dashboard reports the employee’s persisted available leave balance from the existing balance contract',
  employeeAttendanceBrowserOutput.includes('EMPLOYEE_DASHBOARD_LEAVE_BALANCE_BROWSER_ACCEPTANCE=PASS'), employeeAttendanceBrowserError);
record('E01-06 training visibility is partially implemented: only confirmed upcoming sessions link to My Learning in the active tenant',
  employeeAttendanceBrowserOutput.includes('EMPLOYEE_UPCOMING_TRAINING_BROWSER_ACCEPTANCE=PASS'), employeeAttendanceBrowserError);
record('E01-07 assigned tasks, own goals, and overdue work open their existing project and performance journeys',
  !employeeDashboardTask.error
    && employeeAttendanceBrowserOutput.includes('EMPLOYEE_DASHBOARD_WORK_BROWSER_ACCEPTANCE=PASS'),
  JSON.stringify({ taskError: employeeDashboardTask.error?.message,
    browserError: employeeAttendanceBrowserError }));
record('E01-08 recent HR announcements appear on the employee dashboard and open the RLS-filtered history',
  employeeAttendanceBrowserOutput.includes('EMPLOYEE_DASHBOARD_ANNOUNCEMENTS_BROWSER_ACCEPTANCE=PASS'), employeeAttendanceBrowserError);
record('E01-04 pending leave, attendance, expense, travel, service and learning requests link from the dashboard with retry, owner-scoped persistence, EN/BN, and mobile/desktop checks',
  employeeAttendanceBrowserOutput.includes('EMPLOYEE_DASHBOARD_PENDING_REQUESTS_BROWSER_ACCEPTANCE=PASS'), employeeAttendanceBrowserError);
record('E01-06 upcoming appraisal deadlines use the authenticated employee appraisal RPC and recover on retry at 375px/1280px in EN/BN',
  employeeAttendanceBrowserOutput.includes('EMPLOYEE_DASHBOARD_UPCOMING_REVIEWS_BROWSER_ACCEPTANCE=PASS'), employeeAttendanceBrowserError);
record('E04-01 employee sees their own tenant-linked employee number on the digital identity card',
  employeeAttendanceBrowserOutput.includes('E04-01_EMPLOYEE_NUMBER_BROWSER_PASS')
    && !employeeIdentityCardA.error && employeeIdentityCard?.employee_number === 'QA-A-001',
  JSON.stringify({ employeeNumber: employeeIdentityCard?.employee_number, browserError: employeeAttendanceBrowserError }));
record('E04-02 employee opens, retries, and closes the responsive digital identity card',
  employeeAttendanceBrowserOutput.includes('E04-02_DIGITAL_CARD_RECOVERY_BROWSER_PASS'), employeeAttendanceBrowserError);
record('E04-03 digital identity card shows the employee’s verified designation and department',
  employeeAttendanceBrowserOutput.includes('E04-03_DESIGNATION_DEPARTMENT_BROWSER_PASS')
    && employeeIdentityCard?.designation_title === 'QA A designation'
    && employeeIdentityCard?.department_name === 'QA A department',
  JSON.stringify({ designation: employeeIdentityCard?.designation_title, department: employeeIdentityCard?.department_name,
    browserError: employeeAttendanceBrowserError }));
record('E04-04 digital identity card reflects the active employment status',
  employeeAttendanceBrowserOutput.includes('E04-04_ACTIVE_EMPLOYMENT_BROWSER_PASS')
    && employeeIdentityCard?.employment_status === 'active',
  JSON.stringify({ employmentStatus: employeeIdentityCard?.employment_status, browserError: employeeAttendanceBrowserError }));
record('E04-05 partially verified: inactive and terminated employment states are handled; no approved expiry rule exists',
  !inactiveEmployeeIdentityCard.error && inactiveEmployeeIdentityCard.data?.employment_status === 'inactive'
    && Boolean(terminatedEmployeeIdentityCard.error),
  JSON.stringify({ inactive: inactiveEmployeeIdentityCard.data?.employment_status,
    terminatedDenied: Boolean(terminatedEmployeeIdentityCard.error), expiryRule: 'not present in the approved identity-card contract' }));
record('E05-04 employee sees the exact tenant-owned daily attendance history row',
  employeeAttendanceBrowserOutput.includes('E05-04_DAILY_HISTORY_BROWSER_PASS')
    && !employeeAttendancePreviousMonth.error && employeeAttendancePreviousMonth.data.records.length === 1
    && employeeAttendancePreviousMonth.data.records[0].attendance_date === previousAttendanceMonthDate,
  JSON.stringify({ expectedDate: previousAttendanceMonthDate,
    records: employeeAttendancePreviousMonth.data?.records?.map(row => row.attendance_date), browserError: employeeAttendanceBrowserError }));
record('E05-05 employee selects a prior month and sees the persisted monthly attendance history and hours',
  employeeAttendanceBrowserOutput.includes('E05-05_MONTHLY_HISTORY_BROWSER_PASS')
    && !employeeAttendancePreviousMonth.error && employeeAttendancePreviousMonth.data.records.length === 1
    && Number(employeeAttendancePreviousMonth.data.records[0].work_hours) === 8,
  JSON.stringify({ records: employeeAttendancePreviousMonth.data?.records?.length,
    completePairHours: employeeAttendancePreviousMonth.data?.records?.[0]?.work_hours,
    browserError: employeeAttendanceBrowserError }));

let attendanceCorrectionBrowserOutput = '';
let attendanceCorrectionBrowserError = '';
const attendanceCorrectionFreeDate = psqlSync(`SELECT COALESCE((
  SELECT g.day::date::text FROM generate_series(
    date_trunc('month','${localCurrentDate}'::date)::date,
    '${localCurrentDate}'::date, interval '1 day'
  ) g(day)
  WHERE NOT EXISTS (SELECT 1 FROM public.attendance_records a
    WHERE a.tenant_id='${ids.tenantA}'::uuid
      AND a.employee_id='55555555-5555-4555-8555-555555555555'::uuid
      AND a.attendance_date=g.day::date)
  ORDER BY g.day DESC LIMIT 1
), '');`).trim();
if (!attendanceCorrectionFreeDate) {
  record('E06 attendance-correction browser fixture has a free employee attendance date in the current report range', false,
    'No unused date exists in the active attendance month.');
} else {
  attendanceCorrectionBrowserDate = attendanceCorrectionFreeDate;
  attendanceCorrectionBrowserFixtureId = randomUUID();
  const rejectReason = `Synthetic E06 rejection ${randomUUID()}`;
  const approveReason = `Synthetic E06 approval ${randomUUID()}`;
  const rejectionNote = `Synthetic E06 correction note ${randomUUID()}`;
  attendanceCorrectionBrowserReasons = [rejectReason, approveReason];
  psqlSync(`INSERT INTO public.attendance_records(
      id,tenant_id,employee_id,attendance_date,check_in,check_out,work_mode,client_name,status,source,remarks
    ) VALUES (
      ${sqlLiteral(attendanceCorrectionBrowserFixtureId)}::uuid,'${ids.tenantA}'::uuid,
      '55555555-5555-4555-8555-555555555555'::uuid,${sqlLiteral(attendanceCorrectionBrowserDate)}::date,
      ((${sqlLiteral(attendanceCorrectionBrowserDate)}::date + time '09:00') AT TIME ZONE 'Asia/Dhaka'),
      ((${sqlLiteral(attendanceCorrectionBrowserDate)}::date + time '17:00') AT TIME ZONE 'Asia/Dhaka'),
      'office','Synthetic preserved client','present','employee','Synthetic E06 correction baseline'
    );`);
  try {
    attendanceCorrectionBrowserOutput = execFileSync('node', [path.join(here, 'run-employee-attendance-correction-browser.mjs')], {
      cwd: mainRoot,
      env: {
        ...process.env,
        HRIS_LOCAL_SUPABASE_URL: services.API_URL,
        HRIS_LOCAL_SUPABASE_ANON_KEY: services.ANON_KEY,
        HRIS_LOCAL_TEST_PASSWORD: password,
        HRIS_LOCAL_CORRECTION_EMPLOYEE_EMAIL: emails[5],
        HRIS_LOCAL_CORRECTION_MANAGER_EMAIL: emails[0],
        HRIS_LOCAL_CORRECTION_OTHER_MANAGER_EMAIL: emails[1],
        HRIS_LOCAL_CORRECTION_TENANT_ID: ids.tenantA,
        HRIS_LOCAL_CORRECTION_DATE: attendanceCorrectionBrowserDate,
        HRIS_LOCAL_CORRECTION_REASON_REJECT: rejectReason,
        HRIS_LOCAL_CORRECTION_REASON_APPROVE: approveReason,
        HRIS_LOCAL_CORRECTION_REJECTION_NOTE: rejectionNote,
      },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    attendanceCorrectionBrowserError = String(error.stderr || error.message || 'attendance-correction browser journey failed').slice(-1800);
    attendanceCorrectionBrowserOutput = String(error.stdout || '');
  }
  const attendanceCorrectionBrowserPersistence = queryAdmin(`SELECT jsonb_build_object(
    'requests',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',c.id::text,'tenant_id',c.tenant_id::text,'employee_id',c.employee_id::text,
      'reason',c.reason,'status',c.status,'requested_check_in',c.requested_check_in,
      'resolved_by',c.resolved_by::text,'resolution_note',c.resolution_note)
      ORDER BY c.requested_at,c.id)
      FROM public.attendance_corrections c
      WHERE c.tenant_id='${ids.tenantA}'::uuid
        AND c.employee_id='55555555-5555-4555-8555-555555555555'::uuid
        AND c.reason IN (${attendanceCorrectionBrowserReasons.map(sqlLiteral).join(',')})), '[]'::jsonb),
    'audit_count',(SELECT count(*)::integer FROM public.admin_audit_logs l
      WHERE l.target_type='attendance_correction' AND l.target_id IN (
        SELECT c.id::text FROM public.attendance_corrections c
        WHERE c.tenant_id='${ids.tenantA}'::uuid
          AND c.employee_id='55555555-5555-4555-8555-555555555555'::uuid
          AND c.reason IN (${attendanceCorrectionBrowserReasons.map(sqlLiteral).join(',')}))),
    'attendance',(SELECT jsonb_build_object('id',a.id::text,'tenant_id',a.tenant_id::text,
      'employee_id',a.employee_id::text,'attendance_date',a.attendance_date::text,
      'check_in',a.check_in,'check_out',a.check_out,'work_mode',a.work_mode,
      'client_name',a.client_name,'status',a.status)
      FROM public.attendance_records a WHERE a.id=${sqlLiteral(attendanceCorrectionBrowserFixtureId)}::uuid
        AND a.tenant_id='${ids.tenantA}'::uuid
        AND a.employee_id='55555555-5555-4555-8555-555555555555'::uuid))`);
  const correctionRequests = attendanceCorrectionBrowserPersistence.requests || [];
  attendanceCorrectionBrowserRequestIds = correctionRequests.map(row => row.id).filter(Boolean);
  const rejectedCorrection = correctionRequests.find(row => row.reason === rejectReason);
  const approvedCorrection = correctionRequests.find(row => row.reason === approveReason);
  const correctedAttendance = attendanceCorrectionBrowserPersistence.attendance;
  const correctionSnapshotValid = correctionRequests.length === 2
    && rejectedCorrection?.status === 'rejected' && Boolean(rejectedCorrection.resolved_by)
    && rejectedCorrection.resolution_note === rejectionNote
    && approvedCorrection?.status === 'approved' && Boolean(approvedCorrection.resolved_by)
    && Date.parse(approvedCorrection.requested_check_in) === Date.parse(`${attendanceCorrectionBrowserDate}T03:45:00Z`)
    && attendanceCorrectionBrowserPersistence.audit_count === 4
    && correctedAttendance?.tenant_id === ids.tenantA
    && correctedAttendance?.employee_id === '55555555-5555-4555-8555-555555555555'
    && correctedAttendance?.attendance_date === attendanceCorrectionBrowserDate
    && Date.parse(correctedAttendance.check_in) === Date.parse(`${attendanceCorrectionBrowserDate}T03:45:00Z`)
    && Date.parse(correctedAttendance.check_out) === Date.parse(`${attendanceCorrectionBrowserDate}T11:00:00Z`)
    && correctedAttendance.work_mode === 'office' && correctedAttendance.client_name === 'Synthetic preserved client'
    && correctedAttendance.status === 'present';

  record('E06-01 employee selects an existing attendance row from tenant-scoped monthly history with empty/error retry states',
    attendanceCorrectionBrowserOutput.includes('E06-01_SELECTED_EXISTING_ATTENDANCE_DATE_BROWSER_PASS')
      && attendanceCorrectionBrowserOutput.includes('E06-CORRECTION_FORM_EMPTY_RETRY_CANCEL_AND_ENROLLMENT_SCOPE_BROWSER_PASS')
      && attendanceCorrectionBrowserPersistence.attendance?.attendance_date === attendanceCorrectionBrowserDate,
    attendanceCorrectionBrowserError);
  record('E06-02 selected correction submits the requested punch value and persists the approved change',
    attendanceCorrectionBrowserOutput.includes('E06-02_REQUESTED_PUNCH_BROWSER_PASS') && correctionSnapshotValid,
    JSON.stringify({ savedValue: approvedCorrection?.requested_check_in, auditCount: attendanceCorrectionBrowserPersistence.audit_count }));
  record('E06-03 correction reason is required and persists with each employee request',
    attendanceCorrectionBrowserOutput.includes('E06-03_REASON_BROWSER_PASS')
      && rejectedCorrection?.reason === rejectReason && approvedCorrection?.reason === approveReason,
    JSON.stringify({ requestCount: correctionRequests.length, reasonsPersisted: correctionRequests.every(row => Boolean(row.reason)) }));
  record('E06-04 partial: no approved rule says when evidence is required, so employee evidence upload remains unresolved',
    true, 'Attendance correction evidence_path exists in the record contract, but no approved upload requirement was supplied.');
  record('E06-05 employee submits a correction, recovers a transient outage, and saves only one request after retry',
    attendanceCorrectionBrowserOutput.includes('E06-05_RETRY_SUBMISSION_BROWSER_PASS')
      && correctionRequests.length === 2 && attendanceCorrectionBrowserPersistence.audit_count === 4,
    JSON.stringify({ persistedRequests: correctionRequests.length, auditCount: attendanceCorrectionBrowserPersistence.audit_count }));
  record('E06-06 partial: pending edit or cancellation is not implemented because the approved policy does not define it',
    true, 'The modal Cancel action closes the unsent form; it does not alter an already submitted request.');
  record('E06-07 employee sees pending, approved and rejected status after refresh in their own tenant',
    attendanceCorrectionBrowserOutput.includes('E06-07_PENDING_STATUS_BROWSER_PASS')
      && attendanceCorrectionBrowserOutput.includes('E06-08_REJECTION_REASON_BENGALI_REFRESH_BROWSER_PASS')
      && correctionSnapshotValid,
    JSON.stringify(correctionRequests.map(row => row.status)));
  record('E06-08 employee sees the manager rejection reason after refresh in Bengali',
    attendanceCorrectionBrowserOutput.includes('E06-08_REJECTION_REASON_BENGALI_REFRESH_BROWSER_PASS')
      && rejectedCorrection?.resolution_note === rejectionNote,
    attendanceCorrectionBrowserError);
  record('E06-09 rejection leaves attendance unchanged; approval changes only the requested punch and is audited',
    attendanceCorrectionBrowserOutput.includes('E06-09_REJECTION_PRESERVES_ATTENDANCE_BROWSER_PASS')
      && attendanceCorrectionBrowserOutput.includes('E06-09_APPROVAL_UPDATES_REQUESTED_ATTENDANCE_BROWSER_PASS')
      && correctionSnapshotValid,
    JSON.stringify({ attendance: correctedAttendance, auditCount: attendanceCorrectionBrowserPersistence.audit_count }));
  record('Attendance correction requests stay hidden from a manager in another tenant and the form supports EN/BN at 375px/1280px',
    attendanceCorrectionBrowserOutput.includes('E06-ATTENDANCE_CORRECTION_FORM_BENGALI_BROWSER_PASS')
      && attendanceCorrectionBrowserOutput.includes('E06-ATTENDANCE_CORRECTION_BROWSER_ACCEPTANCE=PASS'),
    attendanceCorrectionBrowserError);
  cleanupAttendanceCorrectionBrowserFixture();
  const correctionAuditTargetIds = attendanceCorrectionBrowserRequestIds.map(sqlLiteral).join(',') || "''";
  const attendanceCorrectionCleanup = queryAdmin(`SELECT jsonb_build_object(
    'request_count',(SELECT count(*)::integer FROM public.attendance_corrections
      WHERE tenant_id='${ids.tenantA}'::uuid AND employee_id='55555555-5555-4555-8555-555555555555'::uuid
        AND reason IN (${attendanceCorrectionBrowserReasons.map(sqlLiteral).join(',')})),
    'record_count',(SELECT count(*)::integer FROM public.attendance_records
      WHERE id=${sqlLiteral(attendanceCorrectionBrowserFixtureId)}::uuid),
    'audit_count',(SELECT count(*)::integer FROM public.admin_audit_logs
      WHERE (target_type='attendance_record' AND target_id=${sqlLiteral(attendanceCorrectionBrowserFixtureId)})
        OR (target_type='attendance_correction' AND target_id IN (${correctionAuditTargetIds}))))`);
  record('Attendance-correction browser acceptance removes only its synthetic requests, attendance row, and audit events',
    attendanceCorrectionCleanup.request_count === 0 && attendanceCorrectionCleanup.record_count === 0
      && attendanceCorrectionCleanup.audit_count === 0,
    JSON.stringify(attendanceCorrectionCleanup));
}

let browserIntegrationOutput = '';
let browserIntegrationError = '';
try {
  browserIntegrationOutput = execFileSync('node', [path.join(here, 'run-project-browser.mjs')], {
    cwd: mainRoot,
    env: {
      ...process.env,
      HRIS_LOCAL_SUPABASE_URL: services.API_URL,
      HRIS_LOCAL_SUPABASE_ANON_KEY: services.ANON_KEY,
      HRIS_LOCAL_TEST_PASSWORD: password,
      HRIS_LOCAL_PM_EMAIL: emails[5],
      HRIS_LOCAL_REVIEWER_EMAIL: emails[7],
      HRIS_LOCAL_REVIEWEE_EMAIL: emails[5],
      HRIS_LOCAL_TENANT_ID: ids.tenantA,
      HRIS_LOCAL_PROJECT_ID: projectA.id,
      HRIS_LOCAL_PROJECT_CODE: projectA.code,
      HRIS_LOCAL_INITIAL_ALLOCATION_ID: allocationA60.data?.id || '',
      HRIS_LOCAL_COLLABORATOR_ALLOCATION_ID: taskMemberAllocation.data?.id || '',
      HRIS_LOCAL_TASK_TITLE: browserTaskTitle,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
} catch (error) {
  browserIntegrationError = String(error.stderr || error.message || 'local browser run failed').slice(-1200);
}
const browserTaskPersistence = queryAdmin(`SELECT COALESCE((SELECT jsonb_build_object(
  'title',t.title,'description',t.description,'due_date',t.due_date::text,
  'updated_at_after_created',t.updated_at>t.created_at,'status',t.status,
  'pending',(SELECT count(*)::integer FROM public.project_task_peer_reviews r
    WHERE r.tenant_id=t.tenant_id AND r.task_id=t.id AND r.status='pending'),
  'review_total',(SELECT count(*)::integer FROM public.project_task_peer_reviews r
    WHERE r.tenant_id=t.tenant_id AND r.task_id=t.id),
  'review_submitted',EXISTS (SELECT 1 FROM public.project_task_peer_reviews r
    WHERE r.tenant_id=t.tenant_id AND r.task_id=t.id AND r.reviewer_employee_id='55555555-5555-4555-8555-555555555556'::uuid
      AND r.employee_id='55555555-5555-4555-8555-555555555555'::uuid AND r.status='submitted'),
  'not_observed',EXISTS (SELECT 1 FROM public.project_task_peer_reviews r
    WHERE r.tenant_id=t.tenant_id AND r.task_id=t.id AND r.reviewer_employee_id='55555555-5555-4555-8555-555555555556'::uuid
      AND r.employee_id='55555555-5555-4555-8555-555555555555'::uuid
      AND r.quality_of_work_not_observed AND r.quality_of_work_score IS NULL))
  FROM public.project_tasks t WHERE t.tenant_id='${ids.tenantA}'::uuid AND t.project_id='${projectA.id}'::uuid
    AND t.title=${sqlLiteral(`${browserTaskTitle} updated`)}), 'null'::jsonb)`);
record('Real browser UI edits task details with retry, completes work, and uses the unified project/learning notification inbox',
  browserIntegrationOutput.includes('Mobile/desktop browser-to-local-Supabase task creation/edit retry, task completion, peer-review inbox, Learning Completion notifications, EN/BN handoff, and performance-history journey passed.')
    && browserTaskPersistence?.title === `${browserTaskTitle} updated`
    && browserTaskPersistence?.description === 'Updated details persisted after retry.'
    && browserTaskPersistence?.due_date === '2098-08-20' && browserTaskPersistence?.updated_at_after_created === true
    && browserTaskPersistence?.status === 'completed' && browserTaskPersistence?.pending === 1
    && browserTaskPersistence.review_total === 2 && browserTaskPersistence.review_submitted
    && browserTaskPersistence.not_observed,
  JSON.stringify({ browserError: browserIntegrationError, database: browserTaskPersistence }));

let passwordRecoveryOutput = '';
let passwordRecoveryError = '';
try {
  passwordRecoveryOutput = execFileSync('node', [path.join(here, 'run-password-recovery-browser.mjs')], {
    cwd: mainRoot,
    env: {
      ...process.env,
      HRIS_LOCAL_SUPABASE_URL: services.API_URL,
      HRIS_LOCAL_SUPABASE_ANON_KEY: services.ANON_KEY,
      HRIS_LOCAL_TEST_PASSWORD: password,
      HRIS_LOCAL_RECOVERY_EMAIL: recoveryEmail,
      HRIS_LOCAL_MAILPIT_URL: services.MAILPIT_URL || services.INBUCKET_URL,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
} catch (error) {
  const safeStage = String(error.stderr || '').split(/\r?\n/)
    .find(line => line.includes('Local password-recovery journey failed while'));
  passwordRecoveryError = safeStage || 'Disposable Auth password-recovery browser journey failed; sensitive email links were suppressed.';
}
record('Fresh local recovery email verifies the Auth callback, password update, sign-out, and new-password sign-in',
  passwordRecoveryOutput.includes('Fresh local Mailpit recovery email completed the mobile password reset and desktop sign-in journey.'),
  passwordRecoveryError);

let dashboardTeamReportBrowserOutput = '';
let dashboardTeamReportBrowserError = '';
try {
  dashboardTeamReportBrowserOutput = execFileSync('node', [path.join(here, 'run-dashboard-team-report-browser.mjs')], {
    cwd: mainRoot,
    env: {
      ...process.env,
      HRIS_LOCAL_SUPABASE_URL: services.API_URL,
      HRIS_LOCAL_SUPABASE_ANON_KEY: services.ANON_KEY,
      HRIS_LOCAL_TEST_PASSWORD: password,
      HRIS_LOCAL_DASHBOARD_MANAGER_EMAIL: emails[0],
      HRIS_LOCAL_DASHBOARD_TENANT_ID: ids.tenantA,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
} catch (error) {
  dashboardTeamReportBrowserError = String(error.stderr || error.message || 'local dashboard Team Report browser run failed').slice(-1800);
}
record('Real manager browser journey reads and exports the tenant-scoped dashboard Team Report with mobile and desktop recovery',
  dashboardTeamReportBrowserOutput.includes('Local Auth-to-Postgres Team Report journey passed: tenant-scoped date selection, filtered totals/CSV parity, team-scoped detail retry, Bengali labels, refresh recovery, and 375px mobile/1280px desktop layouts.'),
  dashboardTeamReportBrowserError);

const concurrentAssignments = await Promise.all([
  psqlAsync(sessionSql(employeeB, `SELECT public.hris_assign_tenant_project_allocation(
    '${ids.tenantB}'::uuid,'${projectB.id}'::uuid,'66666666-6666-4666-8666-666666666666'::uuid,
    'Member',60,'${localCurrentDate}'::date,NULL)::text`)).then(() => true, () => false),
  psqlAsync(sessionSql(employeeB, `SELECT public.hris_assign_tenant_project_allocation(
    '${ids.tenantB}'::uuid,'${projectB2.id}'::uuid,'66666666-6666-4666-8666-666666666666'::uuid,
    'Member',60,'${localCurrentDate}'::date,NULL)::text`)).then(() => true, () => false),
]);
const concurrentAllocationCount = queryAdmin(`SELECT jsonb_build_object('count',count(*)::integer)
  FROM public.project_allocations
  WHERE tenant_id='${ids.tenantB}'::uuid AND employee_id='66666666-6666-4666-8666-666666666666'::uuid`).count;
record('Concurrent allocation requests serialize on the employee and cannot exceed 100%',
  concurrentAssignments.filter(Boolean).length === 1 && concurrentAllocationCount === 1,
  `accepted=${concurrentAssignments.filter(Boolean).length}, rows=${concurrentAllocationCount}`);

const tenantBLocalToday = queryAdmin(`SELECT jsonb_build_object('today',
  (now() AT TIME ZONE 'Pacific/Honolulu')::date::text)`).today;
const tenantBLocalTomorrow = addCalendarDays(tenantBLocalToday, 1);
const futureProjectId = concurrentAssignments[0] ? projectB2.id : projectB.id;
const upcomingAllocation = await employeeB.client.rpc('hris_assign_tenant_project_allocation', {
  p_tenant_id: ids.tenantB, p_project_id: futureProjectId,
  p_employee_id: '66666666-6666-4666-8666-666666666666',
  p_role_on_project: 'Future contributor', p_allocation_percentage: 40,
  p_assigned_date: tenantBLocalTomorrow, p_release_date: null,
});
const upcomingWorkspace = await employeeB.client.rpc('hris_get_tenant_project_workspace', { p_tenant_id: ids.tenantB });
const upcomingSelfView = await employeeB.client.rpc('hris_get_my_projects', { p_tenant_id: ids.tenantB });
const upcomingRow = upcomingWorkspace.data?.projects.flatMap(project => project.allocations)
  .find(allocation => allocation.id === upcomingAllocation.data?.id);
const upcomingSelfRow = upcomingSelfView.data?.projects.find(project => project.allocation_id === upcomingAllocation.data?.id);
record('Upcoming allocation status follows the tenant-local date for manager and employee views',
  !upcomingAllocation.error && !upcomingWorkspace.error && !upcomingSelfView.error
    && upcomingAllocation.data?.status === 'upcoming'
    && upcomingRow?.status === 'upcoming' && upcomingSelfRow?.status === 'upcoming');

// Make the intended synthetic state explicit immediately before release so
// preceding acceptance journeys cannot affect this preservation assertion.
psqlSync(`UPDATE public.employees SET employment_status='on_leave'
  WHERE tenant_id='${ids.tenantA}'::uuid AND id='55555555-5555-4555-8555-555555555555'::uuid;`);
const employeeAStatusBeforeRelease = queryAdmin(`SELECT jsonb_build_object('status',employment_status)
  FROM public.employees WHERE tenant_id='${ids.tenantA}'::uuid
    AND id='55555555-5555-4555-8555-555555555555'::uuid`).status;
const ordinaryAdminRelease = await managerA.client.rpc('hris_release_tenant_project_allocation', {
  p_tenant_id: ids.tenantA, p_allocation_id: allocationA60.data?.id,
});
const ordinaryManagerRelease = await managerB.client.rpc('hris_release_tenant_project_allocation', {
  p_tenant_id: ids.tenantB, p_allocation_id: upcomingAllocation.data?.id,
});
const releasedA60 = await employeeA.client.rpc('hris_release_tenant_project_allocation', {
  p_tenant_id: ids.tenantA, p_allocation_id: allocationA60.data?.id,
});
const employeeAStatusAfterRelease = queryAdmin(`SELECT jsonb_build_object('status',employment_status)
  FROM public.employees WHERE tenant_id='${ids.tenantA}'::uuid
    AND id='55555555-5555-4555-8555-555555555555'::uuid`).status;
const taskMembershipCascade = queryAdmin(`SELECT jsonb_build_object(
  'released',COALESCE(bool_and(released_at IS NOT NULL),false),
  'review_count',(SELECT count(*)::integer FROM public.project_task_peer_reviews r
    WHERE r.tenant_id='${ids.tenantA}'::uuid AND r.task_id='${followupTask.data?.id}'::uuid))
  FROM public.project_task_assignments WHERE tenant_id='${ids.tenantA}'::uuid
    AND task_id='${followupTask.data?.id}'::uuid AND project_allocation_id='${allocationA60.data?.id}'::uuid`);
const releaseRepeat = await managerA.client.rpc('hris_release_tenant_project_allocation', {
  p_tenant_id: ids.tenantA, p_allocation_id: allocationA60.data?.id,
});
record('Releasing an allocation preserves the employee status and writes one release audit event',
  Boolean(ordinaryAdminRelease.error) && Boolean(ordinaryManagerRelease.error)
    && !releasedA60.error && releasedA60.data?.status === 'released'
    && employeeAStatusBeforeRelease === 'on_leave' && employeeAStatusAfterRelease === employeeAStatusBeforeRelease
    && taskMembershipCascade.released === true && taskMembershipCascade.review_count === 2
    && Boolean(releaseRepeat.error)
    && auditCount(allocationA60.data?.id, 'project.allocation.released') === 1,
  JSON.stringify({ before: employeeAStatusBeforeRelease, after: employeeAStatusAfterRelease, ...taskMembershipCascade }));

const holidayCalendarA = await managerA.client.rpc('hris_get_org_holiday_calendar', { p_tenant_id: ids.tenantA });
const holidayCalendarB = await managerB.client.rpc('hris_get_org_holiday_calendar', { p_tenant_id: ids.tenantB });
const holidayCrossTenantRead = await managerB.client.rpc('hris_get_org_holiday_calendar', { p_tenant_id: ids.tenantA });
const holidayEmployeeRead = await employeeA.client.rpc('hris_get_org_holiday_calendar', { p_tenant_id: ids.tenantA });
const holidayGlobalOnlyRead = await globalOnly.client.rpc('hris_get_org_holiday_calendar', { p_tenant_id: ids.tenantA });
const holidayCreate = await managerA.client.rpc('hris_save_org_holiday', {
  p_tenant_id: ids.tenantA, p_holiday_id: null, p_name: 'Isolated Calendar Acceptance Day',
  p_start_date: '2099-12-20', p_end_date: '2099-12-21', p_holiday_type: 'qa_test',
  p_description: 'Synthetic calendar RPC persistence check.', p_active: true,
});
const holidayCreateId = holidayCreate.data?.id;
const holidayPersisted = holidayCreateId ? queryAdmin(`SELECT jsonb_build_object(
  'tenant_id',tenant_id,'name',name,'start_date',start_date,'end_date',end_date,
  'holiday_type',holiday_type,'description',description,'active',active,
  'created_at',created_at IS NOT NULL,'updated_at',updated_at IS NOT NULL,
  'audit_count',(SELECT count(*)::integer FROM public.admin_audit_logs
    WHERE target_type='holiday' AND target_id=${sqlLiteral(holidayCreateId)}
      AND action='holiday.created' AND actor_id=${sqlLiteral(managerA.userId)}::uuid))
  FROM public.holidays WHERE id=${sqlLiteral(holidayCreateId)}::uuid`) : null;
const holidayInvalidRange = await managerA.client.rpc('hris_save_org_holiday', {
  p_tenant_id: ids.tenantA, p_holiday_id: null, p_name: 'Invalid Range',
  p_start_date: '2099-12-22', p_end_date: '2099-12-21', p_holiday_type: 'qa_test',
  p_description: null, p_active: true,
});
const holidayCrossTenantUpdate = holidayCreateId ? await managerB.client.rpc('hris_save_org_holiday', {
  p_tenant_id: ids.tenantA, p_holiday_id: holidayCreateId, p_name: 'Cross Tenant Attempt',
  p_start_date: '2099-12-20', p_end_date: '2099-12-21', p_holiday_type: 'qa_test',
  p_description: null, p_active: true,
}) : { error: new Error('Holiday create failed; cross-tenant update was not attempted.') };
const holidayDirectInsert = await managerA.client.from('holidays').insert({
  tenant_id: ids.tenantA, name: 'Direct Table Write Attempt',
  start_date: '2099-12-23', end_date: '2099-12-23', active: true,
});
const holidayAnonRead = await createClient(services.API_URL, services.ANON_KEY, authOptions)
  .rpc('hris_get_org_holiday_calendar', { p_tenant_id: ids.tenantA });
record('Holiday calendar reads are limited to active tenant holidays.manage membership',
  !holidayCalendarA.error && !holidayCalendarB.error
    && holidayCalendarA.data.some(holiday => holiday.name === 'Synthetic QA holiday')
    && !holidayCalendarA.data.some(holiday => holiday.name === 'Synthetic QA holiday B')
    && holidayCalendarB.data.some(holiday => holiday.name === 'Synthetic QA holiday B')
    && !holidayCalendarB.data.some(holiday => holiday.name === 'Synthetic QA holiday')
    && Boolean(holidayCrossTenantRead.error?.code === '42501')
    && Boolean(holidayEmployeeRead.error?.code === '42501')
    && Boolean(holidayGlobalOnlyRead.error?.code === '42501')
    && Boolean(holidayAnonRead.error),
  JSON.stringify({ tenantACount: holidayCalendarA.data?.length, tenantBCount: holidayCalendarB.data?.length,
    crossTenant: holidayCrossTenantRead.error?.code, employee: holidayEmployeeRead.error?.code,
    globalOnly: holidayGlobalOnlyRead.error?.code, anonymous: holidayAnonRead.error?.code }));
record('Holiday manager can persist tenant calendar entries with audit history; invalid, cross-tenant, and direct writes are denied',
  !holidayCreate.error && holidayPersisted?.tenant_id === ids.tenantA
    && holidayPersisted.name === 'Isolated Calendar Acceptance Day'
    && holidayPersisted.start_date === '2099-12-20' && holidayPersisted.end_date === '2099-12-21'
    && holidayPersisted.holiday_type === 'qa_test'
    && holidayPersisted.description === 'Synthetic calendar RPC persistence check.'
    && holidayPersisted.active === true && holidayPersisted.created_at === true
    && holidayPersisted.updated_at === true && holidayPersisted.audit_count === 1
    && Boolean(holidayInvalidRange.error?.code === '22000')
    && Boolean(holidayCrossTenantUpdate.error?.code === '42501')
    && Boolean(holidayDirectInsert.error),
  JSON.stringify({ createError: holidayCreate.error?.code, persisted: holidayPersisted,
    invalidRange: holidayInvalidRange.error?.code, crossTenantUpdate: holidayCrossTenantUpdate.error?.code,
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
} finally {
  if (uploadedEvidencePaths.length) {
    const removed = await adminAuth.storage.from('leave-evidence').remove(uploadedEvidencePaths);
    if (removed.error) throw removed.error;
  }
  if (createdEvidenceBucket) {
    const deletedBucket = await adminAuth.storage.deleteBucket('leave-evidence');
    if (deletedBucket.error) throw deletedBucket.error;
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
    if (deletedBucket.error) throw deletedBucket.error;
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
    if (deletedBucket.error) throw deletedBucket.error;
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
    if (deletedBucket.error) throw deletedBucket.error;
  }
  if (attendanceTenantGuardStoragePaths.length) {
    const attendanceStorage = adminAuth.storage.from('attendance-evidence');
    const removed = await attendanceStorage.remove(attendanceTenantGuardStoragePaths);
    if (removed.error) throw removed.error;
  }
  if (createdAttendanceTenantGuardBucket) {
    const deleted = await adminAuth.storage.deleteBucket('attendance-evidence');
    if (deleted.error) throw deleted.error;
  }
  if (candidateTenantGuardStoragePaths.length) {
    const candidateStorage = adminAuth.storage.from('candidate-documents');
    const removed = await candidateStorage.remove(candidateTenantGuardStoragePaths);
    if (removed.error) throw removed.error;
  }
  if (createdCandidateTenantGuardBucket) {
    const deleted = await adminAuth.storage.deleteBucket('candidate-documents');
    if (deleted.error) throw deleted.error;
  }
  const employeeDocumentStorage = adminAuth.storage.from('employee-documents');
  if (employeeDocumentsBucketSafeToClean && employeeDocumentStoragePaths.length) {
    const removed = await employeeDocumentStorage.remove(employeeDocumentStoragePaths);
    if (removed.error) throw removed.error;
  }
  if (createdEmployeeDocumentsBucket) {
    const deletedBucket = await adminAuth.storage.deleteBucket('employee-documents');
    if (deletedBucket.error) throw deletedBucket.error;
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
