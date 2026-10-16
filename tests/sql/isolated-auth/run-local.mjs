// Run only against a disposable Supabase CLI stack. The local GoTrue service
// creates real synthetic Auth sessions; psql uses their JWT claims as the
// authenticated database role so RLS and SECURITY DEFINER paths are exercised.
// This harness never logs local API keys, access tokens, or synthetic passwords.
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
for (const file of [
  path.join(here, 'fixture.sql'),
  path.join(here, 'recruitment-fixture.sql'),
  path.join(mainRoot, 'supabase/migrations/20261011_02_hris_revoke_anon_helpers.sql'),
  path.join(mainRoot, 'supabase/migrations/20261012091930_hris_tenant_membership_role_permissions.sql'),
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
  path.join(mainRoot, 'supabase/migrations/20261014171952_employee_contact_details_editing.sql'),
  path.join(mainRoot, 'supabase/migrations/20261015173616_prevent_direct_employee_row_updates.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013124000_hris_appraisal_narrative_workflow.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013130829_hris_recruitment_pipeline_read.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013170556_hris_candidate_assessment_journey.sql'),
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
  // Apply the newest Candidate stage-history contract after older notification
  // migrations that recreate its check constraint.
  path.join(mainRoot, 'supabase/migrations/20261016081154_hris_candidate_interview_completion.sql'),
  path.join(mainRoot, 'supabase/migrations/20261016092922_candidate_context_authenticated_execute.sql'),
  path.join(mainRoot, 'supabase/migrations/20261016171104_employee_family_tenant_scoped_read.sql'),
]) applySql(file);
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
  'authenticated',has_function_privilege('authenticated','public.hris_get_tenant_payroll_register(uuid,uuid,text,text,integer,integer)','EXECUTE'))`);
const payrollSensitiveKeys = ['bank_name','bank_account_no','tax_identification_no','note'];
record('Payroll register exposes tenant A rows only to an active payroll.view member using a safe field whitelist',
  !payrollRegister.error && payrollRegister.data?.tenant_id === ids.tenantA
    && payrollRegister.data.total_count === 3 && payrollRegister.data.payslips.length === 3
    && payrollRegister.data.periods.length === 1
    && payrollRegister.data.periods[0].id === '99999999-0000-4000-8000-000000000001'
    && !payrollRegister.data.periods.some(row => row.id === '99999999-0000-4000-8000-000000000002')
    && payrollRegister.data.payslips.some(row => row.employee_number === 'QA-A-001' && row.status === 'released')
    && payrollRegister.data.payslips.some(row => row.employee_number === 'QA-A-003' && row.status === 'released')
    && payrollRegister.data.payslips.some(row => row.employee_number === 'QA-A-001' && row.status === 'draft')
    && payrollRegister.data.payslips.every(row => !payrollSensitiveKeys.some(key => key in row))
    && !payrollRegister.data.payslips.some(row => row.employee_number === 'QA-B-001'),
  JSON.stringify({ error: payrollRegister.error?.code || null, periodCount: payrollRegister.data?.periods?.length,
    total: payrollRegister.data?.total_count, employees: payrollRegister.data?.payslips?.map(row => [row.employee_number,row.status]),
    sensitiveFields: payrollRegister.data?.payslips?.flatMap(row => payrollSensitiveKeys.filter(key => key in row)) }));
record('Payroll register filters status/search and paginates without client-side salary arithmetic',
  !payrollRegisterReleased.error && payrollRegisterReleased.data?.total_count === 1
    && payrollRegisterReleased.data.payslips.length === 1
    && payrollRegisterReleased.data.payslips[0].id === '99999999-0000-4000-8000-000000000101'
    && !payrollRegisterPage.error && payrollRegisterPage.data?.total_count === 3
    && payrollRegisterPage.data.payslips.length === 1
    && Boolean(payrollRegisterForeignPeriod.error?.code === '22023')
    && Boolean(payrollRegisterInvalidStatus.error?.code === '22023'),
  JSON.stringify({ filtered: payrollRegisterReleased.data?.payslips?.map(row => row.id),
    total: payrollRegisterReleased.data?.total_count, pageRows: payrollRegisterPage.data?.payslips?.length,
    foreignPeriod: payrollRegisterForeignPeriod.error?.code, badStatus: payrollRegisterInvalidStatus.error?.code }));
record('Payroll register denies cross-tenant, unlinked, global-only, and anonymous access and excludes anonymous RPC execute',
  Boolean(payrollRegisterCrossTenant.error?.code === '42501')
    && Boolean(payrollRegisterNoPermission.error?.code === '42501')
    && Boolean(payrollRegisterGlobalOnly.error?.code === '42501')
    && Boolean(payrollRegisterEmployee.error?.code === '42501')
    && Boolean(payrollRegisterAnonymous.error)
    && payrollRegisterAcl.anon === false && payrollRegisterAcl.authenticated === true,
  JSON.stringify({ codes: [payrollRegisterCrossTenant.error?.code,payrollRegisterNoPermission.error?.code,
    payrollRegisterGlobalOnly.error?.code,payrollRegisterEmployee.error?.code,payrollRegisterAnonymous.error?.code], acl: payrollRegisterAcl }));
const employeePayslip = payslipA.data?.payslips?.[0];
record('Employee payslip history returns only the linked employee’s released rows with recorded amounts and same-tenant period details',
  !payslipA.error && payslipA.data?.tenant_id === ids.tenantA
    && payslipA.data.payslips.length === 1
    && employeePayslip?.id === '99999999-0000-4000-8000-000000000101'
    && employeePayslip?.currency === 'BDT'
    && employeePayslip?.gross_earnings === 167000
    && employeePayslip?.total_deductions === 15000
    && employeePayslip?.net_salary === 152000
    && employeePayslip?.period?.id === '99999999-0000-4000-8000-000000000001'
    && employeePayslip?.period?.name === 'September 2026'
    && employeePayslip?.period?.start_date === '2026-09-01'
    && employeePayslip?.period?.end_date === '2026-09-30'
    && employeePayslip?.period?.pay_date === '2026-10-05'
    && !['bank_name', 'bank_account_no', 'tax_identification_no', 'note'].some(key => key in employeePayslip),
  JSON.stringify({ error: payslipA.error?.code || null, ids: payslipA.data?.payslips?.map(row => row.id),
    amount: employeePayslip?.net_salary, period: employeePayslip?.period?.name,
    sensitiveKeys: employeePayslip ? Object.keys(employeePayslip).filter(key => ['bank_name', 'bank_account_no', 'tax_identification_no', 'note'].includes(key)) : [] }));
record('Payslip RPC enforces tenant and linked-employee access and denies anonymous callers',
  !payslipB.error && payslipB.data?.tenant_id === ids.tenantB
    && payslipB.data.payslips.length === 1
    && payslipB.data.payslips[0].id === '99999999-0000-4000-8000-000000000201'
    && payslipCrossTenant.error?.code === '42501'
    && payslipNoPermission.error?.code === '42501'
    && payslipGlobalOnly.error?.code === '42501'
    && Boolean(payslipAnonymous.error)
    && payslipAcl.anon === false && payslipAcl.authenticated === true
    && payslipAcl.rls === true,
  JSON.stringify({ tenantBRows: payslipB.data?.payslips?.map(row => row.id),
    denialCodes: [payslipCrossTenant.error?.code, payslipNoPermission.error?.code, payslipGlobalOnly.error?.code, payslipAnonymous.error?.code],
    acl: payslipAcl }));
const directPayslipsA = await employeeA.client.from('payslips').select('id,tenant_id,employee_id,status').eq('tenant_id', ids.tenantA);
const directPayslipsB = await employeeB.client.from('payslips').select('id,tenant_id,employee_id,status').eq('tenant_id', ids.tenantB);
const directPayslipInsert = await employeeA.client.from('payslips').insert({
  id: '99999999-0000-4000-8000-000000000104', tenant_id: ids.tenantA,
  pay_period_id: '99999999-0000-4000-8000-000000000001',
  employee_id: '55555555-5555-4555-8555-555555555555', status: 'released',
});
const directPayslipUpdate = await employeeA.client.from('payslips').update({ status: 'void' })
  .eq('id', '99999999-0000-4000-8000-000000000101').select('id');
const payslipAfterDirectWrite = queryAdmin(`SELECT jsonb_build_object(
  'status',status,'count',(SELECT count(*)::integer FROM public.payslips
    WHERE id='99999999-0000-4000-8000-000000000104'::uuid))
  FROM public.payslips WHERE id='99999999-0000-4000-8000-000000000101'::uuid`);
record('Payslip table RLS exposes only each employee’s own released rows and hides drafts and other employees',
  !directPayslipsA.error && directPayslipsA.data.length === 1
    && directPayslipsA.data[0].id === '99999999-0000-4000-8000-000000000101'
    && directPayslipsA.data.every(row => row.tenant_id === ids.tenantA
      && row.employee_id === '55555555-5555-4555-8555-555555555555' && row.status === 'released')
    && !directPayslipsB.error && directPayslipsB.data.length === 1
    && directPayslipsB.data[0].id === '99999999-0000-4000-8000-000000000201'
    && directPayslipsB.data.every(row => row.tenant_id === ids.tenantB
      && row.employee_id === '66666666-6666-4666-8666-666666666666' && row.status === 'released')
    && payslipAcl.rls === true
    && Boolean(directPayslipInsert.error?.code === '42501')
    && !directPayslipUpdate.error && directPayslipUpdate.data.length === 0
    && payslipAfterDirectWrite.status === 'released' && payslipAfterDirectWrite.count === 0,
  JSON.stringify({ tenantA: directPayslipsA.data?.map(row => row.id), tenantB: directPayslipsB.data?.map(row => row.id),
    aError: directPayslipsA.error?.code || null, bError: directPayslipsB.error?.code || null,
    insertCode: directPayslipInsert.error?.code || null, updateRows: directPayslipUpdate.data?.length,
    afterWrite: payslipAfterDirectWrite }));
const learningContextA = await employeeA.client.rpc('hris_get_my_learning_context', { p_tenant_id: ids.tenantA });
const learningContextB = await employeeB.client.rpc('hris_get_my_learning_context', { p_tenant_id: ids.tenantB });
const learningCrossTenant = await employeeA.client.rpc('hris_get_my_learning_context', { p_tenant_id: ids.tenantB });
const learningNoPermission = await noPermission.client.rpc('hris_get_my_learning_context', { p_tenant_id: ids.tenantA });
const learningGlobalOnly = await globalOnly.client.rpc('hris_get_my_learning_context', { p_tenant_id: ids.tenantA });
const learningAnonymous = await createClient(services.API_URL, services.ANON_KEY, authOptions)
  .rpc('hris_get_my_learning_context', { p_tenant_id: ids.tenantA });
record('Learning catalog and personal history are scoped to each active employee tenant',
  !learningContextA.error && learningContextA.data?.employee_id === '55555555-5555-4555-8555-555555555555'
    && learningContextA.data.programs.some(row => row.id === learningIds.directProgram)
    && !learningContextA.data.programs.some(row => row.id === learningIds.tenantBProgram || row.title === 'QA A Inactive Learning')
    && learningContextA.data.enrollments.length === 1
    && learningContextA.data.enrollments[0].id === learningIds.mandatoryEnrollment
    && learningContextA.data.skills.some(row => row.skill_name === 'Communication' && row.verified)
    && !learningContextB.error && learningContextB.data.employee_id === '66666666-6666-4666-8666-666666666666'
    && learningContextB.data.programs.length === 1 && learningContextB.data.programs[0].id === learningIds.tenantBProgram
    && learningContextB.data.enrollments.length === 1
    && Boolean(learningCrossTenant.error?.code === '42501'),
  JSON.stringify({ aError: learningContextA.error?.code || null,
    aEmployee: learningContextA.data?.employee_id,
    aPrograms: learningContextA.data?.programs?.map(row => row.id),
    aEnrollments: learningContextA.data?.enrollments?.map(row => row.id),
    aSkills: learningContextA.data?.skills?.map(row => row.skill_name),
    bError: learningContextB.error?.code || null,
    bEmployee: learningContextB.data?.employee_id,
    bPrograms: learningContextB.data?.programs?.map(row => row.id),
    bEnrollments: learningContextB.data?.enrollments?.map(row => row.id),
    crossCode: learningCrossTenant.error?.code || null }));
record('Learning context denies unlinked, global-only, and anonymous callers',
  Boolean(learningNoPermission.error?.code === '42501')
    && Boolean(learningGlobalOnly.error?.code === '42501') && Boolean(learningAnonymous.error));

const ownSkillCreate = await employeeA.client.rpc('hris_employee_save_my_skill', {
  p_tenant_id: ids.tenantA, p_skill_id: null, p_skill_name: 'Systems thinking', p_proficiency: 'Applied in delivery',
});
const duplicateSkillCreate = await employeeA.client.rpc('hris_employee_save_my_skill', {
  p_tenant_id: ids.tenantA, p_skill_id: null, p_skill_name: ' systems THINKING ', p_proficiency: null,
});
const ownSkillUpdate = await employeeA.client.rpc('hris_employee_save_my_skill', {
  p_tenant_id: ids.tenantA, p_skill_id: ownSkillCreate.data?.id,
  p_skill_name: 'Systems thinking and delivery', p_proficiency: null,
});
const ownSkillContext = await employeeA.client.rpc('hris_get_my_learning_context', { p_tenant_id: ids.tenantA });
const persistedOwnSkill = ownSkillCreate.data?.id
  ? queryAdmin(`SELECT to_jsonb(s) FROM public.employee_skills s WHERE id='${ownSkillCreate.data.id}'::uuid`)
  : null;
const verifiedSkillId = queryAdmin(`SELECT jsonb_build_object('id',id::text) FROM public.employee_skills
  WHERE employee_id='55555555-5555-4555-8555-555555555555'::uuid AND skill_name='Communication' AND verified IS TRUE`).id;
record('Employees create and edit their own tenant-linked skill profile with self-reported unverified data',
  !ownSkillCreate.error && ownSkillCreate.data?.verified === false
    && Boolean(duplicateSkillCreate.error?.code === '23505')
    && !ownSkillUpdate.error && ownSkillUpdate.data?.skill_name === 'Systems thinking and delivery'
    && !ownSkillContext.error && ownSkillContext.data?.skills.some(row => row.id === ownSkillCreate.data?.id
      && row.skill_name === 'Systems thinking and delivery' && row.verified === false)
    && persistedOwnSkill?.employee_id === '55555555-5555-4555-8555-555555555555'
    && persistedOwnSkill?.proficiency === null,
  JSON.stringify({ createCode: ownSkillCreate.error?.code || null,
    duplicateCode: duplicateSkillCreate.error?.code || null,
    updateCode: ownSkillUpdate.error?.code || null,
    returned: ownSkillContext.data?.skills?.find(row => row.id === ownSkillCreate.data?.id),
    persistedEmployee: persistedOwnSkill?.employee_id, verified: persistedOwnSkill?.verified }));
const crossTenantSkillEdit = await employeeB.client.rpc('hris_employee_save_my_skill', {
  p_tenant_id: ids.tenantB, p_skill_id: ownSkillCreate.data?.id,
  p_skill_name: 'Unauthorized cross-tenant edit', p_proficiency: null,
});
const wrongTenantSkillEdit = await employeeA.client.rpc('hris_employee_save_my_skill', {
  p_tenant_id: ids.tenantB, p_skill_id: ownSkillCreate.data?.id,
  p_skill_name: 'Wrong tenant edit', p_proficiency: null,
});
const verifiedSkillEdit = await employeeA.client.rpc('hris_employee_save_my_skill', {
  p_tenant_id: ids.tenantA, p_skill_id: verifiedSkillId,
  p_skill_name: 'Unverified overwrite attempt', p_proficiency: 'Self-reported',
});
const verifiedSkillDelete = await employeeA.client.rpc('hris_employee_delete_my_skill', {
  p_tenant_id: ids.tenantA, p_skill_id: verifiedSkillId,
});
const anonymousSkillWrite = await createClient(services.API_URL, services.ANON_KEY, authOptions)
  .rpc('hris_employee_save_my_skill', { p_tenant_id: ids.tenantA, p_skill_id: null, p_skill_name: 'Anonymous skill' });
const directSkillRead = await employeeA.client.from('employee_skills').select('id,employee_id,skill_name');
const directSkillWrite = await employeeA.client.from('employee_skills').insert({
  employee_id: '55555555-5555-4555-8555-555555555555', skill_name: 'Direct table write', verified: true,
});
const verifiedSkillAfterAttempts = queryAdmin(`SELECT jsonb_build_object('name',skill_name,'verified',verified)
  FROM public.employee_skills WHERE id='${verifiedSkillId}'::uuid`);
record('Skill profile RPC denies cross-tenant, anonymous, direct-table, and verified-skill mutations',
  Boolean(crossTenantSkillEdit.error?.code === '42501')
    && Boolean(wrongTenantSkillEdit.error?.code === '42501')
    && Boolean(verifiedSkillEdit.error?.code === '42501')
    && Boolean(verifiedSkillDelete.error?.code === '42501')
    && Boolean(anonymousSkillWrite.error)
    && Boolean(directSkillRead.error) && Boolean(directSkillWrite.error)
    && verifiedSkillAfterAttempts.name === 'Communication' && verifiedSkillAfterAttempts.verified === true,
  JSON.stringify({ crossTenant: crossTenantSkillEdit.error?.code || null,
    wrongTenant: wrongTenantSkillEdit.error?.code || null,
    verifiedEdit: verifiedSkillEdit.error?.code || null,
    verifiedDelete: verifiedSkillDelete.error?.code || null,
    anonymous: anonymousSkillWrite.error?.code || null,
    directRead: directSkillRead.error?.code || null, directWrite: directSkillWrite.error?.code || null,
    verifiedAfter: verifiedSkillAfterAttempts }));
const ownSkillDelete = await employeeA.client.rpc('hris_employee_delete_my_skill', {
  p_tenant_id: ids.tenantA, p_skill_id: ownSkillCreate.data?.id,
});
const ownSkillAfterDelete = queryAdmin(`SELECT jsonb_build_object('count',count(*)::integer) FROM public.employee_skills
  WHERE id='${ownSkillCreate.data?.id}'::uuid AND employee_id='55555555-5555-4555-8555-555555555555'::uuid`).count;
record('Employees can remove their own unverified skill and the removal persists',
  !ownSkillDelete.error && ownSkillDelete.data?.deleted === true && Number(ownSkillAfterDelete) === 0,
  JSON.stringify({ deleteCode: ownSkillDelete.error?.code || null, remainingRows: Number(ownSkillAfterDelete) }));

const learningDirectProgramsA = await employeeA.client.from('learning_programs').select('id,title').eq('tenant_id', ids.tenantA);
const learningDirectProgramsB = await employeeB.client.from('learning_programs').select('id,title').eq('tenant_id', ids.tenantB);
const learningDirectEnrollmentsA = await employeeA.client.from('learning_enrollments').select('id,tenant_id,employee_id,status').eq('tenant_id', ids.tenantA);
const learningDirectWrite = await employeeA.client.from('learning_enrollments').insert({
  tenant_id: ids.tenantA, employee_id: '55555555-5555-4555-8555-555555555555',
  program_id: learningIds.directProgram, source: 'self_enrollment', status: 'enrolled', mandatory: false,
});
record('Learning table RLS exposes only authorized catalog rows and own enrollment history; direct writes are denied',
  !learningDirectProgramsA.error && learningDirectProgramsA.data.some(row => row.id === learningIds.directProgram)
    && !learningDirectProgramsA.data.some(row => row.id === learningIds.tenantBProgram)
    && !learningDirectProgramsB.error && learningDirectProgramsB.data.length === 1
    && learningDirectProgramsB.data[0].id === learningIds.tenantBProgram
    && !learningDirectEnrollmentsA.error && learningDirectEnrollmentsA.data.length === 1
    && learningDirectEnrollmentsA.data.every(row => row.employee_id === '55555555-5555-4555-8555-555555555555')
    && Boolean(learningDirectWrite.error));

const directLearningEnrollment = await employeeA.client.rpc('hris_employee_enroll_learning', {
  p_tenant_id: ids.tenantA, p_program_id: learningIds.directProgram, p_session_id: learningIds.directSession,
});
const duplicateLearningEnrollment = await employeeA.client.rpc('hris_employee_enroll_learning', {
  p_tenant_id: ids.tenantA, p_program_id: learningIds.directProgram, p_session_id: learningIds.directSession,
});
const directLearningRow = directLearningEnrollment.data?.id
  ? queryAdmin(`SELECT to_jsonb(e) FROM public.learning_enrollments e WHERE id=${sqlLiteral(directLearningEnrollment.data.id)}::uuid`)
  : null;
record('Employees can enroll in an enabled program and duplicates are rejected by the database',
  !directLearningEnrollment.error && directLearningEnrollment.data?.status === 'enrolled'
    && directLearningRow?.tenant_id === ids.tenantA
    && directLearningRow?.employee_id === '55555555-5555-4555-8555-555555555555'
    && directLearningRow?.source === 'self_enrollment'
    && Boolean(duplicateLearningEnrollment.error?.code === '23505'));

const learningJoinLinksA = await employeeA.client.rpc('hris_get_my_learning_join_links', { p_tenant_id: ids.tenantA });
const learningJoinLinksForeignTenant = await employeeB.client.rpc('hris_get_my_learning_join_links', { p_tenant_id: ids.tenantA });
const anonymousLearningJoinLinks = attemptAs(null,
  `SELECT public.hris_get_my_learning_join_links('${ids.tenantA}'::uuid)`, 'anon');
const learningJoinLinkAcl = queryAdmin(`SELECT jsonb_build_object(
  'anon',has_function_privilege('anon','public.hris_get_my_learning_join_links(uuid)','EXECUTE'),
  'authenticated',has_function_privilege('authenticated','public.hris_get_my_learning_join_links(uuid)','EXECUTE'))`);
record('Only an enrolled employee receives their tenant-bound scheduled session join URL',
  !directLearningEnrollment.error && typeof learningJoinLinksA.data?.[directLearningEnrollment.data.id] === 'string'
    && learningJoinLinksA.data[directLearningEnrollment.data.id] === 'https://meet.example.test/qa-learning'
    && !learningJoinLinksForeignTenant.error && Object.keys(learningJoinLinksForeignTenant.data || {}).length === 0
    && !anonymousLearningJoinLinks.ok && learningJoinLinkAcl.anon === false
    && learningJoinLinkAcl.authenticated === true,
  JSON.stringify({ enrollment: directLearningEnrollment.error?.code || directLearningEnrollment.data?.status,
    linksA: learningJoinLinksA.data, foreignTenant: learningJoinLinksForeignTenant.data,
    anonymous: anonymousLearningJoinLinks.ok ? 'unexpectedly accepted' : 'denied', acl: learningJoinLinkAcl }));

const approvalRequest = await employeeA.client.rpc('hris_employee_request_learning', {
  p_tenant_id: ids.tenantA, p_program_id: learningIds.approvalProgram,
  p_session_id: learningIds.approvalSession, p_reason: '  Build leadership skills  ',
});
const approvalRequestRow = approvalRequest.data?.id
  ? queryAdmin(`SELECT to_jsonb(e) FROM public.learning_enrollments e WHERE id=${sqlLiteral(approvalRequest.data.id)}::uuid`)
  : null;
const requestViaDirectEnroll = await employeeA.client.rpc('hris_employee_enroll_learning', {
  p_tenant_id: ids.tenantA, p_program_id: learningIds.approvalProgram, p_session_id: learningIds.approvalSession,
});
const requestViaApprovalForOpenProgram = await employeeA.client.rpc('hris_employee_request_learning', {
  p_tenant_id: ids.tenantA, p_program_id: learningIds.directProgram, p_session_id: learningIds.directSession, p_reason: null,
});
const requestWrongSession = await employeeA.client.rpc('hris_employee_request_learning', {
  p_tenant_id: ids.tenantA, p_program_id: learningIds.approvalProgram, p_session_id: learningIds.tenantBSession, p_reason: null,
});
record('Approval-only learning creates a pending request and rejects the wrong action or cross-program session',
  !approvalRequest.error && approvalRequest.data?.status === 'requested'
    && approvalRequestRow?.source === 'employee_request' && approvalRequestRow?.status === 'requested'
    && approvalRequestRow?.recommendation_reason === 'Build leadership skills'
    && Boolean(requestViaDirectEnroll.error?.code === '42501')
    && Boolean(requestViaApprovalForOpenProgram.error?.code === '42501')
    && Boolean(requestWrongSession.error?.code === '22023'));

const capacityDenied = await employeeA.client.rpc('hris_employee_enroll_learning', {
  p_tenant_id: ids.tenantA, p_program_id: learningIds.fullProgram, p_session_id: learningIds.fullSession,
});
const capacityRace = await Promise.all([
  employeeA.client.rpc('hris_employee_enroll_learning', {
    p_tenant_id: ids.tenantA, p_program_id: learningIds.concurrentProgram, p_session_id: learningIds.concurrentSession,
  }),
  managerA2.client.rpc('hris_employee_enroll_learning', {
    p_tenant_id: ids.tenantA, p_program_id: learningIds.concurrentProgram, p_session_id: learningIds.concurrentSession,
  }),
]);
const concurrentSeatCount = queryAdmin(`SELECT jsonb_build_object('count',count(*)::integer) FROM public.learning_enrollments
  WHERE tenant_id='${ids.tenantA}'::uuid AND session_id='${learningIds.concurrentSession}'::uuid AND status='enrolled'`).count;
record('Learning session capacity is enforced, including concurrent enrollment attempts',
  Boolean(capacityDenied.error?.code === '22023')
    && capacityRace.filter(result => !result.error).length === 1
    && capacityRace.filter(result => result.error?.code === '22023').length === 1
    && Number(concurrentSeatCount) === 1,
  JSON.stringify({ fullSessionCode: capacityDenied.error?.code || null,
    concurrentCodes: capacityRace.map(result => result.error?.code || 'accepted'),
    concurrentSeatCount: Number(concurrentSeatCount) }));

const directCancel = await employeeA.client.rpc('hris_employee_cancel_learning', {
  p_tenant_id: ids.tenantA, p_id: directLearningEnrollment.data?.id,
});
const ownRequestCancel = await employeeA.client.rpc('hris_employee_cancel_learning', {
  p_tenant_id: ids.tenantA, p_id: approvalRequest.data?.id,
});
const otherEmployeeCancel = await managerA2.client.rpc('hris_employee_cancel_learning', {
  p_tenant_id: ids.tenantA, p_id: learningIds.mandatoryEnrollment,
});
const mandatoryCancel = await employeeA.client.rpc('hris_employee_cancel_learning', {
  p_tenant_id: ids.tenantA, p_id: learningIds.mandatoryEnrollment,
});
const cancelledLearningRow = queryAdmin(`SELECT to_jsonb(e) FROM public.learning_enrollments e WHERE id=${sqlLiteral(directLearningEnrollment.data?.id)}::uuid`);
const cancelledRequestRow = queryAdmin(`SELECT to_jsonb(e) FROM public.learning_enrollments e WHERE id=${sqlLiteral(approvalRequest.data?.id)}::uuid`);
const mandatoryLearningRow = queryAdmin(`SELECT to_jsonb(e) FROM public.learning_enrollments e WHERE id='${learningIds.mandatoryEnrollment}'::uuid`);
record('Employees can cancel only their own non-mandatory open learning and requests',
  !directCancel.error && !ownRequestCancel.error
    && cancelledLearningRow.status === 'cancelled' && cancelledRequestRow.status === 'cancelled'
    && Boolean(otherEmployeeCancel.error?.code === '42501')
    && Boolean(mandatoryCancel.error?.code === '42501') && mandatoryLearningRow.status === 'enrolled');

const managerQueueA = await learningManagerA.client.rpc('hris_get_learning_requests', { p_tenant_id: ids.tenantA });
const managerQueueCrossTenant = await learningManagerA.client.rpc('hris_get_learning_requests', { p_tenant_id: ids.tenantB });
const ordinaryManagerQueue = await managerA.client.rpc('hris_get_learning_requests', { p_tenant_id: ids.tenantA });
const tenantBManagerQueue = await managerB.client.rpc('hris_get_learning_requests', { p_tenant_id: ids.tenantB });
const employeeLearningQueue = await employeeA.client.rpc('hris_get_learning_requests', { p_tenant_id: ids.tenantA });
const globalOnlyLearningQueue = await globalOnly.client.rpc('hris_get_learning_requests', { p_tenant_id: ids.tenantA });
const managerQueueDirectA = await learningManagerA.client.from('learning_enrollments')
  .select('id,tenant_id,status').eq('tenant_id', ids.tenantA);
const managerQueueDirectB = await learningManagerA.client.from('learning_enrollments')
  .select('id,tenant_id,status').eq('tenant_id', ids.tenantB);
record('Learning request queue requires active tenant learning.manage; ordinary managers, employees, global-only callers, and cross-tenant requests are denied',
  !managerQueueA.error && managerQueueA.data.length === 4
    && managerQueueA.data.some(row => row.id === learningIds.managerApprovalRequest)
    && managerQueueA.data.some(row => row.id === learningIds.managerRejectionRequest)
    && managerQueueA.data.some(row => row.id === learningIds.capacityRequestOne)
    && managerQueueA.data.some(row => row.id === learningIds.capacityRequestTwo)
    && Boolean(managerQueueCrossTenant.error?.code === '42501')
    && Boolean(ordinaryManagerQueue.error?.code === '42501')
    && Boolean(tenantBManagerQueue.error?.code === '42501')
    && Boolean(employeeLearningQueue.error?.code === '42501')
    && Boolean(globalOnlyLearningQueue.error?.code === '42501')
    && !managerQueueDirectA.error && managerQueueDirectA.data.every(row => row.tenant_id === ids.tenantA)
    && !managerQueueDirectB.error && managerQueueDirectB.data.length === 0);

const completionEnrollmentId = learningIds.mandatoryEnrollment;
const skillCountBeforeLearningVerify = Number(queryAdmin(`SELECT jsonb_build_object('count',count(*)::integer)
  FROM public.employee_skills WHERE employee_id='55555555-5555-4555-8555-555555555555'::uuid`).count);
const completionEvidenceProgramSave = await learningManagerA.client.rpc('hris_save_learning_program', {
  p_tenant_id: ids.tenantA, p_program_id: learningIds.directProgram, p_title: 'QA A Direct Learning',
  p_description: 'Synthetic self-enrollment course', p_category: 'Professional Development',
  p_provider: 'QA Provider', p_delivery_mode: 'online', p_duration_hours: 4,
  p_self_enrollment: true, p_target_skills: ['Communication', 'Planning'], p_active: true,
  p_completion_evidence_required: true,
});
const requiredCompletionProgram = queryAdmin(`SELECT jsonb_build_object(
  'required',completion_evidence_required,'tenant_id',tenant_id)
  FROM public.learning_programs WHERE id='${learningIds.directProgram}'::uuid`);
const missingRequiredCompletionEvidence = await employeeA.client.rpc('hris_employee_submit_learning_completion', {
  p_tenant_id: ids.tenantA, p_enrollment_id: completionEnrollmentId,
});
const requiredEnrollmentAfterMissingEvidence = queryAdmin(`SELECT to_jsonb(e) FROM public.learning_enrollments e WHERE id='${completionEnrollmentId}'::uuid`);

const optionalCompletionEnrollmentId = '92000000-0000-4000-8000-000000000009';
psqlSync(`INSERT INTO public.learning_enrollments(
  id,tenant_id,employee_id,program_id,source,status,mandatory,created_by
) VALUES (
  '${optionalCompletionEnrollmentId}','${ids.tenantA}','55555555-5555-4555-8555-555555555555',
  '${learningIds.approvalProgram}','admin_assignment','enrolled',true,NULL
);`);
const optionalCompletionSubmit = await employeeA.client.rpc('hris_employee_submit_learning_completion', {
  p_tenant_id: ids.tenantA, p_enrollment_id: optionalCompletionEnrollmentId,
});
const optionalCompletionVerify = await learningManagerA.client.rpc('hris_resolve_learning_completion', {
  p_tenant_id: ids.tenantA, p_enrollment_id: optionalCompletionEnrollmentId,
  p_decision: 'verified', p_reason: null,
});
const optionalCompletionProgram = queryAdmin(`SELECT jsonb_build_object(
  'required',completion_evidence_required) FROM public.learning_programs WHERE id='${learningIds.approvalProgram}'::uuid`);
const optionalCompletionRow = queryAdmin(`SELECT to_jsonb(e) FROM public.learning_enrollments e WHERE id='${optionalCompletionEnrollmentId}'::uuid`);
record('Learning evidence requirement defaults off but is enforced when a learning manager enables it',
  !completionEvidenceProgramSave.error && requiredCompletionProgram.required === true
    && requiredCompletionProgram.tenant_id === ids.tenantA
    && Boolean(missingRequiredCompletionEvidence.error?.code === '22023')
    && requiredEnrollmentAfterMissingEvidence.status === 'enrolled'
    && optionalCompletionProgram.required === false
    && !optionalCompletionSubmit.error && optionalCompletionSubmit.data?.status === 'pending_verification'
    && !optionalCompletionVerify.error && optionalCompletionVerify.data?.status === 'completed'
    && optionalCompletionRow.status === 'completed' && optionalCompletionRow.completion_evidence_path === null,
  JSON.stringify({ configuredRequired: requiredCompletionProgram.required,
    missingEvidence: missingRequiredCompletionEvidence.error?.code,
    missingEvidencePreservedEnrollment: requiredEnrollmentAfterMissingEvidence.status,
    defaultOptional: optionalCompletionProgram.required,
    optionalSubmission: optionalCompletionSubmit.error?.code || optionalCompletionSubmit.data?.status,
    optionalVerified: optionalCompletionRow.status }));

const initialCompletionEvidencePath = `${employeeA.userId}/${ids.tenantA}/${completionEnrollmentId}/${randomUUID()}`;
const initialCompletionEvidenceUpload = await employeeA.client.storage.from('learning-completion-evidence').upload(
  initialCompletionEvidencePath, new Blob(['%PDF-1.4\nSynthetic required completion evidence\n'], { type: 'application/pdf' }),
  { contentType: 'application/pdf', upsert: false },
);
if (initialCompletionEvidenceUpload.error) throw initialCompletionEvidenceUpload.error;
uploadedLearningEvidencePaths.push(initialCompletionEvidencePath);
const completionSubmit = await employeeA.client.rpc('hris_employee_submit_learning_completion', {
  p_tenant_id: ids.tenantA, p_enrollment_id: completionEnrollmentId,
  p_evidence_path: initialCompletionEvidencePath, p_evidence_name: 'initial-completion-proof.pdf',
});
const completionPending = queryAdmin(`SELECT to_jsonb(e) FROM public.learning_enrollments e WHERE id='${completionEnrollmentId}'::uuid`);
const duplicatePendingCompletionEnrollment = await employeeA.client.rpc('hris_employee_enroll_learning', {
  p_tenant_id: ids.tenantA, p_program_id: learningIds.directProgram, p_session_id: null,
});
const completionCrossTenant = await employeeB.client.rpc('hris_employee_submit_learning_completion', {
  p_tenant_id: ids.tenantA, p_enrollment_id: completionEnrollmentId,
});
const completionPersonalPending = await employeeA.client.rpc('hris_get_my_learning_completion_data', { p_tenant_id: ids.tenantA });
const completionPersonalCrossTenant = await employeeA.client.rpc('hris_get_my_learning_completion_data', { p_tenant_id: ids.tenantB });
const completionQueue = await learningManagerA.client.rpc('hris_get_learning_completion_queue', { p_tenant_id: ids.tenantA });
const completionOrdinaryManagerQueue = await managerA.client.rpc('hris_get_learning_completion_queue', { p_tenant_id: ids.tenantA });
const completionEmployeeQueue = await employeeA.client.rpc('hris_get_learning_completion_queue', { p_tenant_id: ids.tenantA });
const completionCrossTenantQueue = await learningManagerA.client.rpc('hris_get_learning_completion_queue', { p_tenant_id: ids.tenantB });
const completionGlobalOnlyQueue = await globalOnly.client.rpc('hris_get_learning_completion_queue', { p_tenant_id: ids.tenantA });
const completionDirectEvents = await employeeA.client.from('learning_completion_events').select('id');
record('Learning completion submission and personal history are employee-owned, tenant-isolated, and carry the configured evidence requirement',
  !completionSubmit.error && completionSubmit.data?.status === 'pending_verification'
    && completionPending.status === 'pending_verification' && completionPending.completed_at === null
    && completionPending.completion_verified_at === null && completionPending.completion_evidence_path === initialCompletionEvidencePath
    && Boolean(duplicatePendingCompletionEnrollment.error?.code === '23505')
    && Boolean(completionCrossTenant.error?.code === '42501')
    && !completionPersonalPending.error && completionPersonalPending.data.enrollments.some(row => row.id === completionEnrollmentId
      && row.status === 'pending_verification' && row.completion_evidence_required === true && row.completion_history.length === 1)
    && Boolean(completionPersonalCrossTenant.error?.code === '42501') && Boolean(completionDirectEvents.error),
  JSON.stringify({ submit: completionSubmit.error?.code || completionSubmit.data?.status,
    duplicateWhilePending: duplicatePendingCompletionEnrollment.error?.code,
    crossTenantSubmit: completionCrossTenant.error?.code,
    personalRows: completionPersonalPending.data?.enrollments?.length,
    crossTenantRead: completionPersonalCrossTenant.error?.code, directEventRead: completionDirectEvents.error?.code }));
record('Learning completion review queue requires active tenant learning.manage permission',
  !completionQueue.error && completionQueue.data.length === 1 && completionQueue.data[0].id === completionEnrollmentId
    && Boolean(completionOrdinaryManagerQueue.error?.code === '42501')
    && Boolean(completionEmployeeQueue.error?.code === '42501')
    && Boolean(completionCrossTenantQueue.error?.code === '42501')
    && Boolean(completionGlobalOnlyQueue.error?.code === '42501'),
  JSON.stringify({ count: completionQueue.data?.length, ordinaryManager: completionOrdinaryManagerQueue.error?.code,
    employee: completionEmployeeQueue.error?.code, crossTenant: completionCrossTenantQueue.error?.code,
    globalOnly: completionGlobalOnlyQueue.error?.code }));

const completionOrdinaryVerify = await managerA.client.rpc('hris_resolve_learning_completion', {
  p_tenant_id: ids.tenantA, p_enrollment_id: completionEnrollmentId, p_decision: 'verified', p_reason: null,
});
const completionEmployeeVerify = await employeeA.client.rpc('hris_resolve_learning_completion', {
  p_tenant_id: ids.tenantA, p_enrollment_id: completionEnrollmentId, p_decision: 'verified', p_reason: null,
});
const completionMissingReturnReason = await learningManagerA.client.rpc('hris_resolve_learning_completion', {
  p_tenant_id: ids.tenantA, p_enrollment_id: completionEnrollmentId,
  p_decision: 'returned_for_correction', p_reason: '  ',
});
const completionReturn = await learningManagerA.client.rpc('hris_resolve_learning_completion', {
  p_tenant_id: ids.tenantA, p_enrollment_id: completionEnrollmentId,
  p_decision: 'returned_for_correction', p_reason: 'Please provide supporting evidence for this assignment.',
});
const completionReturned = queryAdmin(`SELECT to_jsonb(e) FROM public.learning_enrollments e WHERE id='${completionEnrollmentId}'::uuid`);
const completionReturnedContext = await employeeA.client.rpc('hris_get_my_learning_completion_data', { p_tenant_id: ids.tenantA });
const duplicateReturnedCompletionEnrollment = await employeeA.client.rpc('hris_employee_enroll_learning', {
  p_tenant_id: ids.tenantA, p_program_id: learningIds.directProgram, p_session_id: null,
});
record('Learning enrollment is kept open while completion is pending verification or returned for correction',
  Boolean(duplicatePendingCompletionEnrollment.error?.code === '23505')
    && Boolean(duplicateReturnedCompletionEnrollment.error?.code === '23505'),
  JSON.stringify({ pendingDuplicate: duplicatePendingCompletionEnrollment.error?.code,
    returnedDuplicate: duplicateReturnedCompletionEnrollment.error?.code }));
record('Only learning.manage can verify or return; a return requires a reason and does not mark the assignment complete',
  Boolean(completionOrdinaryVerify.error?.code === '42501') && Boolean(completionEmployeeVerify.error?.code === '42501')
    && Boolean(completionMissingReturnReason.error?.code === '22023')
    && !completionReturn.error && completionReturn.data?.status === 'returned_for_correction'
    && Boolean(duplicateReturnedCompletionEnrollment.error?.code === '23505')
    && completionReturned.status === 'returned_for_correction' && completionReturned.completed_at === null
    && completionReturnedContext.data.notifications.some(row => row.kind === 'returned_for_correction'),
  JSON.stringify({ ordinary: completionOrdinaryVerify.error?.code, employee: completionEmployeeVerify.error?.code,
    missingReason: completionMissingReturnReason.error?.code, status: completionReturned.status,
    duplicateWhileReturned: duplicateReturnedCompletionEnrollment.error?.code,
    notifications: completionReturnedContext.data?.notifications?.length }));

const completionEvidencePath = `${employeeA.userId}/${ids.tenantA}/${completionEnrollmentId}/${randomUUID()}`;
const completionEvidenceUpload = await employeeA.client.storage.from('learning-completion-evidence').upload(
  completionEvidencePath, new Blob(['%PDF-1.4\nSynthetic completion evidence\n'], { type: 'application/pdf' }),
  { contentType: 'application/pdf', upsert: false },
);
if (completionEvidenceUpload.error) throw completionEvidenceUpload.error;
uploadedLearningEvidencePaths.push(completionEvidencePath);
const completionResubmit = await employeeA.client.rpc('hris_employee_submit_learning_completion', {
  p_tenant_id: ids.tenantA, p_enrollment_id: completionEnrollmentId,
  p_evidence_path: completionEvidencePath, p_evidence_name: 'completion-proof.pdf',
});
const completionOwnerEvidence = await employeeA.client.storage.from('learning-completion-evidence').download(completionEvidencePath);
const completionManagerEvidence = await learningManagerA.client.storage.from('learning-completion-evidence').download(completionEvidencePath);
const completionForeignEvidence = await employeeB.client.storage.from('learning-completion-evidence').download(completionEvidencePath);
record('Returned learning can be corrected and resubmitted with private evidence limited to the employee and learning manager',
  !completionResubmit.error && completionResubmit.data?.status === 'pending_verification'
    && !completionOwnerEvidence.error && !completionManagerEvidence.error && Boolean(completionForeignEvidence.error),
  JSON.stringify({ resubmit: completionResubmit.error?.code || completionResubmit.data?.status,
    owner: completionOwnerEvidence.error?.statusCode || 'allowed', manager: completionManagerEvidence.error?.statusCode || 'allowed',
    foreign: completionForeignEvidence.error?.statusCode || 'denied' }));

const completionVerify = await learningManagerA.client.rpc('hris_resolve_learning_completion', {
  p_tenant_id: ids.tenantA, p_enrollment_id: completionEnrollmentId, p_decision: 'verified', p_reason: 'Completion reviewed.',
});
const completionVerifiedRow = queryAdmin(`SELECT to_jsonb(e) FROM public.learning_enrollments e WHERE id='${completionEnrollmentId}'::uuid`);
const completionVerifiedContext = await employeeA.client.rpc('hris_get_my_learning_completion_data', { p_tenant_id: ids.tenantA });
const completionEvents = Number(queryAdmin(`SELECT jsonb_build_object('count',count(*)::integer) FROM public.learning_completion_events
  WHERE tenant_id='${ids.tenantA}'::uuid AND enrollment_id='${completionEnrollmentId}'::uuid`).count);
const completionAudit = Number(queryAdmin(`SELECT jsonb_build_object('count',count(*)::integer) FROM public.admin_audit_logs
  WHERE target_id='${completionEnrollmentId}' AND action LIKE 'learning.completion.%'`).count);
const skillCountAfterLearningVerify = Number(queryAdmin(`SELECT jsonb_build_object('count',count(*)::integer)
  FROM public.employee_skills WHERE employee_id='55555555-5555-4555-8555-555555555555'::uuid`).count);
const completionDuplicateVerify = await learningManagerA.client.rpc('hris_resolve_learning_completion', {
  p_tenant_id: ids.tenantA, p_enrollment_id: completionEnrollmentId,
  p_decision: 'returned_for_correction', p_reason: 'Cannot rewrite verified completion.',
});
record('Verified learning records its reviewer/date and employee history with notifications and audit, without awarding skills, certificates, or scores',
  !completionVerify.error && completionVerify.data?.status === 'completed'
    && completionVerify.data?.verified_by === learningManagerA.userId
    && completionVerifiedRow.status === 'completed'
    && completionVerifiedRow.completed_at === completionVerifiedRow.completion_verified_at
    && completionVerifiedRow.completion_verified_by === learningManagerA.userId
    && completionVerifiedRow.certificate_url === completionReturned.certificate_url
    && completionVerifiedContext.data.enrollments.some(row => row.id === completionEnrollmentId
      && row.status === 'completed' && row.completion_history.length === 4)
    && completionVerifiedContext.data.notifications.filter(row => row.enrollment_id === completionEnrollmentId).length === 2
    && completionEvents === 4 && completionAudit === 4
    && skillCountAfterLearningVerify === skillCountBeforeLearningVerify
    && Boolean(completionDuplicateVerify.error?.code === 'P0002'),
  JSON.stringify({ verified: completionVerify.error?.code || completionVerify.data?.status,
    reviewer: completionVerifiedRow.completion_verified_by, eventCount: completionEvents, auditCount: completionAudit,
    notifications: completionVerifiedContext.data?.notifications?.filter(row => row.enrollment_id === completionEnrollmentId).length,
    skillCountBefore: skillCountBeforeLearningVerify, skillCountAfter: skillCountAfterLearningVerify,
    duplicate: completionDuplicateVerify.error?.code }));

const unauthorizedDecision = await managerA.client.rpc('hris_resolve_learning_request', {
  p_tenant_id: ids.tenantA, p_id: learningIds.managerApprovalRequest,
  p_decision: 'enrolled', p_resolution_note: null,
});
const unauthorizedEmployeeDecision = await employeeA.client.rpc('hris_resolve_learning_request', {
  p_tenant_id: ids.tenantA, p_id: learningIds.managerApprovalRequest,
  p_decision: 'enrolled', p_resolution_note: null,
});
const approvedRequest = await learningManagerA.client.rpc('hris_resolve_learning_request', {
  p_tenant_id: ids.tenantA, p_id: learningIds.managerApprovalRequest,
  p_decision: 'enrolled', p_resolution_note: 'Approved for the November cohort.',
});
const duplicateApproval = await learningManagerA.client.rpc('hris_resolve_learning_request', {
  p_tenant_id: ids.tenantA, p_id: learningIds.managerApprovalRequest,
  p_decision: 'rejected', p_resolution_note: 'Must not overwrite the first decision.',
});
const approvedRequestRow = queryAdmin(`SELECT to_jsonb(e) FROM public.learning_enrollments e WHERE id='${learningIds.managerApprovalRequest}'::uuid`);
const approvedEmployeeContext = await managerA2.client.rpc('hris_get_my_learning_context', { p_tenant_id: ids.tenantA });
record('Learning manager can approve once with a persisted employee-visible note; ordinary manager, employee, and duplicate decision are denied',
  Boolean(unauthorizedDecision.error?.code === '42501')
    && Boolean(unauthorizedEmployeeDecision.error?.code === '42501')
    && !approvedRequest.error && approvedRequest.data?.status === 'enrolled'
    && Boolean(duplicateApproval.error?.code === 'P0002')
    && approvedRequestRow.status === 'enrolled'
    && approvedRequestRow.resolution_note === 'Approved for the November cohort.'
    && approvedEmployeeContext.data?.enrollments.some(row => row.id === learningIds.managerApprovalRequest
      && row.status === 'enrolled' && row.resolution_note === 'Approved for the November cohort.'));

const rejectedRequest = await learningManagerA.client.rpc('hris_resolve_learning_request', {
  p_tenant_id: ids.tenantA, p_id: learningIds.managerRejectionRequest,
  p_decision: 'rejected', p_resolution_note: 'Please choose a later session.',
});
const rejectedRequestRow = queryAdmin(`SELECT to_jsonb(e) FROM public.learning_enrollments e WHERE id='${learningIds.managerRejectionRequest}'::uuid`);
record('Learning manager can reject a pending request and preserve the optional decision note',
  !rejectedRequest.error && rejectedRequest.data?.status === 'rejected'
    && rejectedRequestRow.status === 'rejected'
    && rejectedRequestRow.resolution_note === 'Please choose a later session.');

const approvalCapacityRace = await Promise.all([learningIds.capacityRequestOne, learningIds.capacityRequestTwo].map(p_id =>
  learningManagerA.client.rpc('hris_resolve_learning_request', {
    p_tenant_id: ids.tenantA, p_id, p_decision: 'enrolled', p_resolution_note: null,
  })));
const approvalCapacityRows = queryAdmin(`SELECT jsonb_agg(to_jsonb(e)) FROM public.learning_enrollments e
  WHERE e.tenant_id='${ids.tenantA}'::uuid AND e.session_id='${learningIds.approvalCapacitySession}'::uuid`);
const capacityApproved = approvalCapacityRace.filter(result => !result.error).length;
const capacityDeniedForFull = approvalCapacityRace.filter(result => result.error?.code === '22023').length;
record('Concurrent learning approvals serialize on session capacity; full-session requests remain pending',
  capacityApproved === 1 && capacityDeniedForFull === 1
    && approvalCapacityRows.filter(row => row.status === 'enrolled').length === 1
    && approvalCapacityRows.filter(row => row.status === 'requested').length === 1,
  JSON.stringify({ outcomes: approvalCapacityRace.map(result => result.error?.code || result.data?.status),
    resultingStatuses: approvalCapacityRows.map(row => row.status) }));

const learningAdminCatalogA = await learningManagerA.client.rpc('hris_get_learning_admin_catalog', { p_tenant_id: ids.tenantA });
const learningAdminCatalogCrossTenant = await learningManagerA.client.rpc('hris_get_learning_admin_catalog', { p_tenant_id: ids.tenantB });
const learningRosterA = await learningManagerA.client.rpc('hris_get_learning_session_roster', {
  p_tenant_id: ids.tenantA, p_session_id: learningIds.fullSession,
});
const learningRosterCrossTenant = await learningManagerA.client.rpc('hris_get_learning_session_roster', {
  p_tenant_id: ids.tenantB, p_session_id: learningIds.tenantBSession,
});
const learningRosterForeignSession = await learningManagerA.client.rpc('hris_get_learning_session_roster', {
  p_tenant_id: ids.tenantA, p_session_id: learningIds.tenantBSession,
});
const learningRosterOrdinaryManager = await managerA.client.rpc('hris_get_learning_session_roster', {
  p_tenant_id: ids.tenantA, p_session_id: learningIds.fullSession,
});
const learningRosterEmployee = await employeeA.client.rpc('hris_get_learning_session_roster', {
  p_tenant_id: ids.tenantA, p_session_id: learningIds.fullSession,
});
const learningRosterGlobalOnly = await globalOnly.client.rpc('hris_get_learning_session_roster', {
  p_tenant_id: ids.tenantA, p_session_id: learningIds.fullSession,
});
const learningRosterAnonymous = await createClient(services.API_URL, services.ANON_KEY, authOptions)
  .rpc('hris_get_learning_session_roster', { p_tenant_id: ids.tenantA, p_session_id: learningIds.fullSession });
const learningRosterAcl = queryAdmin(`SELECT jsonb_build_object(
  'anon_execute',has_function_privilege('anon','public.hris_get_learning_session_roster(uuid,uuid)','EXECUTE'),
  'authenticated_execute',has_function_privilege('authenticated','public.hris_get_learning_session_roster(uuid,uuid)','EXECUTE'),
  'helper_anon_execute',has_function_privilege('anon','private.hris_get_learning_session_roster(uuid,uuid)','EXECUTE'),
  'helper_authenticated_execute',has_function_privilege('authenticated','private.hris_get_learning_session_roster(uuid,uuid)','EXECUTE'),
  'private_schema_anon_usage',has_schema_privilege('anon','private','USAGE'),
  'private_schema_authenticated_usage',has_schema_privilege('authenticated','private','USAGE'))`);
record('Scheduled learning rosters return only active tenant enrollments and deny non-managers, anonymous, and cross-tenant access',
  !learningRosterA.error && learningRosterA.data?.session?.id === learningIds.fullSession
    && learningRosterA.data.session.program_title === 'QA A Full Session'
    && learningRosterA.data.learners.length === 1
    && learningRosterA.data.learners[0].employee_name === 'Synthetic Clock Employee'
    && learningRosterA.data.learners[0].employee_number === 'QA-A-006'
    && Boolean(learningRosterCrossTenant.error?.code === '42501')
    && Boolean(learningRosterForeignSession.error?.code === 'P0002')
    && Boolean(learningRosterOrdinaryManager.error?.code === '42501')
    && Boolean(learningRosterEmployee.error?.code === '42501')
    && Boolean(learningRosterGlobalOnly.error?.code === '42501')
    && Boolean(learningRosterAnonymous.error?.code === '42501')
    && learningRosterAcl.anon_execute === false && learningRosterAcl.authenticated_execute === true
    && learningRosterAcl.helper_anon_execute === false && learningRosterAcl.helper_authenticated_execute === true
    && learningRosterAcl.private_schema_anon_usage === false && learningRosterAcl.private_schema_authenticated_usage === true,
  JSON.stringify({ roster: learningRosterA.data, crossTenant: learningRosterCrossTenant.error?.code,
    foreignSession: learningRosterForeignSession.error?.code, ordinaryManager: learningRosterOrdinaryManager.error?.code,
    employee: learningRosterEmployee.error?.code, globalOnly: learningRosterGlobalOnly.error?.code,
    anonymous: learningRosterAnonymous.error?.code, acl: learningRosterAcl }));
const learningAdminCatalogIds = (learningAdminCatalogA.data || []).map(row => `${sqlLiteral(row.id)}::uuid`).join(',');
const learningAdminCatalogTenantBound = queryAdmin(`SELECT jsonb_build_object(
  'tenant_a_count',count(*) FILTER (WHERE tenant_id='${ids.tenantA}'::uuid)::integer,
  'foreign_tenant_count',count(*) FILTER (WHERE tenant_id<>'${ids.tenantA}'::uuid)::integer)
  FROM public.learning_programs WHERE id IN (${learningAdminCatalogIds || "'00000000-0000-0000-0000-000000000000'::uuid"})`);
const ordinaryLearningProgramCreate = await managerA.client.rpc('hris_save_learning_program', {
  p_tenant_id: ids.tenantA, p_program_id: null, p_title: 'Unauthorized local program',
  p_description: '', p_category: '', p_provider: '', p_delivery_mode: 'online',
  p_duration_hours: null, p_self_enrollment: true, p_target_skills: [], p_active: true,
});
const employeeLearningProgramCreate = await employeeA.client.rpc('hris_save_learning_program', {
  p_tenant_id: ids.tenantA, p_program_id: null, p_title: 'Employee local program',
  p_description: '', p_category: '', p_provider: '', p_delivery_mode: 'online',
  p_duration_hours: null, p_self_enrollment: true, p_target_skills: [], p_active: true,
});
const globalOnlyLearningProgramCreate = await globalOnly.client.rpc('hris_save_learning_program', {
  p_tenant_id: ids.tenantA, p_program_id: null, p_title: 'Global-only local program',
  p_description: '', p_category: '', p_provider: '', p_delivery_mode: 'online',
  p_duration_hours: null, p_self_enrollment: true, p_target_skills: [], p_active: true,
});
const restrictedProgramFields = {
  p_tenant_id: ids.tenantA, p_program_id: learningIds.directProgram, p_title: 'QA A Direct Learning',
  p_description: 'Synthetic self-enrollment course', p_category: 'Professional Development',
  p_provider: 'QA Provider', p_delivery_mode: 'online', p_duration_hours: 4,
  p_self_enrollment: true, p_target_skills: ['Communication', 'Planning'], p_active: true,
  p_completion_evidence_required: false,
};
const ordinaryEvidenceRequirementChange = await managerA.client.rpc('hris_save_learning_program', restrictedProgramFields);
const employeeEvidenceRequirementChange = await employeeA.client.rpc('hris_save_learning_program', restrictedProgramFields);
const globalOnlyEvidenceRequirementChange = await globalOnly.client.rpc('hris_save_learning_program', restrictedProgramFields);
const crossTenantEvidenceRequirementChange = await learningManagerA.client.rpc('hris_save_learning_program', {
  ...restrictedProgramFields, p_program_id: learningIds.tenantBProgram,
});
const crossTenantLearningProgramUpdate = await learningManagerA.client.rpc('hris_save_learning_program', {
  p_tenant_id: ids.tenantA, p_program_id: '90000000-0000-4000-8000-000000000004',
  p_title: 'Cross-tenant program rewrite', p_description: '', p_category: '', p_provider: '',
  p_delivery_mode: 'online', p_duration_hours: null, p_self_enrollment: true, p_target_skills: [], p_active: true,
});
const crossTenantLearningSessionCreate = await learningManagerA.client.rpc('hris_save_learning_session', {
  p_tenant_id: ids.tenantA, p_program_id: '90000000-0000-4000-8000-000000000004', p_session_id: null,
  p_trainer_name: '', p_start_at: null, p_end_at: null, p_location: '', p_meeting_url: '',
  p_capacity: null, p_enrollment_deadline: null,
});
const invalidLearningSessionCreate = await learningManagerA.client.rpc('hris_save_learning_session', {
  p_tenant_id: ids.tenantA, p_program_id: '90000000-0000-4000-8000-000000000001', p_session_id: null,
  p_trainer_name: '', p_start_at: '2030-01-02T10:00:00Z', p_end_at: '2030-01-02T09:00:00Z',
  p_location: '', p_meeting_url: '', p_capacity: 10, p_enrollment_deadline: null,
});
const directLearningProgramWrite = await learningManagerA.client.from('learning_programs').insert({
  tenant_id: ids.tenantA, title: 'Direct-write attempt', delivery_mode: 'online',
});
const directLearningSessionWrite = await learningManagerA.client.from('learning_sessions').insert({
  tenant_id: ids.tenantA, program_id: '90000000-0000-4000-8000-000000000001',
});
record('Learning program administration is tenant-scoped and enforces direct-write, manager, and cross-tenant denials',
  !learningAdminCatalogA.error && learningAdminCatalogA.data.length >= 5
    && learningAdminCatalogTenantBound.tenant_a_count === learningAdminCatalogA.data.length
    && learningAdminCatalogTenantBound.foreign_tenant_count === 0
    && learningAdminCatalogA.data.some(row => row.id === learningIds.directProgram && row.completion_evidence_required === true)
    && Boolean(learningAdminCatalogCrossTenant.error?.code === '42501')
    && Boolean(ordinaryLearningProgramCreate.error?.code === '42501')
    && Boolean(employeeLearningProgramCreate.error?.code === '42501')
    && Boolean(globalOnlyLearningProgramCreate.error?.code === '42501')
    && Boolean(ordinaryEvidenceRequirementChange.error?.code === '42501')
    && Boolean(employeeEvidenceRequirementChange.error?.code === '42501')
    && Boolean(globalOnlyEvidenceRequirementChange.error?.code === '42501')
    && Boolean(crossTenantEvidenceRequirementChange.error?.code === 'P0002')
    && Boolean(crossTenantLearningProgramUpdate.error?.code === 'P0002')
    && Boolean(crossTenantLearningSessionCreate.error?.code === '22023')
    && Boolean(invalidLearningSessionCreate.error?.code === '22023')
    && Boolean(directLearningProgramWrite.error?.code === '42501')
    && Boolean(directLearningSessionWrite.error?.code === '42501'),
  JSON.stringify({ catalogCount: learningAdminCatalogA.data?.length, catalogTenantBound: learningAdminCatalogTenantBound,
    crossCatalogCode: learningAdminCatalogCrossTenant.error?.code,
    ordinaryManagerCode: ordinaryLearningProgramCreate.error?.code,
    ordinaryEvidenceSetting: ordinaryEvidenceRequirementChange.error?.code,
    employeeEvidenceSetting: employeeEvidenceRequirementChange.error?.code,
    crossTenantEvidenceSetting: crossTenantEvidenceRequirementChange.error?.code,
    employeeCode: employeeLearningProgramCreate.error?.code,
    globalOnlyCode: globalOnlyLearningProgramCreate.error?.code,
    crossProgramCode: crossTenantLearningProgramUpdate.error?.code,
    crossSessionCode: crossTenantLearningSessionCreate.error?.code,
    invalidTimeCode: invalidLearningSessionCreate.error?.code,
    directProgramCode: directLearningProgramWrite.error?.code,
    directSessionCode: directLearningSessionWrite.error?.code }));

let learningBrowserOutput = '';
let learningBrowserError = '';
const browserLearningProgramTitle = `Local Manager Published Program ${Date.now()}`;
psqlSync(`INSERT INTO public.learning_enrollments(
  id,tenant_id,employee_id,program_id,source,status,mandatory,created_by
) VALUES (
  '${learningIds.completionBrowserEnrollment}','${ids.tenantA}',
  '55555555-5555-4555-8555-555555555555','${learningIds.directProgram}',
  'admin_assignment','enrolled',true,NULL
);`);
try {
  learningBrowserOutput = execFileSync('node', [path.join(here, 'run-learning-browser.mjs')], {
    cwd: mainRoot,
    env: {
      ...process.env,
      HRIS_LOCAL_SUPABASE_URL: services.API_URL,
      HRIS_LOCAL_SUPABASE_ANON_KEY: services.ANON_KEY,
      HRIS_LOCAL_TEST_PASSWORD: password,
      HRIS_LOCAL_LEARNING_EMAIL: emails[5],
      HRIS_LOCAL_LEARNING_MANAGER_EMAIL: emails[13],
      HRIS_LOCAL_LEARNING_TENANT_ID: ids.tenantA,
      HRIS_LOCAL_LEARNING_COMPLETION_ENROLLMENT_ID: learningIds.completionBrowserEnrollment,
      HRIS_LOCAL_LEARNING_COMPLETION_PROGRAM_ID: learningIds.directProgram,
      HRIS_LOCAL_MANAGER_PROGRAM_TITLE: browserLearningProgramTitle,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
} catch (error) {
  learningBrowserError = String(error.stderr || error.message || 'local learning browser run failed').slice(-1800);
}
record('Real local Auth-to-Postgres learning and timesheet workflows persist with tenant scope, EN/BN state, and responsive recovery',
  learningBrowserOutput.includes('Local Auth-to-Postgres employee skill create/edit/delete with retry and refresh recovery, learning completion submit/return/resubmit/verify with private evidence and notifications, employee request, tenant-scoped manager approval, program/session administration, responsive roster retry, authorized session join link, enrollment, and cancellation passed; employee timesheet draft creation, full reload persistence, tenant-scoped save/submit RPCs, Bengali validation, and 375px/1280px layouts also passed.'),
  learningBrowserError);
const browserTimesheetRows = queryAdmin(`SELECT COALESCE(jsonb_agg(DISTINCT t.id::text),'[]'::jsonb) FROM public.timesheets t
  JOIN public.timesheet_entries e ON e.timesheet_id=t.id
  WHERE t.tenant_id='${ids.tenantA}'::uuid AND t.employee_id='55555555-5555-4555-8555-555555555555'::uuid
    AND e.note='Synthetic browser-to-database timesheet acceptance marker'`);
if (browserTimesheetRows.length) {
  const browserTimesheetIdsSql = browserTimesheetRows.map(sqlLiteral).join(',');
  psqlSync(`DELETE FROM public.admin_audit_logs WHERE target_type='timesheet' AND target_id IN (${browserTimesheetIdsSql});
    DELETE FROM public.timesheets WHERE id IN (${browserTimesheetIdsSql});`);
}
record('Real-browser timesheet acceptance removes only its marked synthetic row before isolated SQL assertions',
  queryAdmin(`SELECT jsonb_build_object('count',count(*)::integer) FROM public.timesheets t
    JOIN public.timesheet_entries e ON e.timesheet_id=t.id
    WHERE t.tenant_id='${ids.tenantA}'::uuid AND t.employee_id='55555555-5555-4555-8555-555555555555'::uuid
      AND e.note='Synthetic browser-to-database timesheet acceptance marker'`).count === 0);
let payslipBrowserOutput = '';
let payslipBrowserError = '';
try {
  payslipBrowserOutput = execFileSync('node', [path.join(here, 'run-payslips-browser.mjs')], {
    cwd: mainRoot,
    env: {
      ...process.env,
      HRIS_LOCAL_SUPABASE_URL: services.API_URL,
      HRIS_LOCAL_SUPABASE_ANON_KEY: services.ANON_KEY,
      HRIS_LOCAL_TEST_PASSWORD: password,
      HRIS_LOCAL_PAYSLIP_EMAIL: emails[5],
      HRIS_LOCAL_PAYSLIP_TENANT_ID: ids.tenantA,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
} catch (error) {
  payslipBrowserError = String(error.stderr || error.message || 'local payslip browser run failed').slice(-1800);
}
record('Real local Auth-to-Postgres payslip journey passes outage retry, released data, private-field omission, refresh, and mobile/desktop layouts',
  payslipBrowserOutput.includes('Local Auth-to-Postgres employee payslip journey passed: outage retry, released period and persisted amounts, private-field omission, refresh recovery, and 375px mobile/1280px desktop layouts.'),
  payslipBrowserError);
const payslipAfterBrowser = queryAdmin(`SELECT jsonb_build_object(
  'count',count(*)::integer,'gross',max(gross_earnings),'deductions',max(total_deductions),'net',max(net_salary),
  'status',max(status),'period',max(pay_period_id::text))
  FROM public.payslips WHERE id='99999999-0000-4000-8000-000000000101'::uuid
    AND tenant_id='${ids.tenantA}'::uuid AND employee_id='55555555-5555-4555-8555-555555555555'::uuid`);
record('Employee payslip refresh reads persisted isolated database data without changing payroll records',
  payslipAfterBrowser.count === 1 && Number(payslipAfterBrowser.gross) === 167000
    && Number(payslipAfterBrowser.deductions) === 15000 && Number(payslipAfterBrowser.net) === 152000
    && payslipAfterBrowser.status === 'released'
    && payslipAfterBrowser.period === '99999999-0000-4000-8000-000000000001',
  JSON.stringify(payslipAfterBrowser));
let payrollRegisterBrowserOutput = '';
let payrollRegisterBrowserError = '';
try {
  payrollRegisterBrowserOutput = execFileSync('node', [path.join(here, 'run-payroll-register-browser.mjs')], {
    cwd: mainRoot,
    env: {
      ...process.env,
      HRIS_LOCAL_SUPABASE_URL: services.API_URL,
      HRIS_LOCAL_SUPABASE_ANON_KEY: services.ANON_KEY,
      HRIS_LOCAL_TEST_PASSWORD: password,
      HRIS_LOCAL_PAYROLL_VIEWER_EMAIL: emails[15],
      HRIS_LOCAL_PAYROLL_TENANT_ID: ids.tenantA,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
} catch (error) {
  payrollRegisterBrowserError = String(error.stderr || error.message || 'local payroll register browser run failed').slice(-1800);
}
record('Real local Auth-to-Postgres payroll-view journey passes permission gating, outage retry, filters, private-field omission, refresh, and responsive layouts',
  payrollRegisterBrowserOutput.includes('Local Auth-to-Postgres payroll-view journey passed: permission-gated register, outage retry, persisted employee rows, search/status/period filters, clear/refresh recovery, private-field omission, and 375px mobile/1280px desktop layouts.'),
  payrollRegisterBrowserError);
const browserLearningProgramPersistence = queryAdmin(`SELECT jsonb_build_object(
  'program_count',count(DISTINCT p.id)::integer,
  'active',COALESCE(bool_or(p.active),false),
  'self_enrollment',COALESCE(bool_or(p.self_enrollment),false),
  'session_count',count(DISTINCT s.id)::integer,
  'scheduled',COALESCE(bool_or(s.status='scheduled'),false),
  'enrollment_count',count(DISTINCT e.id) FILTER (WHERE e.employee_id='55555555-5555-4555-8555-555555555555'::uuid AND e.status='enrolled')::integer)
  FROM public.learning_programs p
  LEFT JOIN public.learning_sessions s ON s.tenant_id=p.tenant_id AND s.program_id=p.id
  LEFT JOIN public.learning_enrollments e ON e.tenant_id=p.tenant_id AND e.program_id=p.id
  WHERE p.tenant_id='${ids.tenantA}'::uuid AND p.title=${sqlLiteral(browserLearningProgramTitle)}`);
record('Manager-published learning program and session persist and become employee enrollment history',
  learningBrowserOutput.includes('Local Auth-to-Postgres employee skill create/edit/delete with retry and refresh recovery, learning completion submit/return/resubmit/verify with private evidence and notifications, employee request, tenant-scoped manager approval, program/session administration, responsive roster retry, authorized session join link, enrollment, and cancellation passed;')
    && browserLearningProgramPersistence.program_count === 1 && browserLearningProgramPersistence.active
    && browserLearningProgramPersistence.self_enrollment && browserLearningProgramPersistence.session_count === 1
    && browserLearningProgramPersistence.scheduled && browserLearningProgramPersistence.enrollment_count === 1,
  JSON.stringify(browserLearningProgramPersistence));
const browserLearningProgramId = queryAdmin(`SELECT jsonb_build_object('id',id::text)
  FROM public.learning_programs WHERE tenant_id='${ids.tenantA}'::uuid
    AND title=${sqlLiteral(browserLearningProgramTitle)}`).id;
const browserLearningSession = queryAdmin(`SELECT jsonb_build_object(
  'id',id::text,'program_id',program_id::text,'capacity',capacity)
  FROM public.learning_sessions WHERE tenant_id='${ids.tenantA}'::uuid
    AND program_id='${browserLearningProgramId}'::uuid`);
const secondPublishedEnrollment = await managerA2.client.rpc('hris_employee_enroll_learning', {
  p_tenant_id: ids.tenantA,p_program_id: browserLearningProgramId,p_session_id: browserLearningSession.id,
});
const overbookedSessionEdit = await learningManagerA.client.rpc('hris_save_learning_session', {
  p_tenant_id: ids.tenantA,p_program_id: browserLearningProgramId,p_session_id: browserLearningSession.id,
  p_trainer_name: '',p_start_at: null,p_end_at: null,p_location: '',p_meeting_url: '',
  p_capacity: 1,p_enrollment_deadline: null,
});
const publishedSessionAfterRejectedCapacity = queryAdmin(`SELECT jsonb_build_object(
  'capacity',s.capacity,'enrolled',(SELECT count(*)::integer FROM public.learning_enrollments e
    WHERE e.tenant_id=s.tenant_id AND e.session_id=s.id AND e.status='enrolled'))
  FROM public.learning_sessions s WHERE s.tenant_id='${ids.tenantA}'::uuid
    AND s.id='${browserLearningSession.id}'::uuid`);
record('Published session capacity cannot be reduced below enrolled employees',
  !secondPublishedEnrollment.error && browserLearningSession.capacity === 2
    && Boolean(overbookedSessionEdit.error?.code === '22023')
    && publishedSessionAfterRejectedCapacity.capacity === 2
    && publishedSessionAfterRejectedCapacity.enrolled === 2,
  JSON.stringify({ secondEnrollment: secondPublishedEnrollment.error?.code || secondPublishedEnrollment.data?.status,
    editCode: overbookedSessionEdit.error?.code, session: publishedSessionAfterRejectedCapacity }));

const employeeDirectoryA = await employeesViewer.client.rpc('hris_get_tenant_employee_directory', {
  p_tenant_id: ids.tenantA,
});
const employeeDirectoryFiltered = await employeesViewer.client.rpc('hris_get_tenant_employee_directory', {
  p_tenant_id: ids.tenantA, p_search: 'Synthetic Employee A',
  p_department_id: 'eeeeeeee-0000-4000-8000-000000000001', p_status: 'active',
});
const employeeDirectoryPage = await employeesViewer.client.rpc('hris_get_tenant_employee_directory', {
  p_tenant_id: ids.tenantA, p_limit: 2, p_offset: 2,
});
const employeeDirectoryPrivateSearch = await employeesViewer.client.rpc('hris_get_tenant_employee_directory', {
  p_tenant_id: ids.tenantA, p_search: 'employee-a@hris.test',
});
const employeeDirectoryB = await managerB.client.rpc('hris_get_tenant_employee_directory', {
  p_tenant_id: ids.tenantB,
});
const employeeDirectoryCrossTenant = await employeesViewer.client.rpc('hris_get_tenant_employee_directory', {
  p_tenant_id: ids.tenantB,
});
const employeeDirectoryNoPermission = await noPermission.client.rpc('hris_get_tenant_employee_directory', {
  p_tenant_id: ids.tenantA,
});
const employeeDirectoryGlobalOnly = await globalOnly.client.rpc('hris_get_tenant_employee_directory', {
  p_tenant_id: ids.tenantA,
});
const employeeDirectoryRecruiterOnly = await recruiterOnly.client.rpc('hris_get_tenant_employee_directory', {
  p_tenant_id: ids.tenantA,
});
const employeeDirectoryAnon = await createClient(services.API_URL, services.ANON_KEY, authOptions)
  .rpc('hris_get_tenant_employee_directory', { p_tenant_id: ids.tenantA });
const employeeDirectoryDirectRead = await recruiterOnly.client.from('employees')
  .select('id').eq('tenant_id', ids.tenantA);
const employeeDirectoryPayload = JSON.stringify(employeeDirectoryA.data);
record('Employee directory returns tenant A employee records through employees.view with privacy-limited fields',
  !employeeDirectoryA.error && employeeDirectoryA.data?.employees?.length === 6
    && employeeDirectoryA.data.total_count === 6
    && employeeDirectoryA.data.employees.some(row => row.full_name === 'Synthetic Employee A')
    && employeeDirectoryA.data.departments.some(row => row.id === 'eeeeeeee-0000-4000-8000-000000000001')
    && ['official_email', 'gender', 'joining_date', 'user_id'].every(field => !employeeDirectoryPayload.includes(field))
    && !employeeDirectoryPayload.includes('employee-a@hris.test'));
record('Employee directory search, department/status filters, and non-PII search behave as requested',
  !employeeDirectoryFiltered.error && employeeDirectoryFiltered.data.employees.length === 1
    && employeeDirectoryFiltered.data.employees[0].full_name === 'Synthetic Employee A'
    && !employeeDirectoryPrivateSearch.error && employeeDirectoryPrivateSearch.data.employees.length === 0);
record('Employee directory clamps page size, preserves the full result count, and returns the requested page',
  !employeeDirectoryPage.error && employeeDirectoryPage.data.employees.length === 2
    && employeeDirectoryPage.data.total_count === 6
    && employeeDirectoryPage.data.limit === 2 && employeeDirectoryPage.data.offset === 2);
record('Employee directory is tenant-isolated and returns tenant B only to its own authorized manager',
  !employeeDirectoryB.error && employeeDirectoryB.data.employees.length === 1
    && employeeDirectoryB.data.employees[0].full_name === 'Synthetic Employee B'
    && !JSON.stringify(employeeDirectoryB.data).includes('Synthetic Employee A')
    && Boolean(employeeDirectoryCrossTenant.error?.code === '42501'));
record('Employee directory rejects no-permission, global-only, recruiter-only, and anonymous access',
  Boolean(employeeDirectoryNoPermission.error?.code === '42501')
    && Boolean(employeeDirectoryGlobalOnly.error?.code === '42501')
    && Boolean(employeeDirectoryRecruiterOnly.error?.code === '42501')
    && Boolean(employeeDirectoryAnon.error)
    && !employeeDirectoryDirectRead.error && employeeDirectoryDirectRead.data.length === 0);

const contactDetailsForManager = await managerA.client.rpc('hris_get_tenant_employee_contact_details', {
  p_tenant_id: ids.tenantA, p_employee_id: '55555555-5555-4555-8555-555555555555',
});
const contactDetailsForViewer = await employeesViewer.client.rpc('hris_get_tenant_employee_contact_details', {
  p_tenant_id: ids.tenantA, p_employee_id: '55555555-5555-4555-8555-555555555555',
});
const contactDetailsForManagerB = await managerB.client.rpc('hris_get_tenant_employee_contact_details', {
  p_tenant_id: ids.tenantB, p_employee_id: '66666666-6666-4666-8666-666666666666',
});
const contactDetailsForNoPermission = await noPermission.client.rpc('hris_get_tenant_employee_contact_details', {
  p_tenant_id: ids.tenantA, p_employee_id: '55555555-5555-4555-8555-555555555555',
});
const contactDetailsCrossTenant = await managerA.client.rpc('hris_get_tenant_employee_contact_details', {
  p_tenant_id: ids.tenantB, p_employee_id: '66666666-6666-4666-8666-666666666666',
});
const contactDetailsGlobalOnly = await globalOnly.client.rpc('hris_get_tenant_employee_contact_details', {
  p_tenant_id: ids.tenantA, p_employee_id: '55555555-5555-4555-8555-555555555555',
});
const contactReadAnon = await createClient(services.API_URL, services.ANON_KEY, authOptions)
  .rpc('hris_get_tenant_employee_contact_details', {
    p_tenant_id: ids.tenantA, p_employee_id: '55555555-5555-4555-8555-555555555555',
  });
record('Employee contact details read only through the active tenant employees.manage RPC',
  !contactDetailsForManager.error
    && contactDetailsForManager.data?.official_email === 'employee-a@hris.test'
    && contactDetailsForManager.data?.phone === '+880 1700 000001'
    && !contactDetailsForManagerB.error && contactDetailsForManagerB.data?.official_email === 'employee-b@hris.test'
    && Boolean(contactDetailsForViewer.error?.code === '42501')
    && Boolean(contactDetailsForNoPermission.error?.code === '42501')
    && Boolean(contactDetailsCrossTenant.error?.code === '42501')
    && Boolean(contactDetailsGlobalOnly.error?.code === '42501')
    && Boolean(contactReadAnon.error),
  JSON.stringify({ managerCode: contactDetailsForManager.error?.code, managerBCode: contactDetailsForManagerB.error?.code,
    viewerCode: contactDetailsForViewer.error?.code, noPermissionCode: contactDetailsForNoPermission.error?.code,
    crossTenantCode: contactDetailsCrossTenant.error?.code, globalCode: contactDetailsGlobalOnly.error?.code,
    anonymousDenied: Boolean(contactReadAnon.error) }));

const contactBaseline = contactDetailsForManager.data;
const contactUpdatePayload = {
  official_email: 'employee-a-updated@hris.test', personal_email: 'employee-a-new@hris.test',
  phone: '+880 1700 000002', official_phone: '+880 2 5550002', address: 'QA A updated home address',
  mailing_address: 'QA A updated mailing address', emergency_contact_name: 'QA A updated contact',
  emergency_contact_phone: '+880 1700 000102', emergency_contact_relation: 'Sibling',
};
const restrictedEmployeeBeforeContactEdit = queryAdmin("SELECT jsonb_build_object('id',e.id,'tenant_id',e.tenant_id,'user_id',e.user_id,'employee_number',e.employee_number,'full_name',e.full_name,'department_id',e.department_id,'team_id',e.team_id,'designation_id',e.designation_id,'joining_date',e.joining_date,'employment_status',e.employment_status,'auth_email',u.email) FROM public.employees e LEFT JOIN auth.users u ON u.id=e.user_id WHERE e.id='55555555-5555-4555-8555-555555555555'::uuid");
const nonContactFieldAttempt = await managerA.client.rpc('hris_update_tenant_employee_contact_details', {
  p_tenant_id: ids.tenantA, p_employee_id: '55555555-5555-4555-8555-555555555555',
  p_contact_details: { ...contactUpdatePayload, employment_status: 'terminated' },
});
const invalidContactAttempt = await managerA.client.rpc('hris_update_tenant_employee_contact_details', {
  p_tenant_id: ids.tenantA, p_employee_id: '55555555-5555-4555-8555-555555555555',
  p_contact_details: { ...contactUpdatePayload, official_email: 'not-an-email' },
});
const longContactAttempt = await managerA.client.rpc('hris_update_tenant_employee_contact_details', {
  p_tenant_id: ids.tenantA, p_employee_id: '55555555-5555-4555-8555-555555555555',
  p_contact_details: { ...contactUpdatePayload, address: 'x'.repeat(501) },
});
const duplicateContactAttempt = await managerA.client.rpc('hris_update_tenant_employee_contact_details', {
  p_tenant_id: ids.tenantA, p_employee_id: '55555555-5555-4555-8555-555555555555',
  p_contact_details: { ...contactUpdatePayload, official_email: 'employee-a-absent@hris.test' },
});
const contactUpdateDeniedForViewer = await employeesViewer.client.rpc('hris_update_tenant_employee_contact_details', {
  p_tenant_id: ids.tenantA, p_employee_id: '55555555-5555-4555-8555-555555555555',
  p_contact_details: contactUpdatePayload,
});
const contactUpdateDeniedForNoPermission = await noPermission.client.rpc('hris_update_tenant_employee_contact_details', {
  p_tenant_id: ids.tenantA, p_employee_id: '55555555-5555-4555-8555-555555555555',
  p_contact_details: contactUpdatePayload,
});
const contactUpdateCrossTenant = await managerA.client.rpc('hris_update_tenant_employee_contact_details', {
  p_tenant_id: ids.tenantB, p_employee_id: '66666666-6666-4666-8666-666666666666',
  p_contact_details: contactUpdatePayload,
});
const employeeDirectUpdate = await managerA.client.from('employees')
  .update({ employment_status: 'terminated' }).eq('id', '55555555-5555-4555-8555-555555555555').select('id');
const employeeUpdatePrivileges = queryAdmin("SELECT jsonb_build_object('table_update',has_table_privilege('authenticated','public.employees','UPDATE'),'employment_status_update',has_column_privilege('authenticated','public.employees','employment_status','UPDATE'))");
const contactUpdateAnon = await createClient(services.API_URL, services.ANON_KEY, authOptions)
  .rpc('hris_update_tenant_employee_contact_details', {
    p_tenant_id: ids.tenantA, p_employee_id: '55555555-5555-4555-8555-555555555555',
    p_contact_details: contactUpdatePayload,
  });
const contactUpdate = await managerA.client.rpc('hris_update_tenant_employee_contact_details', {
  p_tenant_id: ids.tenantA, p_employee_id: '55555555-5555-4555-8555-555555555555',
  p_contact_details: contactUpdatePayload,
});
const restrictedEmployeeAfterContactEdit = queryAdmin("SELECT jsonb_build_object('id',e.id,'tenant_id',e.tenant_id,'user_id',e.user_id,'employee_number',e.employee_number,'full_name',e.full_name,'department_id',e.department_id,'team_id',e.team_id,'designation_id',e.designation_id,'joining_date',e.joining_date,'employment_status',e.employment_status,'auth_email',u.email) FROM public.employees e LEFT JOIN auth.users u ON u.id=e.user_id WHERE e.id='55555555-5555-4555-8555-555555555555'::uuid");
const contactAudit = queryAdmin("SELECT jsonb_build_object('count',count(*)::integer,'details',max(details::text)) FROM public.admin_audit_logs WHERE target_type='employees' AND target_id='55555555-5555-4555-8555-555555555555' AND action='employee.contact_details_updated'");
record('Employee contact save validates input, rejects non-contact keys and duplicate emails, audits field names, and preserves identifiers/org/lifecycle/Auth identity',
  contactBaseline?.official_email === 'employee-a@hris.test'
    && Boolean(nonContactFieldAttempt.error?.code === '22023')
    && Boolean(invalidContactAttempt.error?.code === '22023')
    && Boolean(longContactAttempt.error?.code === '22023')
    && Boolean(duplicateContactAttempt.error?.code === '23505')
    && Boolean(contactUpdateDeniedForViewer.error?.code === '42501')
    && Boolean(contactUpdateDeniedForNoPermission.error?.code === '42501')
    && Boolean(contactUpdateCrossTenant.error?.code === '42501')
    && (Boolean(employeeDirectUpdate.error) || (Array.isArray(employeeDirectUpdate.data) && employeeDirectUpdate.data.length === 0))
    && employeeUpdatePrivileges.table_update === false
    && employeeUpdatePrivileges.employment_status_update === false
    && Boolean(contactUpdateAnon.error)
    && !contactUpdate.error
    && contactUpdate.data?.official_email === contactUpdatePayload.official_email
    && JSON.stringify(restrictedEmployeeAfterContactEdit) === JSON.stringify(restrictedEmployeeBeforeContactEdit)
    && contactAudit.count === 1
    && contactAudit.details.includes('official_email')
    && contactAudit.details.includes('emergency_contact_phone')
    && !contactAudit.details.includes('employee-a-updated@hris.test'),
  JSON.stringify({ badPayloadCode: nonContactFieldAttempt.error?.code, invalidCode: invalidContactAttempt.error?.code,
    longFieldCode: longContactAttempt.error?.code,
    duplicateCode: duplicateContactAttempt.error?.code, viewerUpdateCode: contactUpdateDeniedForViewer.error?.code,
    noPermissionUpdateCode: contactUpdateDeniedForNoPermission.error?.code,
    crossTenantCode: contactUpdateCrossTenant.error?.code,
    directUpdateDenied: Boolean(employeeDirectUpdate.error) || (Array.isArray(employeeDirectUpdate.data) && employeeDirectUpdate.data.length === 0),
    directUpdateRows: Array.isArray(employeeDirectUpdate.data) ? employeeDirectUpdate.data.length : null,
    directTableUpdatePrivilege: employeeUpdatePrivileges.table_update,
    directEmploymentStatusPrivilege: employeeUpdatePrivileges.employment_status_update,
    anonymousUpdateDenied: Boolean(contactUpdateAnon.error),
    updateCode: contactUpdate.error?.code, auditCount: contactAudit.count }));

psqlSync("UPDATE public.employees SET official_email='employee-a@hris.test',personal_email='personal-a@hris.test',phone='+880 1700 000001',official_phone='+880 2 5550001',address='QA A home address',mailing_address='QA A mailing address',emergency_contact_name='QA A emergency contact',emergency_contact_phone='+880 1700 000101',emergency_contact_relation='Parent' WHERE id='55555555-5555-4555-8555-555555555555'::uuid;");

psqlSync("UPDATE public.tenant_memberships SET status='inactive' WHERE user_id=" + sqlLiteral(managerA.userId) + "::uuid AND tenant_id=" + sqlLiteral(ids.tenantA) + "::uuid;");
let contactDetailsInactiveMembership;
try {
  contactDetailsInactiveMembership = await managerA.client.rpc('hris_get_tenant_employee_contact_details', {
    p_tenant_id: ids.tenantA, p_employee_id: '55555555-5555-4555-8555-555555555555',
  });
} finally {
  psqlSync("UPDATE public.tenant_memberships SET status='active' WHERE user_id=" + sqlLiteral(managerA.userId) + "::uuid AND tenant_id=" + sqlLiteral(ids.tenantA) + "::uuid;");
}
record('Employee contact RPC immediately denies inactive tenant membership',
  Boolean(contactDetailsInactiveMembership.error?.code === '42501'));

psqlSync("UPDATE public.tenants SET is_active=false WHERE id=" + sqlLiteral(ids.tenantA) + "::uuid;");
let contactDetailsInactiveTenant;
let contactUpdateInactiveTenant;
try {
  contactDetailsInactiveTenant = await managerA.client.rpc('hris_get_tenant_employee_contact_details', {
    p_tenant_id: ids.tenantA, p_employee_id: '55555555-5555-4555-8555-555555555555',
  });
  contactUpdateInactiveTenant = await managerA.client.rpc('hris_update_tenant_employee_contact_details', {
    p_tenant_id: ids.tenantA, p_employee_id: '55555555-5555-4555-8555-555555555555',
    p_contact_details: contactUpdatePayload,
  });
} finally {
  psqlSync("UPDATE public.tenants SET is_active=true WHERE id=" + sqlLiteral(ids.tenantA) + "::uuid;");
}
record('Employee contact read and save both deny an inactive organization',
  Boolean(contactDetailsInactiveTenant.error?.code === '42501')
    && Boolean(contactUpdateInactiveTenant.error?.code === '42501'));
psqlSync(`UPDATE public.tenant_memberships SET status='inactive'
  WHERE user_id='${employeesViewer.userId}'::uuid AND tenant_id='${ids.tenantA}'::uuid;`);
let employeeDirectoryInactiveMembership;
try {
  employeeDirectoryInactiveMembership = await employeesViewer.client.rpc('hris_get_tenant_employee_directory', {
    p_tenant_id: ids.tenantA,
  });
} finally {
  psqlSync(`UPDATE public.tenant_memberships SET status='active'
    WHERE user_id='${employeesViewer.userId}'::uuid AND tenant_id='${ids.tenantA}'::uuid;`);
}
record('Employee directory immediately denies inactive tenant membership',
  Boolean(employeeDirectoryInactiveMembership.error?.code === '42501'));

let employeeDirectoryBrowserOutput = '';
let employeeDirectoryBrowserError = '';
try {
  employeeDirectoryBrowserOutput = execFileSync('node', [path.join(here, 'run-employee-directory-browser.mjs')], {
    cwd: mainRoot,
    env: {
      ...process.env,
      HRIS_LOCAL_SUPABASE_URL: services.API_URL,
      HRIS_LOCAL_SUPABASE_ANON_KEY: services.ANON_KEY,
      HRIS_LOCAL_TEST_PASSWORD: password,
      HRIS_LOCAL_EMPLOYEE_DIRECTORY_EMAIL: emails[12],
      HRIS_LOCAL_EMPLOYEE_DIRECTORY_MANAGER_EMAIL: emails[0],
      HRIS_LOCAL_EMPLOYEE_DIRECTORY_TENANT_ID: ids.tenantA,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
} catch (error) {
  employeeDirectoryBrowserError = String(error.stderr || error.message || 'local employee-directory browser run failed').slice(-1400);
}
record('Real local Auth-to-Postgres employee directory journey passes on mobile and desktop with retry recovery',
  employeeDirectoryBrowserOutput.includes('Local Auth-to-Postgres employee directory and contact-editing journey passed with manager-only contact access, save/cancel/error recovery, persisted refresh, EN/BN parity, and 375px mobile/1280px desktop layouts.'),
  employeeDirectoryBrowserError);
psqlSync("UPDATE public.employees SET official_email='employee-a@hris.test',personal_email='personal-a@hris.test',phone='+880 1700 000001',official_phone='+880 2 5550001',address='QA A home address',mailing_address='QA A mailing address',emergency_contact_name='QA A emergency contact',emergency_contact_phone='+880 1700 000101',emergency_contact_relation='Parent' WHERE id='55555555-5555-4555-8555-555555555555'::uuid;");

const recruitmentIds = {
  jobA1: 'a1111111-1111-4111-8111-111111111111',
  jobA2: 'a2222222-2222-4222-8222-222222222222',
  jobB: 'b1111111-1111-4111-8111-111111111111',
  applicationA1: 'c1111111-1111-4111-8111-111111111111',
  applicationA2: 'c2222222-2222-4222-8222-222222222222',
  applicationB: 'd1111111-1111-4111-8111-111111111111',
  historyA1: 'e1111111-1111-4111-8111-111111111111',
  historyA1Second: 'e2222222-2222-4222-8222-222222222222',
  historyB: 'f1111111-1111-4111-8111-111111111111',
};
psqlSync(`INSERT INTO public.jobs(id,tenant_id,reference_number,title) VALUES
  ('${recruitmentIds.jobA1}'::uuid,'${ids.tenantA}'::uuid,'QA-ENG-1','Platform Engineer'),
  ('${recruitmentIds.jobA2}'::uuid,'${ids.tenantA}'::uuid,'QA-DES-2','Product Designer'),
  ('${recruitmentIds.jobB}'::uuid,'${ids.tenantB}'::uuid,'QB-OPS-1','Tenant B Analyst');
UPDATE public.jobs SET status='published',is_published=true,is_active=true
  WHERE id IN ('${recruitmentIds.jobA1}'::uuid,'${recruitmentIds.jobA2}'::uuid,'${recruitmentIds.jobB}'::uuid);
INSERT INTO public.job_applications(id,tenant_id,job_id,candidate_user_id,full_name,email,phone,years_experience,skills,cv_url,cover_letter,stage,status_note,applied_at,application_data) VALUES
  ('${recruitmentIds.applicationA1}'::uuid,'${ids.tenantA}'::uuid,'${recruitmentIds.jobA1}'::uuid,'${assessmentCandidateA.userId}'::uuid,'Candidate A One','private-email-a@candidate.test','private-phone-a',5,ARRAY['sql'],'private-cv-url-a','private-cover-letter-a','submitted','private-status-note-a','2026-10-12T09:00:00Z','{"answer":"private-screening-answer-a"}'),
  ('${recruitmentIds.applicationA2}'::uuid,'${ids.tenantA}'::uuid,'${recruitmentIds.jobA2}'::uuid,'${assessmentCandidateA.userId}'::uuid,'Candidate A Two','private-email-a2@candidate.test','private-phone-a2',3,ARRAY['design'],'private-cv-url-a2','private-cover-letter-a2','interview_scheduled','private-status-note-a2','2026-10-12T10:00:00Z','{"answer":"private-screening-answer-a2"}'),
  ('${recruitmentIds.applicationB}'::uuid,'${ids.tenantB}'::uuid,'${recruitmentIds.jobB}'::uuid,'${assessmentCandidateB.userId}'::uuid,'Candidate B Only','private-email-b@candidate.test','private-phone-b',2,ARRAY['ops'],'private-cv-url-b','private-cover-letter-b','submitted','private-status-note-b','2026-10-12T11:00:00Z','{"answer":"private-screening-answer-b"}');
INSERT INTO public.candidate_profiles(user_id,tenant_id,profile_status) VALUES
  ('${assessmentCandidateA.userId}'::uuid,'${ids.tenantA}'::uuid,'active'),
  ('${assessmentCandidateB.userId}'::uuid,'${ids.tenantB}'::uuid,'active');
INSERT INTO public.candidate_application_stage_history(id,application_id,stage,note,actor_type,actor_user_id,created_at) VALUES
  ('${recruitmentIds.historyA1}'::uuid,'${recruitmentIds.applicationA1}'::uuid,'submitted','private-reviewer-note-a','recruitment','55555555-5555-4555-8555-555555555501'::uuid,'2026-10-12T09:01:00Z'),
  ('${recruitmentIds.historyA1Second}'::uuid,'${recruitmentIds.applicationA1}'::uuid,'screening','candidate-visible-milestone-note-a','recruitment','55555555-5555-4555-8555-555555555501'::uuid,'2026-10-12T10:01:00Z'),
  ('${recruitmentIds.historyB}'::uuid,'${recruitmentIds.applicationB}'::uuid,'submitted','private-reviewer-note-b','recruitment','66666666-6666-4666-8666-666666666601'::uuid,'2026-10-12T11:01:00Z');`);

const recruitmentA = await managerA.client.rpc('hris_get_recruitment_pipeline', { p_tenant_id: ids.tenantA });
const recruitmentB = await managerB.client.rpc('hris_get_recruitment_pipeline', { p_tenant_id: ids.tenantB });
const recruitmentFiltered = await managerA.client.rpc('hris_get_recruitment_pipeline', {
  p_tenant_id: ids.tenantA, p_search: 'platform engineer', p_stage: 'submitted', p_limit: 1, p_offset: 0,
});
const recruitmentPageTwo = await managerA.client.rpc('hris_get_recruitment_pipeline', {
  p_tenant_id: ids.tenantA, p_limit: 1, p_offset: 1,
});
const recruitmentEmailSearch = await managerA.client.rpc('hris_get_recruitment_pipeline', {
  p_tenant_id: ids.tenantA, p_search: 'private-email-a@candidate.test',
});
const recruitmentCrossTenant = await managerA.client.rpc('hris_get_recruitment_pipeline', { p_tenant_id: ids.tenantB });
const recruitmentNoPermission = await noPermission.client.rpc('hris_get_recruitment_pipeline', { p_tenant_id: ids.tenantA });
const recruitmentGlobalOnly = await globalOnly.client.rpc('hris_get_recruitment_pipeline', { p_tenant_id: ids.tenantA });
const recruitmentAnon = await createClient(services.API_URL, services.ANON_KEY, authOptions)
  .rpc('hris_get_recruitment_pipeline', { p_tenant_id: ids.tenantA });
const recruitmentDirectTable = await managerA.client.from('job_applications').select('id').eq('tenant_id', ids.tenantA);
psqlSync(`UPDATE public.tenant_memberships SET status='inactive'
  WHERE user_id='${recruiterOnly.userId}'::uuid AND tenant_id='${ids.tenantA}'::uuid;`);
let recruitmentInactiveMembership;
try {
  recruitmentInactiveMembership = await recruiterOnly.client.rpc('hris_get_recruitment_pipeline', { p_tenant_id: ids.tenantA });
} finally {
  psqlSync(`UPDATE public.tenant_memberships SET status='active'
    WHERE user_id='${recruiterOnly.userId}'::uuid AND tenant_id='${ids.tenantA}'::uuid;`);
}
const recruitmentSafePayload = JSON.stringify(recruitmentA.data);
record('Recruitment pipeline returns paginated tenant-matched names, jobs, stages, and sanitized milestones',
  !recruitmentA.error && recruitmentA.data?.applications?.length === 2
    && recruitmentA.data.total_count === 2
    && recruitmentA.data.available_stages.join(',') === 'interview_scheduled,submitted'
    && recruitmentA.data.applications.find(row => row.application_id === recruitmentIds.applicationA1)?.milestones.length === 2
    && !recruitmentSafePayload.includes('private-email-a@candidate.test')
    && !recruitmentSafePayload.includes('private-phone-a')
    && !recruitmentSafePayload.includes('private-cv-url-a')
    && !recruitmentSafePayload.includes('private-cover-letter-a')
    && !recruitmentSafePayload.includes('private-screening-answer-a')
    && !recruitmentSafePayload.includes('private-status-note-a')
    && !recruitmentSafePayload.includes('private-reviewer-note-a')
    && !recruitmentSafePayload.includes('actor_user_id'));
record('Recruitment pipeline filters by candidate/job/stage fields and paginates without searching private email',
  !recruitmentFiltered.error && recruitmentFiltered.data?.applications?.length === 1
    && recruitmentFiltered.data.total_count === 1
    && recruitmentFiltered.data.applications[0].application_id === recruitmentIds.applicationA1
    && !recruitmentPageTwo.error && recruitmentPageTwo.data?.applications?.length === 1
    && recruitmentPageTwo.data.total_count === 2
    && !recruitmentEmailSearch.error && recruitmentEmailSearch.data?.applications?.length === 0);
record('Recruitment pipeline isolates tenant A and tenant B records',
  !recruitmentB.error && recruitmentB.data?.applications?.length === 1
    && recruitmentB.data.applications[0].candidate_name === 'Candidate B Only'
    && !JSON.stringify(recruitmentB.data).includes('Candidate A One')
    && Boolean(recruitmentCrossTenant.error?.code === '42501'));
record('Recruitment pipeline rejects no-permission, global-only and anonymous callers and denies direct application reads',
  Boolean(recruitmentNoPermission.error?.code === '42501')
    && Boolean(recruitmentGlobalOnly.error?.code === '42501')
    && Boolean(recruitmentAnon.error)
    && Boolean(recruitmentDirectTable.error));
record('Recruitment pipeline immediately denies an inactive membership',
  Boolean(recruitmentInactiveMembership.error?.code === '42501'));

const interviewTime = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().slice(0, 19);
const interviewSchedule = await recruitmentManagerA.client.rpc('hris_schedule_candidate_interview', {
  p_tenant_id: ids.tenantA, p_application_id: recruitmentIds.applicationA2,
  p_round_name: 'Design Interview', p_format: 'Video Call', p_scheduled_at: interviewTime,
  p_duration_minutes: 45, p_location_or_link: 'https://meet.example.test/hris-interview',
  p_panel_members: ['Design Lead', 'People Partner'], p_instructions: 'Join from a quiet location.',
});
const interviewId = interviewSchedule.data?.interview_id;
const unauthorizedInterviewSchedule = await recruiterOnly.client.rpc('hris_schedule_candidate_interview', {
  p_tenant_id: ids.tenantA, p_application_id: recruitmentIds.applicationA2,
  p_round_name: 'Unauthorized', p_format: 'Phone Call', p_scheduled_at: interviewTime, p_duration_minutes: 30,
});
const crossTenantInterviewSchedule = await recruitmentManagerA.client.rpc('hris_schedule_candidate_interview', {
  p_tenant_id: ids.tenantB, p_application_id: recruitmentIds.applicationA2,
  p_round_name: 'Cross-tenant', p_format: 'Phone Call', p_scheduled_at: interviewTime, p_duration_minutes: 30,
});
const candidateBInterviewResponse = await assessmentCandidateB.client.rpc('candidate_respond_interview', {
  p_interview_id: interviewId, p_response: 'confirmed',
});
const candidateARescheduleRequest = await assessmentCandidateA.client.rpc('candidate_respond_interview', {
  p_interview_id: interviewId, p_response: 'reschedule_requested',
  p_reason: 'The scheduled time conflicts with a client meeting.',
  p_proposed_times: 'Available after 3:00 PM on the next two working days.',
});
const interviewResponsesBeforeNotes = await recruitmentManagerA.client.rpc('hris_get_candidate_interview_responses', {
  p_tenant_id: ids.tenantA,
});
const interviewResponseBeforeNotes = interviewResponsesBeforeNotes.data?.find(row => row.id === interviewId);
record('Recruiter schedules an interview, its owner requests a reschedule, and other tenant identities are denied',
  !interviewSchedule.error && Boolean(interviewId)
    && Boolean(unauthorizedInterviewSchedule.error?.code === '42501')
    && Boolean(crossTenantInterviewSchedule.error?.code === '42501')
    && Boolean(candidateBInterviewResponse.error?.code === 'P0002')
    && !candidateARescheduleRequest.error && candidateARescheduleRequest.data?.response === 'reschedule_requested'
    && !interviewResponsesBeforeNotes.error && interviewResponseBeforeNotes?.candidate_response === 'reschedule_requested'
    && interviewResponseBeforeNotes?.candidate_response_note === 'The scheduled time conflicts with a client meeting.'
    && interviewResponseBeforeNotes?.candidate_proposed_times === 'Available after 3:00 PM on the next two working days.'
    && interviewResponseBeforeNotes.panel_notes === null);

const viewOnlyInterviewResponses = await recruiterOnly.client.rpc('hris_get_candidate_interview_responses', { p_tenant_id: ids.tenantA });
const crossTenantInterviewResponses = await recruitmentManagerA.client.rpc('hris_get_candidate_interview_responses', { p_tenant_id: ids.tenantB });
const candidateInterviewResponses = await assessmentCandidateA.client.rpc('hris_get_candidate_interview_responses', { p_tenant_id: ids.tenantA });
const candidateInterviewNoteWrite = await assessmentCandidateA.client.rpc('hris_save_candidate_interview_panel_notes', {
  p_tenant_id: ids.tenantA, p_interview_id: interviewId, p_panel_notes: 'Candidate cannot write private notes.',
});
const oversizedPanelNotes = await recruitmentManagerA.client.rpc('hris_save_candidate_interview_panel_notes', {
  p_tenant_id: ids.tenantA, p_interview_id: interviewId, p_panel_notes: 'x'.repeat(4001),
});
const directInterviewNotes = await recruitmentManagerA.client.from('interviews').select('panel_notes').eq('id', interviewId);
record('Private interview notes require active same-tenant recruitment management and server-side validation',
  Boolean(viewOnlyInterviewResponses.error?.code === '42501')
    && Boolean(crossTenantInterviewResponses.error?.code === '42501')
    && Boolean(candidateInterviewResponses.error?.code === '42501')
    && Boolean(candidateInterviewNoteWrite.error?.code === '42501')
    && Boolean(oversizedPanelNotes.error?.code === '22023')
    && Boolean(directInterviewNotes.error));

const assessmentDeadline = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const assessmentTitle = 'QA Assessment Review A';
const assessmentPrivateNote = 'Internal review note from isolated browser acceptance.';
const interviewPanelNote = 'Panel debrief: clear examples and follow-up items from the isolated interview.';
const assessmentAssignment = await recruitmentManagerA.client.rpc('hris_assign_candidate_assessment', {
  p_tenant_id: ids.tenantA,
  p_application_id: recruitmentIds.applicationA1,
  p_title: assessmentTitle,
  p_assessment_type: 'Technical',
  p_instructions: 'Submit a short solution for the isolated assessment journey.',
  p_deadline_date: assessmentDeadline,
});
const assessmentId = assessmentAssignment.data?.assessment_id;
const unauthorizedAssessmentAssignment = await recruiterOnly.client.rpc('hris_assign_candidate_assessment', {
  p_tenant_id: ids.tenantA,
  p_application_id: recruitmentIds.applicationA1,
  p_title: 'Unauthorized assessment',
  p_assessment_type: 'Technical',
  p_instructions: 'This must not be assigned.',
  p_deadline_date: assessmentDeadline,
});
const wrongTenantAssessmentAssignment = await recruitmentManagerA.client.rpc('hris_assign_candidate_assessment', {
  p_tenant_id: ids.tenantB,
  p_application_id: recruitmentIds.applicationA1,
  p_title: 'Cross-tenant assessment',
  p_assessment_type: 'Technical',
  p_instructions: 'This must not be assigned.',
  p_deadline_date: assessmentDeadline,
});
const candidateAForbiddenAssessment = await assessmentCandidateB.client.rpc('candidate_submit_assessment', {
  p_assessment_id: assessmentId,
  p_payload: { submission_text: 'Candidate B must not submit Candidate A work.' },
});
const candidateAssessmentSubmit = await assessmentCandidateA.client.rpc('candidate_submit_assessment', {
  p_assessment_id: assessmentId,
  p_payload: { submission_text: 'Persisted synthetic candidate assessment response.' },
});
const duplicateCandidateAssessmentSubmit = await assessmentCandidateA.client.rpc('candidate_submit_assessment', {
  p_assessment_id: assessmentId,
  p_payload: { submission_text: 'A second response must be denied.' },
});
const unauthorizedAssessmentReview = await recruiterOnly.client.rpc('hris_review_candidate_assessment', {
  p_tenant_id: ids.tenantA, p_assessment_id: assessmentId, p_review_note: 'This review must be denied.',
});
const assessmentReadBeforeReview = await recruitmentManagerA.client.rpc('hris_get_candidate_assessments', { p_tenant_id: ids.tenantA });
const submittedAssessmentBeforeReview = assessmentReadBeforeReview.data?.find(row => row.id === assessmentId);
record('Candidate assessment assignment, owner-only submission, duplicate protection, and reviewer authorization are enforced in local Auth/Postgres',
  !assessmentAssignment.error && assessmentAssignment.data?.status === 'pending'
    && Boolean(unauthorizedAssessmentAssignment.error?.code === '42501')
    && Boolean(wrongTenantAssessmentAssignment.error?.code === '42501')
    && Boolean(candidateAForbiddenAssessment.error?.code === 'P0002')
    && !candidateAssessmentSubmit.error && candidateAssessmentSubmit.data?.status === 'submitted'
    && Boolean(duplicateCandidateAssessmentSubmit.error?.code === 'P0002')
    && Boolean(unauthorizedAssessmentReview.error?.code === '42501')
    && submittedAssessmentBeforeReview?.status === 'submitted'
    && submittedAssessmentBeforeReview.submission_data?.submission_text === 'Persisted synthetic candidate assessment response.');

let recruitmentBrowserOutput = '';
let recruitmentBrowserError = '';
try {
  recruitmentBrowserOutput = execFileSync('node', [path.join(here, 'run-recruitment-browser.mjs')], {
    cwd: mainRoot,
    env: {
      ...process.env,
      HRIS_LOCAL_SUPABASE_URL: services.API_URL,
      HRIS_LOCAL_SUPABASE_ANON_KEY: services.ANON_KEY,
      HRIS_LOCAL_TEST_PASSWORD: password,
      HRIS_LOCAL_RECRUITMENT_EMAIL: emails[16],
      HRIS_LOCAL_ASSESSMENT_TITLE: assessmentTitle,
      HRIS_LOCAL_ASSESSMENT_REVIEW_NOTE: assessmentPrivateNote,
      HRIS_LOCAL_INTERVIEW_ID: interviewId,
      HRIS_LOCAL_INTERVIEW_PANEL_NOTES: interviewPanelNote,
      HRIS_LOCAL_APPLICATION_A2_ID: recruitmentIds.applicationA2,
      HRIS_LOCAL_TENANT_ID: ids.tenantA,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
} catch (error) {
  recruitmentBrowserError = String(error.stderr || error.message || 'local recruitment browser run failed').slice(-1400);
}
record('Real 375px/1280px browser reads the tenant-scoped recruitment pipeline from local Auth/Postgres',
  recruitmentBrowserOutput.includes('Local Auth-to-Postgres recruitment stage workflow passed at 375px and 1280px; mobile+desktop refresh recovery passed.'),
  recruitmentBrowserError);
record('Candidate assessment manager UI assigns work and saves a private note across EN/BN, cancel/retry, refresh, and mobile/desktop',
  recruitmentBrowserOutput.includes('Candidate assessment assignment and internal review note persisted after refresh; EN/BN, cancel, mobile, and desktop passed.'),
  recruitmentBrowserError);
const interviewAfterBrowser = queryAdmin(`SELECT jsonb_build_object('panel_notes',panel_notes,'candidate_response',candidate_response,'status',status)
  FROM public.interviews WHERE id=${sqlLiteral(interviewId)}::uuid`);
const managerInterviewRowsAfterBrowser = await recruitmentManagerA.client.rpc('hris_get_candidate_interview_responses', { p_tenant_id: ids.tenantA });
const replacementInterview = managerInterviewRowsAfterBrowser.data?.find(row => row.application_id === recruitmentIds.applicationA2 && row.id !== interviewId);
const candidateReplacementResponse = replacementInterview?.id
  ? await assessmentCandidateA.client.rpc('candidate_respond_interview', { p_interview_id: replacementInterview.id, p_response: 'confirmed' })
  : { error: { code: 'P0002' } };
const managerInterviewRowsAfterCandidateResponse = await recruitmentManagerA.client.rpc('hris_get_candidate_interview_responses', { p_tenant_id: ids.tenantA });
const confirmedReplacement = managerInterviewRowsAfterCandidateResponse.data?.find(row => row.id === replacementInterview?.id);
const replacementAfterBrowser = replacementInterview?.id
  ? queryAdmin(`SELECT jsonb_build_object('status',status,'candidate_response',candidate_response,'panel_notes',panel_notes)
      FROM public.interviews WHERE id=${sqlLiteral(replacementInterview.id)}::uuid`)
  : null;
const candidateDirectInterviewRead = await assessmentCandidateA.client.from('interviews').select('panel_notes').eq('id', interviewId);
record('Recruitment manager debrief saves through the tenant RPC, survives refresh, and stays hidden from candidate table reads',
  recruitmentBrowserOutput.includes('Interview scheduling, candidate reschedule, private panel debrief, failure retry, EN/BN, refresh, and 375px/1280px passed.')
    && interviewAfterBrowser.panel_notes === interviewPanelNote
    && interviewAfterBrowser.candidate_response === 'reschedule_requested'
    && interviewAfterBrowser.status === 'cancelled'
    && !managerInterviewRowsAfterBrowser.error && !managerInterviewRowsAfterBrowser.data?.some(row => row.id === interviewId)
    && Boolean(candidateDirectInterviewRead.error),
  recruitmentBrowserError || (candidateDirectInterviewRead.error?.message ?? ''));
record('Manager replacement interview persists, cancels the prior request, and lets its owner confirm the new invitation',
  Boolean(replacementInterview?.id)
    && replacementInterview.round_name.startsWith('ফলো-আপ সাক্ষাৎকার')
    && replacementInterview.candidate_response === 'invited'
    && !candidateReplacementResponse.error && candidateReplacementResponse.data?.response === 'confirmed'
    && confirmedReplacement?.candidate_response === 'confirmed'
    && replacementAfterBrowser?.status === 'scheduled'
    && replacementAfterBrowser.candidate_response === 'confirmed'
    && replacementAfterBrowser.panel_notes === null);

const completionInterviewSchedule = await recruitmentManagerA.client.rpc('hris_schedule_candidate_interview', {
  p_tenant_id: ids.tenantA, p_application_id: recruitmentIds.applicationA1,
  p_round_name: 'Technical Interview', p_format: 'Phone Call', p_scheduled_at: interviewTime,
  p_duration_minutes: 30, p_panel_members: ['Engineering Lead'],
});
const completionInterviewId = completionInterviewSchedule.data?.interview_id;
const candidateCompletionConfirmation = completionInterviewId
  ? await assessmentCandidateA.client.rpc('candidate_respond_interview', { p_interview_id: completionInterviewId, p_response: 'confirmed' })
  : { error: { code: 'P0002' } };
const completionViewOnly = await recruiterOnly.client.rpc('hris_complete_candidate_interview', {
  p_tenant_id: ids.tenantA, p_interview_id: completionInterviewId,
});
const completionCrossTenantPermission = await managerA.client.rpc('hris_complete_candidate_interview', {
  p_tenant_id: ids.tenantB, p_interview_id: completionInterviewId,
});
const completionOtherTenantManager = await managerB.client.rpc('hris_complete_candidate_interview', {
  p_tenant_id: ids.tenantA, p_interview_id: completionInterviewId,
});
const completionCandidateDenied = await assessmentCandidateA.client.rpc('hris_complete_candidate_interview', {
  p_tenant_id: ids.tenantA, p_interview_id: completionInterviewId,
});
const completionWrongState = await recruitmentManagerA.client.rpc('hris_complete_candidate_interview', {
  p_tenant_id: ids.tenantA, p_interview_id: interviewId,
});
const completionAnonymous = createClient(services.API_URL, services.ANON_KEY, authOptions);
const completionAnonDenied = await completionAnonymous.rpc('hris_complete_candidate_interview', {
  p_tenant_id: ids.tenantA, p_interview_id: completionInterviewId,
});
const completionDirectWriteDenied = await recruitmentManagerA.client.from('interviews')
  .update({ status: 'completed' }).eq('id', completionInterviewId);
const completionStateBeforeBrowser = queryAdmin(`SELECT jsonb_build_object(
    'interview_status',i.status,'candidate_response',i.candidate_response,'application_stage',a.stage
  ) FROM public.interviews i JOIN public.job_applications a ON a.id=i.application_id
  WHERE i.id=${sqlLiteral(completionInterviewId)}::uuid`);
record('Interview completion setup uses a confirmed synthetic invitation and denies unprivileged, cross-tenant, anonymous, invalid-state, and direct-table writes',
  !completionInterviewSchedule.error && Boolean(completionInterviewId)
    && !candidateCompletionConfirmation.error && candidateCompletionConfirmation.data?.response === 'confirmed'
    && Boolean(completionViewOnly.error?.code === '42501')
    && Boolean(completionCrossTenantPermission.error?.code === '42501')
    && Boolean(completionOtherTenantManager.error?.code === '42501')
    && Boolean(completionCandidateDenied.error?.code === '42501')
    && Boolean(completionWrongState.error?.code === '22023')
    && Boolean(completionAnonDenied.error)
    && Boolean(completionDirectWriteDenied.error)
    && completionStateBeforeBrowser.interview_status === 'scheduled'
    && completionStateBeforeBrowser.candidate_response === 'confirmed'
    && completionStateBeforeBrowser.application_stage === 'interview_scheduled',
  JSON.stringify(completionStateBeforeBrowser));

let completionBrowserOutput = '';
let completionBrowserError = '';
try {
  completionBrowserOutput = execFileSync('node', [path.join(here, 'run-interview-completion-browser.mjs')], {
    cwd: mainRoot,
    env: {
      ...process.env,
      HRIS_LOCAL_SUPABASE_URL: services.API_URL,
      HRIS_LOCAL_SUPABASE_ANON_KEY: services.ANON_KEY,
      HRIS_LOCAL_TEST_PASSWORD: password,
      HRIS_LOCAL_RECRUITMENT_EMAIL: emails[16],
      HRIS_LOCAL_COMPLETION_INTERVIEW_ID: completionInterviewId,
      HRIS_LOCAL_TENANT_ID: ids.tenantA,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
} catch (error) {
  completionBrowserError = String(error.stderr || error.message || 'local interview completion browser run failed').slice(-1400);
}
record('Recruiter completes a confirmed interview with failed-request retry, database refresh, EN/BN and mobile/desktop browser checks',
  completionBrowserOutput.includes('CANDIDATE_INTERVIEW_COMPLETION_BROWSER PASS=12 FAIL=0 locales=EN+BN viewports=375px+1280px retry=persisted refresh=verified'),
  completionBrowserError);

const completionAfterBrowser = queryAdmin(`SELECT jsonb_build_object(
    'interview_status',i.status,'candidate_response',i.candidate_response,
    'application_stage',a.stage,'event_count',(SELECT count(*) FROM public.candidate_application_stage_history h
      WHERE h.application_id=a.id AND h.stage='interview_completed'),
    'event_actor',(SELECT actor_user_id FROM public.candidate_application_stage_history h
      WHERE h.application_id=a.id AND h.stage='interview_completed' ORDER BY h.created_at DESC LIMIT 1)
  ) FROM public.interviews i JOIN public.job_applications a ON a.id=i.application_id
  WHERE i.id=${sqlLiteral(completionInterviewId)}::uuid`);
const completedManagerRows = await recruitmentManagerA.client.rpc('hris_get_candidate_interview_responses', { p_tenant_id: ids.tenantA });
const completedManagerRow = completedManagerRows.data?.find(row => row.id === completionInterviewId);
const candidateContextAfterInterview = await assessmentCandidateA.client.rpc('candidate_get_recruitment_context');
const completedCandidateApplication = candidateContextAfterInterview.data?.applications?.find(row => row.id === recruitmentIds.applicationA1);
const completedCandidateInterviewEvent = completedCandidateApplication?.stage_history?.find(row => row.stage === 'interview_completed');
const anonymousCandidateContext = await completionAnonymous.rpc('candidate_get_recruitment_context');
const candidateContextAcl = queryAdmin(`SELECT jsonb_build_object(
  'anon_execute',has_function_privilege('anon','public.candidate_get_recruitment_context()','EXECUTE'),
  'authenticated_execute',has_function_privilege('authenticated','public.candidate_get_recruitment_context()','EXECUTE'),
  'service_role_execute',has_function_privilege('service_role','public.candidate_get_recruitment_context()','EXECUTE')
)`);
const duplicateInterviewCompletion = await recruitmentManagerA.client.rpc('hris_complete_candidate_interview', {
  p_tenant_id: ids.tenantA, p_interview_id: completionInterviewId,
});
const completionAcceptance = {
  browserPersistedCompleted: completionAfterBrowser.interview_status === 'completed'
    && completionAfterBrowser.candidate_response === 'confirmed'
    && completionAfterBrowser.application_stage === 'interview_completed',
  singleRecruiterHistoryEvent: completionAfterBrowser.event_count === 1
    && completionAfterBrowser.event_actor === recruitmentManagerA.userId,
  managerProjectionShowsCompleted: !completedManagerRows.error && completedManagerRow?.interview_status === 'completed',
  candidateProjectionApplicationStageMatches: completedCandidateApplication?.stage === 'interview_completed',
  candidateProjectionEventStageMatches: completedCandidateInterviewEvent?.stage === 'interview_completed',
  candidateProjectionOmitsOtherTenantApplication: !candidateContextAfterInterview.data?.applications?.some(row => row.id === recruitmentIds.applicationB),
  candidateContextAclLeastPrivilege: candidateContextAcl.anon_execute === false
    && candidateContextAcl.authenticated_execute === true
    && candidateContextAcl.service_role_execute === true,
  anonymousCandidateContextDenied: anonymousCandidateContext.error?.code === '42501',
  candidateProjectionOmitsPrivateHistoryFields: !Object.hasOwn(completedCandidateInterviewEvent || {}, 'actor_user_id')
    && !Object.hasOwn(completedCandidateInterviewEvent || {}, 'note'),
  candidateProjectionOmitsPanelDebrief: !JSON.stringify(candidateContextAfterInterview.data || {}).includes('Panel debrief: clear examples'),
  duplicateRetryIsIdempotent: !duplicateInterviewCompletion.error && duplicateInterviewCompletion.data?.changed === false,
  onePersistedCompletionEvent: queryAdmin(`SELECT count(*) FROM public.candidate_application_stage_history h
      WHERE h.application_id=${sqlLiteral(recruitmentIds.applicationA1)}::uuid AND h.stage='interview_completed'`) === 1,
};
record('Interview completion persists one recruiter-attributed history event, remains idempotent, and exposes only the candidate-safe stage',
  Object.values(completionAcceptance).every(Boolean), JSON.stringify({
    ...completionAcceptance,
    candidateContextError: candidateContextAfterInterview.error?.code || null,
    candidateContextAcl,
    anonymousCandidateContextError: anonymousCandidateContext.error?.code || null,
    candidateApplicationFound: Boolean(completedCandidateApplication),
    candidateApplicationStage: completedCandidateApplication?.stage || null,
    candidateHistoryStages: completedCandidateApplication?.stage_history?.map(row => row.stage) || [],
    candidateInterviewEventKeys: completedCandidateInterviewEvent ? Object.keys(completedCandidateInterviewEvent) : [],
  }));
const assessmentAfterBrowser = queryAdmin(`SELECT jsonb_build_object('status',status,'note',review_note,'reviewer',reviewed_by,'reviewed_at',reviewed_at)
  FROM public.candidate_assessments WHERE id=${sqlLiteral(assessmentId)}::uuid`);
const assessmentManagerReadAfterBrowser = await recruitmentManagerA.client.rpc('hris_get_candidate_assessments', { p_tenant_id: ids.tenantA });
const reviewedAssessment = assessmentManagerReadAfterBrowser.data?.find(row => row.id === assessmentId);
const candidateDirectAssessmentRead = await assessmentCandidateA.client.from('candidate_assessments').select('review_note').eq('id', assessmentId);
const duplicateManagerAssessmentReview = await recruitmentManagerA.client.rpc('hris_review_candidate_assessment', {
  p_tenant_id: ids.tenantA, p_assessment_id: assessmentId, p_review_note: assessmentPrivateNote,
});
record('Recruitment browser saves an internal assessment note; manager refresh sees it and candidate table access stays denied',
  recruitmentBrowserOutput.includes('Candidate assessment assignment and internal review note persisted after refresh; EN/BN, cancel, mobile, and desktop passed.')
    && assessmentAfterBrowser.status === 'reviewed'
    && assessmentAfterBrowser.note === assessmentPrivateNote
    && assessmentAfterBrowser.reviewer === recruitmentManagerA.userId
    && Boolean(assessmentAfterBrowser.reviewed_at)
    && reviewedAssessment?.status === 'reviewed'
    && reviewedAssessment.review_note === assessmentPrivateNote
    && Boolean(candidateDirectAssessmentRead.error)
    && Boolean(duplicateManagerAssessmentReview.error?.code === 'P0002'),
  recruitmentBrowserError || (candidateDirectAssessmentRead.error?.message ?? ''));

let stageRejectionBrowserOutput = '';
let stageRejectionBrowserError = '';
try {
  stageRejectionBrowserOutput = execFileSync('node', [path.join(here, 'run-recruitment-stage-rejection-browser.mjs')], {
    cwd: mainRoot,
    env: {
      ...process.env,
      HRIS_LOCAL_SUPABASE_URL: services.API_URL,
      HRIS_LOCAL_SUPABASE_ANON_KEY: services.ANON_KEY,
      HRIS_LOCAL_TEST_PASSWORD: password,
      HRIS_LOCAL_RECRUITMENT_EMAIL: emails[16],
      HRIS_LOCAL_APPLICATION_A2_ID: recruitmentIds.applicationA2,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
} catch (error) {
  stageRejectionBrowserError = String(error.stderr || error.message || 'local recruiter rejection browser run failed').slice(-1400);
}

const stageNoPermission = await noPermission.client.rpc('hris_update_candidate_application_stage', {
  p_tenant_id: ids.tenantA, p_application_id: recruitmentIds.applicationA1, p_stage: 'rejected',
});
const stageViewOnly = await recruiterOnly.client.rpc('hris_update_candidate_application_stage', {
  p_tenant_id: ids.tenantA, p_application_id: recruitmentIds.applicationA1, p_stage: 'under_review',
});
const stageWrongTenantId = await recruitmentManagerA.client.rpc('hris_update_candidate_application_stage', {
  p_tenant_id: ids.tenantA, p_application_id: recruitmentIds.applicationB, p_stage: 'rejected',
});
const stageWrongTenantPermission = await recruitmentManagerA.client.rpc('hris_update_candidate_application_stage', {
  p_tenant_id: ids.tenantB, p_application_id: recruitmentIds.applicationB, p_stage: 'rejected',
});
const stageInvalid = await recruitmentManagerA.client.rpc('hris_update_candidate_application_stage', {
  p_tenant_id: ids.tenantA, p_application_id: recruitmentIds.applicationA1, p_stage: 'hired',
});
const stageRegression = await recruitmentManagerA.client.rpc('hris_update_candidate_application_stage', {
  p_tenant_id: ids.tenantA, p_application_id: recruitmentIds.applicationA1, p_stage: 'under_review',
});
const stageClosedApplication = await recruitmentManagerA.client.rpc('hris_update_candidate_application_stage', {
  p_tenant_id: ids.tenantA, p_application_id: recruitmentIds.applicationA2, p_stage: 'screening',
});
const stageDirectWrite = await recruitmentManagerA.client.from('job_applications')
  .update({ stage: 'rejected' }).eq('id', recruitmentIds.applicationA1).select('id');
record('Recruiter stage transitions deny unauthorized, cross-tenant, invalid, and regressive updates',
  stageNoPermission.error?.code === '42501'
    && stageViewOnly.error?.code === '42501'
    && stageWrongTenantId.error?.code === 'P0002'
    && stageWrongTenantPermission.error?.code === '42501'
    && stageInvalid.error?.code === '22023'
    && stageRegression.error?.code === '22023'
    && stageClosedApplication.error?.code === '22023'
    && Boolean(stageDirectWrite.error || stageDirectWrite.data?.length === 0));

const repeatedStage = await recruitmentManagerA.client.rpc('hris_update_candidate_application_stage', {
  p_tenant_id: ids.tenantA, p_application_id: recruitmentIds.applicationA1, p_stage: 'screening',
});
const persistedStageA1 = await adminAuth.from('job_applications').select('stage').eq('id', recruitmentIds.applicationA1).single();
const persistedStageA2 = await adminAuth.from('job_applications').select('stage').eq('id', recruitmentIds.applicationA2).single();
const transitionHistoryA1 = await adminAuth.from('candidate_application_stage_history')
  .select('id,stage,note,actor_type,actor_user_id').eq('application_id', recruitmentIds.applicationA1).eq('actor_type', 'recruitment');
const transitionHistoryA2 = await adminAuth.from('candidate_application_stage_history')
  .select('id,stage,note,actor_type,actor_user_id').eq('application_id', recruitmentIds.applicationA2).eq('actor_type', 'recruitment');
const seededRecruitmentHistoryIds = new Set([recruitmentIds.historyA1, recruitmentIds.historyA1Second]);
const acceptedTransitionHistoryA1 = (transitionHistoryA1.data || []).filter(row => !seededRecruitmentHistoryIds.has(row.id));
const sanitizedStageHistory = await recruiterOnly.client.rpc('hris_get_recruitment_pipeline', {
  p_tenant_id: ids.tenantA, p_search: 'Candidate A One',
});
const candidateA1Milestones = sanitizedStageHistory.data?.applications?.find(row => row.application_id === recruitmentIds.applicationA1)?.milestones || [];
const candidateA1MilestonesText = JSON.stringify(candidateA1Milestones);
record('Recruiter stage transitions persist one sanitized history event per accepted change',
  stageRejectionBrowserOutput.includes('Recruiter rejection confirmation, cancellation, persistence, refresh, and mobile/desktop states passed after candidate confirmation.')
    && !persistedStageA1.error && persistedStageA1.data.stage === 'interview_completed'
    && !persistedStageA2.error && persistedStageA2.data.stage === 'rejected'
    && !transitionHistoryA1.error && acceptedTransitionHistoryA1.length === 4
    && acceptedTransitionHistoryA1.map(row => row.stage).sort().join(',') === 'interview_completed,interview_scheduled,screening,under_review'
    && acceptedTransitionHistoryA1.every(row => row.actor_user_id === recruitmentManagerA.userId)
    && !transitionHistoryA2.error && transitionHistoryA2.data.length === 3
    && transitionHistoryA2.data.filter(row => row.stage === 'interview_scheduled').length === 2
    && transitionHistoryA2.data.filter(row => row.stage === 'rejected').length === 1
    && transitionHistoryA2.data.every(row => row.actor_user_id === recruitmentManagerA.userId)
    && repeatedStage.error?.code === '22023'
    && candidateA1Milestones.some(row => row.stage === 'under_review')
    && candidateA1Milestones.some(row => row.stage === 'screening')
    && candidateA1Milestones.some(row => row.stage === 'interview_completed')
    && !candidateA1MilestonesText.includes('actor_user_id')
    && !candidateA1MilestonesText.includes('Application moved to screening.'),
  JSON.stringify({ browserCompleted: stageRejectionBrowserOutput.includes('Recruiter rejection confirmation, cancellation, persistence, refresh, and mobile/desktop states passed after candidate confirmation.'),
    browserError: Boolean(stageRejectionBrowserError),
    finalStages: [persistedStageA1.data?.stage, persistedStageA2.data?.stage],
    a1SeededEvents: transitionHistoryA1.data?.filter(row => seededRecruitmentHistoryIds.has(row.id)).length,
    a1AcceptedTransitions: acceptedTransitionHistoryA1.map(row => ({ stage: row.stage, actorMatchesManager: row.actor_user_id === recruitmentManagerA.userId })),
    a2Events: transitionHistoryA2.data?.map(row => ({ stage: row.stage, actor: row.actor_type, actorMatchesManager: row.actor_user_id === recruitmentManagerA.userId })),
    repeatedStageChanged: repeatedStage.data?.changed,
    candidateMilestones: candidateA1Milestones.map(row => ({ stage: row.stage, hasPrivateActor: Object.hasOwn(row, 'actor_user_id') })) }));

const candidateStageNotificationsA1 = await assessmentCandidateA.client.from('candidate_notifications')
  .select('id,notification_type,related_application_id,related_job_id,action_view,related_stage_history_id,is_read,title,message')
  .eq('related_application_id', recruitmentIds.applicationA1)
  .eq('notification_type', 'application_update')
  .order('created_at', { ascending: true });
const candidateStageHistoryA1 = await adminAuth.from('candidate_application_stage_history')
  .select('id').eq('application_id', recruitmentIds.applicationA1).eq('actor_type', 'recruitment');
const candidateStageNotificationsForOtherCandidate = await assessmentCandidateB.client.from('candidate_notifications')
  .select('id').eq('related_application_id', recruitmentIds.applicationA1);
const candidateStageNotificationsOtherTenant = await assessmentCandidateA.client.from('candidate_notifications')
  .select('id').eq('related_application_id', recruitmentIds.applicationB);
const candidateNotificationEventIds = new Set((candidateStageNotificationsA1.data || [])
  .map(row => row.related_stage_history_id));
const candidateRecruitmentEventIds = new Set((candidateStageHistoryA1.data || []).map(row => row.id));
const candidateStageNotification = candidateStageNotificationsA1.data?.[0];
record('Recruitment stage events create one private owner notification without leaking notes or crossing tenants',
  !candidateStageNotificationsA1.error
    && !candidateStageHistoryA1.error
    && candidateStageNotificationsA1.data.length === candidateRecruitmentEventIds.size
    && candidateNotificationEventIds.size === candidateStageNotificationsA1.data.length
    && [...candidateRecruitmentEventIds].every(id => candidateNotificationEventIds.has(id))
    && candidateStageNotificationsA1.data.every(row =>
      row.notification_type === 'application_update'
        && row.related_application_id === recruitmentIds.applicationA1
        && row.related_job_id === recruitmentIds.jobA1
        && row.action_view === 'applications'
        && row.title === 'Application update'
        && row.message.includes('application timeline')
        && !row.message.includes('private-reviewer-note')
        && !Object.hasOwn(row, 'actor_user_id'))
    && !candidateStageNotificationsForOtherCandidate.error
    && candidateStageNotificationsForOtherCandidate.data.length === 0
    && !candidateStageNotificationsOtherTenant.error
    && candidateStageNotificationsOtherTenant.data.length === 0);

const candidateNotificationInsertAttempt = await assessmentCandidateA.client.from('candidate_notifications').insert({
  candidate_user_id: assessmentCandidateA.userId,
  title: 'Untrusted client notification',
  message: 'Candidates cannot create recruitment notices.',
  notification_type: 'application_update',
  related_application_id: recruitmentIds.applicationA1,
  related_job_id: recruitmentIds.jobA1,
  action_view: 'applications',
});
const candidateOwnNotificationRead = candidateStageNotification?.id
  ? await assessmentCandidateA.client.from('candidate_notifications').update({ is_read: true })
      .eq('id', candidateStageNotification.id).select('id').maybeSingle()
  : { error: { code: 'P0002' }, data: null };
const candidateOtherNotificationRead = candidateStageNotification?.id
  ? await assessmentCandidateB.client.from('candidate_notifications').update({ is_read: true })
      .eq('id', candidateStageNotification.id).select('id').maybeSingle()
  : { error: { code: 'P0002' }, data: null };
record('Candidates cannot create notifications; only the owner can update the existing read state',
  Boolean(candidateNotificationInsertAttempt.error)
    && !candidateOwnNotificationRead.error
    && Boolean(candidateOwnNotificationRead.data?.id)
    && (candidateOtherNotificationRead.error?.code === '42501' || !candidateOtherNotificationRead.data));

record('Recruiter rejection confirmation is cancellable and persists only after confirmation, after candidate interview acceptance',
  stageRejectionBrowserOutput.includes('Recruiter rejection confirmation, cancellation, persistence, refresh, and mobile/desktop states passed after candidate confirmation.')
    && persistedStageA2.data?.stage === 'rejected'
    && candidateReplacementResponse.data?.response === 'confirmed',
  stageRejectionBrowserError);

const referralFileName = 'qa-referral-resume.pdf';
const referralPath = `${employeeA.userId}/${ids.tenantA}/${randomUUID()}/${referralFileName}`;
const referralUpload = await employeeA.client.storage.from('employee-referral-files').upload(
  referralPath, new Blob(['%PDF-1.4\nSynthetic isolated employee referral resume\n'], { type: 'application/pdf' }),
  { contentType: 'application/pdf', upsert: false },
);
if (referralUpload.error) throw referralUpload.error;
uploadedReferralPaths.push(referralPath);
record('Active employee can upload a PDF resume to their private tenant-scoped referral path', !referralUpload.error);

const referralSubmission = await employeeA.client.rpc('hris_submit_employee_referral', {
  p_tenant_id: ids.tenantA,
  p_payload: {
    candidate_name: 'QA Referral Candidate A', candidate_email: 'qa-referral-a@candidate.test',
    candidate_phone: '+8801700000000', relationship_note: 'Former teammate',
    candidate_profile_url: 'https://example.test/profile/qa-referral',
    job_id: recruitmentIds.jobA1, preferred_department_id: 'eeeeeeee-0000-4000-8000-000000000001',
    referral_reason: 'Synthetic isolated workflow acceptance.',
    resume_path: referralPath, resume_file_name: referralFileName,
  },
});
const referralId = referralSubmission.data?.id || '00000000-0000-4000-8000-000000000000';
const referralWorkspaceA = await managerA.client.rpc('hris_get_employee_referral_workspace', { p_tenant_id: ids.tenantA });
const employeeReferralWorkspaceA = await employeeA.client.rpc('hris_get_employee_referral_workspace', { p_tenant_id: ids.tenantA });
const referralCandidate = referralWorkspaceA.data?.referrals?.find(row => row.id === referralId);
record('Employee referral submission persists tenant-owned fields and recruiter queue returns only safe tenant records',
  !referralSubmission.error && Boolean(referralSubmission.data?.id)
    && !referralWorkspaceA.error && referralWorkspaceA.data?.referrals?.some(row => row.id === referralId)
    && !employeeReferralWorkspaceA.error
    && employeeReferralWorkspaceA.data?.referrals?.some(row => row.id === referralId)
    && referralCandidate?.status === 'submitted'
    && referralCandidate?.referrer_employee_id === '55555555-5555-4555-8555-555555555555'
    && referralCandidate?.job_id === recruitmentIds.jobA1
    && referralCandidate?.preferred_department_id === 'eeeeeeee-0000-4000-8000-000000000001'
    && referralCandidate?.resume_storage_path === referralPath,
  referralSubmission.error?.message || 'submission and scoped workspace lookups matched');

const referralTenantB = await managerB.client.rpc('hris_get_employee_referral_workspace', { p_tenant_id: ids.tenantB });
const referralCrossTenant = await managerB.client.rpc('hris_get_employee_referral_workspace', { p_tenant_id: ids.tenantA });
const referralNoPermission = await noPermission.client.rpc('hris_get_employee_referral_workspace', { p_tenant_id: ids.tenantA });
const referralGlobalOnly = await globalOnly.client.rpc('hris_get_employee_referral_workspace', { p_tenant_id: ids.tenantA });
const referralRecruiterOnly = await recruiterOnly.client.rpc('hris_get_employee_referral_workspace', { p_tenant_id: ids.tenantA });
record('Referral queue isolates tenant B and denies cross-tenant, global-only, ungranted, and recruitment-only roles',
  !referralTenantB.error && referralTenantB.data?.referrals?.every(row => row.referrer_employee_id === '66666666-6666-4666-8666-666666666666')
    && !JSON.stringify(referralTenantB.data).includes('QA Referral Candidate A')
    && Boolean(referralCrossTenant.error?.code === '42501')
    && Boolean(referralNoPermission.error?.code === '42501')
    && Boolean(referralGlobalOnly.error?.code === '42501')
    && Boolean(referralRecruiterOnly.error?.code === '42501'));

const employeeReferralDirectWrite = await employeeA.client.from('employee_referrals').insert({
  tenant_id: ids.tenantA, referrer_employee_id: '55555555-5555-4555-8555-555555555555',
  candidate_name: 'Direct Write Denied', candidate_email: 'direct-write@candidate.test',
});
const managerReferralDirectUpdate = await managerA.client.from('employee_referrals').update({ status: 'shortlisted' })
  .eq('id', referralId).select('id,status');
const invalidReferral = await employeeA.client.rpc('hris_submit_employee_referral', {
  p_tenant_id: ids.tenantA,
  p_payload: { candidate_name: 'Invalid referral', candidate_email: 'not-an-email', relationship_note: 'Friend',
    resume_path: `${employeeA.userId}/${ids.tenantA}/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/invalid.pdf`, resume_file_name: 'invalid.pdf' },
});
record('Referral writes are RPC-only and invalid email or missing verified file cannot create a referral',
  Boolean(employeeReferralDirectWrite.error) && Boolean(managerReferralDirectUpdate.error)
    && Boolean(invalidReferral.error?.code === '22000'));

const employeeReferralRead = await employeeA.client.from('employee_referrals').select('id,candidate_email')
  .eq('id', referralId).maybeSingle();
const tenantBReferralRead = await managerB.client.from('employee_referrals').select('id,candidate_email')
  .eq('tenant_id', ids.tenantA);
const ownerSignedResume = await employeeA.client.storage.from('employee-referral-files').createSignedUrl(referralPath, 60);
const recruiterSignedResume = await managerA.client.storage.from('employee-referral-files').createSignedUrl(referralPath, 60);
const tenantBSignedResume = await managerB.client.storage.from('employee-referral-files').createSignedUrl(referralPath, 60);
const ownerResumeDownload = await employeeA.client.storage.from('employee-referral-files').download(referralPath);
const recruiterResumeDownload = await managerA.client.storage.from('employee-referral-files').download(referralPath);
const tenantBResumeDownload = await managerB.client.storage.from('employee-referral-files').download(referralPath);
record('Referral personal data and private resumes are owner- and tenant-scoped',
  !employeeReferralRead.error && employeeReferralRead.data?.candidate_email === 'qa-referral-a@candidate.test'
    && !tenantBReferralRead.error && tenantBReferralRead.data.length === 0
    && !ownerSignedResume.error && !recruiterSignedResume.error
    && Boolean(tenantBSignedResume.error)
    && !ownerResumeDownload.error && !recruiterResumeDownload.error
    && Boolean(tenantBResumeDownload.error),
  JSON.stringify({
    employeeRead: employeeReferralRead.error?.message || null,
    ownerSigned: ownerSignedResume.error?.message || null,
    managerSigned: recruiterSignedResume.error?.message || null,
    tenantBSignedDenied: Boolean(tenantBSignedResume.error),
    ownerDownload: ownerResumeDownload.error?.message || null,
    managerDownload: recruiterResumeDownload.error?.message || null,
    tenantBDownloadDenied: Boolean(tenantBResumeDownload.error),
  }));

const employeeCannotReviewReferral = await employeeA.client.rpc('hris_mark_employee_referral_in_review', {
  p_tenant_id: ids.tenantA, p_referral_id: referralId, p_note: null,
});
const crossTenantReferralReview = await managerB.client.rpc('hris_mark_employee_referral_in_review', {
  p_tenant_id: ids.tenantA, p_referral_id: referralId, p_note: null,
});
const referralReview = await managerA.client.rpc('hris_mark_employee_referral_in_review', {
  p_tenant_id: ids.tenantA, p_referral_id: referralId, p_note: 'Initial review started.',
});
const referralReviewDuplicate = await managerA.client.rpc('hris_mark_employee_referral_in_review', {
  p_tenant_id: ids.tenantA, p_referral_id: referralId, p_note: 'Duplicate transition.',
});
const referralAfterReview = queryAdmin(`SELECT coalesce((SELECT jsonb_build_object('status',status,'note',status_note,'actor',status_updated_by)
  FROM public.employee_referrals WHERE id='${referralId}'::uuid),'{}'::jsonb)`);
record('Only an active referral manager can move a submitted referral into review, once, with an audit actor',
  Boolean(employeeCannotReviewReferral.error?.code === '42501')
    && Boolean(crossTenantReferralReview.error?.code === '42501')
    && !referralReview.error && referralReview.data?.status === 'in_review'
    && Boolean(referralReviewDuplicate.error?.code === 'P0002')
    && referralAfterReview.status === 'in_review' && referralAfterReview.note === 'Initial review started.'
    && referralAfterReview.actor === managerA.userId);

let referralBrowserOutput = '';
let referralBrowserError = '';
try {
  referralBrowserOutput = execFileSync('node', [path.join(here, 'run-employee-referrals-browser.mjs')], {
    cwd: mainRoot,
    env: {
      ...process.env,
      HRIS_LOCAL_SUPABASE_URL: services.API_URL,
      HRIS_LOCAL_SUPABASE_ANON_KEY: services.ANON_KEY,
      HRIS_LOCAL_TEST_PASSWORD: password,
      HRIS_LOCAL_REFERRAL_EMPLOYEE_EMAIL: emails[5],
      HRIS_LOCAL_REFERRAL_MANAGER_EMAIL: emails[0],
      HRIS_LOCAL_TENANT_ID: ids.tenantA,
    },
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
} catch (error) {
  referralBrowserError = String(error.stderr || error.message || 'local employee-referral browser run failed').slice(-1400);
}
record('Real Auth, Storage, RPC, and Postgres referral journey passes at 375px mobile and 1280px desktop',
  referralBrowserOutput.includes('Local Auth-to-Postgres employee referral journey passed at 375px mobile and 1280px desktop.'),
  referralBrowserError);

const employeeAGoalId = '88888888-8888-4888-8888-888888888801';
const employeeBGoalId = '88888888-8888-4888-8888-888888888802';
const appraisalAEmployeeId = '88888888-8888-4888-8888-888888888931';
const appraisalAReviewerId = '88888888-8888-4888-8888-888888888932';
const appraisalAUnassignedId = '88888888-8888-4888-8888-888888888933';
const appraisalBEmployeeId = '88888888-8888-4888-8888-888888888934';
let appraisalBrowserOutput = '';
let appraisalBrowserError = '';
try {
  appraisalBrowserOutput = execFileSync('node', [path.join(here, 'run-appraisal-browser.mjs')], {
    cwd: mainRoot,
    env: {
      ...process.env,
      HRIS_LOCAL_SUPABASE_URL: services.API_URL,
      HRIS_LOCAL_SUPABASE_ANON_KEY: services.ANON_KEY,
      HRIS_LOCAL_TEST_PASSWORD: password,
      HRIS_LOCAL_APPRAISAL_EMPLOYEE_EMAIL: emails[5],
      HRIS_LOCAL_APPRAISAL_REVIEWER_EMAIL: emails[7],
      HRIS_LOCAL_APPRAISAL_ID: appraisalAEmployeeId,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
} catch (error) {
  appraisalBrowserError = String(error.stderr || error.message || 'local appraisal browser run failed').slice(-1200);
}
const browserAppraisalState = queryAdmin(`SELECT jsonb_build_object(
  'status',status,'self_comment',self_overall_comment,'manager_comment',manager_overall_comment,
  'manager_scores',manager_scores,'manager_rating',manager_rating,'final_rating',final_rating,
  'final_feedback',final_feedback) FROM public.performance_appraisals WHERE id='${appraisalAEmployeeId}'::uuid`);
record('Real 375px browser completes employee and assigned-reviewer narrative appraisal in local Auth/Postgres',
  appraisalBrowserOutput.includes('Local Auth-to-Postgres narrative appraisal journey passed at 375px mobile and 1280px desktop.')
    && browserAppraisalState.status === 'reviewed_by_manager'
    && browserAppraisalState.self_comment === 'Local Auth employee self-review narrative.'
    && browserAppraisalState.manager_comment === 'Local Auth manager narrative feedback.'
    && browserAppraisalState.manager_scores?.dimension === 'restricted'
    && browserAppraisalState.manager_rating === 4 && browserAppraisalState.final_rating === 5
    && browserAppraisalState.final_feedback === 'Synthetic unreleased feedback',
  JSON.stringify({ browserError: appraisalBrowserError, state: browserAppraisalState }));
psqlSync(`UPDATE public.performance_appraisals SET status='draft',self_overall_comment=NULL,manager_overall_comment=NULL,
  updated_at=created_at WHERE id='${appraisalAEmployeeId}'::uuid`);

const employeeAAppraisals = await employeeA.client.from('performance_appraisals')
  .select('id,tenant_id,employee_id,reviewer_employee_id').eq('tenant_id', ids.tenantA);
const employeeACrossTenantAppraisals = await employeeA.client.from('performance_appraisals')
  .select('id,tenant_id').eq('tenant_id', ids.tenantB);
const employeeBAppraisals = await employeeB.client.from('performance_appraisals')
  .select('id,tenant_id,employee_id').eq('tenant_id', ids.tenantB);
const employeeACycles = await employeeA.client.from('performance_cycles')
  .select('id,tenant_id,name,status').eq('tenant_id', ids.tenantA);
const employeeBCycles = await employeeB.client.from('performance_cycles')
  .select('id,tenant_id,name,status').eq('tenant_id', ids.tenantB);
record('Employees can read only their own tenant-bound appraisals',
  !employeeAAppraisals.error && employeeAAppraisals.data.length === 1
    && employeeAAppraisals.data[0].id === appraisalAEmployeeId
    && !employeeACrossTenantAppraisals.error && employeeACrossTenantAppraisals.data.length === 0
    && !employeeBAppraisals.error && employeeBAppraisals.data.length === 1
    && employeeBAppraisals.data[0].id === appraisalBEmployeeId);
record('Employees can read only the review-cycle context linked to their own appraisal',
  !employeeACycles.error && employeeACycles.data.length === 1
    && employeeACycles.data[0].id === '88888888-8888-4888-8888-888888888901'
    && employeeACycles.data[0].name === 'QA A Annual Review'
    && !employeeBCycles.error && employeeBCycles.data.length === 1
    && employeeBCycles.data[0].id === '88888888-8888-4888-8888-888888888902');

const assignedReviewerAppraisals = await managerA2.client.from('performance_appraisals')
  .select('id,tenant_id,reviewer_employee_id').eq('tenant_id', ids.tenantA);
const assignedReviewerCrossTenant = await managerA2.client.from('performance_appraisals')
  .select('id,tenant_id').eq('tenant_id', ids.tenantB);
const reviewerCycles = await managerA2.client.from('performance_cycles')
  .select('id,tenant_id,name,status').eq('tenant_id', ids.tenantA);
record('Assigned in-tenant reviewer sees only explicitly assigned appraisals',
  !assignedReviewerAppraisals.error && assignedReviewerAppraisals.data.length === 2
    && assignedReviewerAppraisals.data.some(row => row.id === appraisalAEmployeeId)
    && assignedReviewerAppraisals.data.some(row => row.id === appraisalAReviewerId)
    && assignedReviewerAppraisals.data.every(row => row.reviewer_employee_id === '55555555-5555-4555-8555-555555555556')
    && !assignedReviewerAppraisals.data.some(row => row.id === appraisalAUnassignedId)
    && !assignedReviewerCrossTenant.error && assignedReviewerCrossTenant.data.length === 0
    && !reviewerCycles.error && reviewerCycles.data.length === 1
    && reviewerCycles.data[0].id === '88888888-8888-4888-8888-888888888901',
  JSON.stringify({ tenantA: assignedReviewerAppraisals.data, tenantB: assignedReviewerCrossTenant.data }));

const managerAAppraisals = await managerA.client.from('performance_appraisals')
  .select('id,tenant_id').eq('tenant_id', ids.tenantA);
const managerACrossTenantAppraisals = await managerA.client.from('performance_appraisals')
  .select('id,tenant_id').eq('tenant_id', ids.tenantB);
const managerBAppraisals = await managerB.client.from('performance_appraisals')
  .select('id,tenant_id').eq('tenant_id', ids.tenantB);
const managerBCrossTenantAppraisals = await managerB.client.from('performance_appraisals')
  .select('id,tenant_id').eq('tenant_id', ids.tenantA);
record('Performance managers can read authorized appraisals in their own tenant only',
  !managerAAppraisals.error && managerAAppraisals.data.length === 3
    && !managerACrossTenantAppraisals.error && managerACrossTenantAppraisals.data.length === 0
    && !managerBAppraisals.error && managerBAppraisals.data.length === 1
    && managerBAppraisals.data[0].id === appraisalBEmployeeId
    && !managerBCrossTenantAppraisals.error && managerBCrossTenantAppraisals.data.length === 0);

const reportOnlyAppraisals = await reportViewerA.client.from('performance_appraisals')
  .select('id,tenant_id').eq('tenant_id', ids.tenantA);
const viewerAppraisals = await tenantViewer.client.from('performance_appraisals')
  .select('id,tenant_id').eq('tenant_id', ids.tenantB);
const globalOnlyAppraisals = await globalOnly.client.from('performance_appraisals')
  .select('id,tenant_id');
const anonymousAppraisalAttempt = attemptAs(null,
  'SELECT count(*) FROM public.performance_appraisals', 'anon');
record('Unassigned report/view roles, global role without membership, and anon cannot read appraisals',
  !reportOnlyAppraisals.error && reportOnlyAppraisals.data.length === 0
    && !viewerAppraisals.error && viewerAppraisals.data.length === 0
    && !globalOnlyAppraisals.error && globalOnlyAppraisals.data.length === 0
    && !anonymousAppraisalAttempt.ok);
const unreleasedScoreRead = await employeeA.client.from('performance_appraisals')
  .select('manager_scores,final_rating,final_feedback').eq('id', appraisalAEmployeeId);
record('Appraisal scores and final feedback are not available through direct table reads',
  Boolean(unreleasedScoreRead.error));

psqlSync("UPDATE public.tenant_memberships SET status='inactive' WHERE tenant_id='"
  + ids.tenantA + "'::uuid AND user_id='" + managerA2.userId + "'::uuid");
const inactiveReviewerAppraisals = await managerA2.client.from('performance_appraisals')
  .select('id,tenant_id').eq('tenant_id', ids.tenantA);
psqlSync("UPDATE public.tenant_memberships SET status='active' WHERE tenant_id='"
  + ids.tenantA + "'::uuid AND user_id='" + managerA2.userId + "'::uuid");
record('Assigned reviewer access ends when the tenant membership becomes inactive',
  !inactiveReviewerAppraisals.error && inactiveReviewerAppraisals.data.length === 0);

const appraisalWorkBefore = await employeeA.client.rpc('hris_get_my_appraisal_work', { p_tenant_id: ids.tenantA });
const employeeDraftAppraisal = appraisalWorkBefore.data?.appraisals?.find(row => row.id === appraisalAEmployeeId);
const employeeCrossTenantWork = await employeeA.client.rpc('hris_get_my_appraisal_work', { p_tenant_id: ids.tenantB });
const anonymousAppraisalWork = attemptAs(null,
  `SELECT public.hris_get_my_appraisal_work('${ids.tenantA}'::uuid)`, 'anon');
record('Appraisal work RPC is employee-bound, tenant-scoped, and excludes score fields',
  !appraisalWorkBefore.error && employeeDraftAppraisal?.status === 'draft'
    && employeeDraftAppraisal.self_comment === null && employeeDraftAppraisal.manager_comment === null
    && !('manager_scores' in employeeDraftAppraisal) && !('final_rating' in employeeDraftAppraisal)
    && Boolean(employeeCrossTenantWork.error) && !anonymousAppraisalWork.ok);

const selfCommentDraft = await employeeA.client.rpc('hris_save_my_appraisal_self_comment', {
  p_tenant_id: ids.tenantA, p_appraisal_id: appraisalAEmployeeId,
  p_comment: 'Synthetic employee self-review draft.', p_submit: false,
});
const directAppraisalWrite = await employeeA.client.from('performance_appraisals')
  .update({ self_overall_comment: 'Must be denied directly.' }).eq('id', appraisalAEmployeeId);
const crossTenantSelfWrite = await employeeB.client.rpc('hris_save_my_appraisal_self_comment', {
  p_tenant_id: ids.tenantA, p_appraisal_id: appraisalAEmployeeId,
  p_comment: 'Cross-tenant attempt.', p_submit: true,
});
record('Employee can save only their own narrative draft through RPC; direct and cross-tenant writes are denied',
  !selfCommentDraft.error && selfCommentDraft.data?.status === 'draft'
    && Boolean(directAppraisalWrite.error) && Boolean(crossTenantSelfWrite.error));

const selfSubmit = await employeeA.client.rpc('hris_save_my_appraisal_self_comment', {
  p_tenant_id: ids.tenantA, p_appraisal_id: appraisalAEmployeeId,
  p_comment: 'Synthetic employee self-review submitted.', p_submit: true,
});
const reviewerWork = await managerA2.client.rpc('hris_get_my_appraisal_work', { p_tenant_id: ids.tenantA });
const assignedReviewRow = reviewerWork.data?.appraisals?.find(row => row.id === appraisalAEmployeeId);
const wrongReviewerWrite = await employeeClock.client.rpc('hris_save_assigned_appraisal_review', {
  p_tenant_id: ids.tenantA, p_appraisal_id: appraisalAEmployeeId,
  p_comment: 'Unassigned reviewer attempt.', p_submit: true,
});
const managerAWork = await managerA.client.rpc('hris_get_my_appraisal_work', { p_tenant_id: ids.tenantA });
record('Submitted self-review is visible to its assigned active reviewer only',
  !selfSubmit.error && selfSubmit.data?.status === 'submitted_by_employee'
    && !reviewerWork.error && assignedReviewRow?.self_comment === 'Synthetic employee self-review submitted.'
    && assignedReviewRow.manager_comment === null && Boolean(wrongReviewerWrite.error)
    && Boolean(managerAWork.error));

psqlSync("UPDATE public.tenant_memberships SET status='inactive' WHERE tenant_id='"
  + ids.tenantA + "'::uuid AND user_id='" + managerA2.userId + "'::uuid");
const inactiveReviewerWrite = await managerA2.client.rpc('hris_save_assigned_appraisal_review', {
  p_tenant_id: ids.tenantA, p_appraisal_id: appraisalAEmployeeId,
  p_comment: 'Inactive reviewer attempt.', p_submit: false,
});
psqlSync("UPDATE public.tenant_memberships SET status='active' WHERE tenant_id='"
  + ids.tenantA + "'::uuid AND user_id='" + managerA2.userId + "'::uuid");
const reviewerDraft = await managerA2.client.rpc('hris_save_assigned_appraisal_review', {
  p_tenant_id: ids.tenantA, p_appraisal_id: appraisalAEmployeeId,
  p_comment: 'Synthetic manager review draft.', p_submit: false,
});
record('Assigned-reviewer writing requires an active same-tenant membership and preserves submitted state in draft',
  Boolean(inactiveReviewerWrite.error) && !reviewerDraft.error
    && reviewerDraft.data?.status === 'submitted_by_employee');

const reviewerSubmit = await managerA2.client.rpc('hris_save_assigned_appraisal_review', {
  p_tenant_id: ids.tenantA, p_appraisal_id: appraisalAEmployeeId,
  p_comment: 'Synthetic manager narrative feedback.', p_submit: true,
});
const employeeWorkAfterReview = await employeeA.client.rpc('hris_get_my_appraisal_work', { p_tenant_id: ids.tenantA });
const completedAppraisalWork = employeeWorkAfterReview.data?.appraisals?.find(row => row.id === appraisalAEmployeeId);
const unchangedAppraisalScores = queryAdmin(`SELECT jsonb_build_object(
  'manager_scores',manager_scores,'manager_rating',manager_rating,'final_rating',final_rating,
  'final_feedback',final_feedback) FROM public.performance_appraisals WHERE id='${appraisalAEmployeeId}'::uuid`);
record('Manager narrative feedback completes the reviewer journey and returns only after submission without changing scores',
  !reviewerSubmit.error && reviewerSubmit.data?.status === 'reviewed_by_manager'
    && !employeeWorkAfterReview.error && completedAppraisalWork?.status === 'reviewed_by_manager'
    && completedAppraisalWork.self_comment === 'Synthetic employee self-review submitted.'
    && completedAppraisalWork.manager_comment === 'Synthetic manager narrative feedback.'
    && unchangedAppraisalScores.manager_scores?.dimension === 'restricted'
    && unchangedAppraisalScores.manager_rating === 4 && unchangedAppraisalScores.final_rating === 5
    && unchangedAppraisalScores.final_feedback === 'Synthetic unreleased feedback');
const duplicateSelfSubmit = await employeeA.client.rpc('hris_save_my_appraisal_self_comment', {
  p_tenant_id: ids.tenantA, p_appraisal_id: appraisalAEmployeeId,
  p_comment: 'Duplicate submit.', p_submit: true,
});
const duplicateReviewerSubmit = await managerA2.client.rpc('hris_save_assigned_appraisal_review', {
  p_tenant_id: ids.tenantA, p_appraisal_id: appraisalAEmployeeId,
  p_comment: 'Duplicate reviewer submit.', p_submit: true,
});
record('Submitted appraisal stages are immutable through the workflow RPCs',
  Boolean(duplicateSelfSubmit.error) && Boolean(duplicateReviewerSubmit.error));

const ownGoalRead = await employeeA.client.from('performance_goals')
  .select('id,tenant_id,employee_id,current_progress')
  .eq('tenant_id', ids.tenantA).eq('id', employeeAGoalId);
const otherTenantGoalRead = await employeeB.client.from('performance_goals')
  .select('id,tenant_id,employee_id,current_progress').eq('tenant_id', ids.tenantA);
record('Performance goal reads are filtered to the employee’s linked tenant and self rows',
  !ownGoalRead.error && ownGoalRead.data.length === 1
    && ownGoalRead.data[0].id === employeeAGoalId
    && !otherTenantGoalRead.error && otherTenantGoalRead.data.length === 0);

const managerGoalTenantsA = new Set(queryAs(managerA, `SELECT coalesce(jsonb_agg(tenant_id::text ORDER BY tenant_id::text),'[]'::jsonb)
  FROM (SELECT DISTINCT tenant_id FROM public.performance_goals) visible`));
const managerGoalTenantsB = new Set(queryAs(managerB, `SELECT coalesce(jsonb_agg(tenant_id::text ORDER BY tenant_id::text),'[]'::jsonb)
  FROM (SELECT DISTINCT tenant_id FROM public.performance_goals) visible`));
record('Performance viewers can read their own tenant goals but not another tenant',
  managerGoalTenantsA.has(ids.tenantA) && !managerGoalTenantsA.has(ids.tenantB)
    && managerGoalTenantsB.has(ids.tenantB) && !managerGoalTenantsB.has(ids.tenantA));

const selfProgressUpdate = await employeeA.client.from('performance_goals')
  .update({ current_progress: 37.5 }).eq('tenant_id', ids.tenantA).eq('id', employeeAGoalId)
  .select('id,current_progress,updated_at');
const savedGoal = queryAdmin(`SELECT jsonb_build_object('progress',current_progress,'title',title,'tenant_id',tenant_id)
  FROM public.performance_goals WHERE id='${employeeAGoalId}'::uuid`);
record('Employee can save progress on their own goal and the update remains tenant-bound',
  !selfProgressUpdate.error && selfProgressUpdate.data.length === 1
    && Number(selfProgressUpdate.data[0].current_progress) === 37.5
    && Number(savedGoal.progress) === 37.5 && savedGoal.title === 'QA A goal'
    && savedGoal.tenant_id === ids.tenantA);

const employeeFieldUpdate = await employeeA.client.from('performance_goals')
  .update({ title: 'Unauthorized title change' }).eq('tenant_id', ids.tenantA).eq('id', employeeAGoalId)
  .select('id,title');
const invalidProgressUpdate = await employeeA.client.from('performance_goals')
  .update({ current_progress: 120 }).eq('tenant_id', ids.tenantA).eq('id', employeeAGoalId)
  .select('id,current_progress');
const afterRejectedGoalWrites = queryAdmin(`SELECT jsonb_build_object('progress',current_progress,'title',title)
  FROM public.performance_goals WHERE id='${employeeAGoalId}'::uuid`);
record('Employee cannot edit goal ownership/details or save progress outside 0–100',
  Boolean(employeeFieldUpdate.error) && Boolean(invalidProgressUpdate.error)
    && Number(afterRejectedGoalWrites.progress) === 37.5
    && afterRejectedGoalWrites.title === 'QA A goal');

const crossTenantGoalUpdate = await employeeB.client.from('performance_goals')
  .update({ current_progress: 90 }).eq('tenant_id', ids.tenantA).eq('id', employeeAGoalId)
  .select('id,current_progress');
const crossTenantGoalAfter = queryAdmin(`SELECT jsonb_build_object('progress',current_progress)
  FROM public.performance_goals WHERE id='${employeeAGoalId}'::uuid`);
record('Employee in tenant B cannot modify an employee goal in tenant A',
  !crossTenantGoalUpdate.error && crossTenantGoalUpdate.data.length === 0
    && Number(crossTenantGoalAfter.progress) === 37.5);

const guardedTenantTables = [
  'attendance_corrections', 'attendance_records', 'confirmation_reviews', 'designations',
  'employee_leave_balances', 'employee_referrals', 'grades', 'holidays', 'hr_policies',
  'manpower_requisitions', 'notices', 'org_locations', 'pay_periods', 'payslips',
  'performance_cycles', 'performance_goals', 'project_performance_reviews', 'service_requests',
  'shifts', 'teams',
];
const guardedTenantQuery = `SELECT jsonb_build_object(${guardedTenantTables.map(table =>
  `'${table}', coalesce((SELECT jsonb_agg(DISTINCT tenant_id::text) FROM public.${table}),'[]'::jsonb)`,
).join(',')})`;
const tenantAVisibleTables = queryAs(managerA, guardedTenantQuery);
const tenantBVisibleTables = queryAs(managerB, guardedTenantQuery);
const globalOnlyVisibleTables = queryAs(globalOnly, guardedTenantQuery);
const anonymousVisibleTables = queryAnon(guardedTenantQuery);
const visibleOnlyInTenant = (rows, tenantId) => Object.values(rows).every(value =>
  Array.isArray(value) && value.length === 1 && value[0] === tenantId);
const noVisibleTenants = rows => Object.values(rows).every(value => Array.isArray(value) && value.length === 0);
record('All 20 legacy-readable tables resolve through each active membership role only',
  visibleOnlyInTenant(tenantAVisibleTables, ids.tenantA)
    && visibleOnlyInTenant(tenantBVisibleTables, ids.tenantB),
  `tenant A tables=${Object.values(tenantAVisibleTables).filter(value => value.length === 1).length}/20; `
    + `tenant B tables=${Object.values(tenantBVisibleTables).filter(value => value.length === 1).length}/20`);
record('Global role permissions without an active tenant membership reveal none of the 20 tables',
  noVisibleTenants(globalOnlyVisibleTables));
record('Anonymous role cannot read any tenant table even where SELECT is granted',
  noVisibleTenants(anonymousVisibleTables));
const tenantViewerVisibleTables = queryAs(tenantViewer, guardedTenantQuery);
record('Tenant viewer retains own attendance, leave, holiday and notice reads without broader module grants',
  tenantViewerVisibleTables.attendance_records.includes(ids.tenantB)
    && tenantViewerVisibleTables.employee_leave_balances.includes(ids.tenantB)
    && tenantViewerVisibleTables.holidays.includes(ids.tenantB)
    && tenantViewerVisibleTables.notices.includes(ids.tenantB)
    && tenantViewerVisibleTables.performance_cycles.length === 0
    && !tenantViewerVisibleTables.attendance_records.includes(ids.tenantA)
    && !tenantViewerVisibleTables.holidays.includes(ids.tenantA));

const authStatus = queryAs(managerA, `SELECT jsonb_build_object(
  'uid',auth.uid(),'session_id',auth.jwt()->>'session_id',
  'live',public.is_live_session(),
  'leave_manage',public.has_tenant_permission('${ids.tenantA}'::uuid,'leave.manage'))`);
record('Synthetic user received a real active local Supabase Auth session and permission',
  authStatus.uid === managerA.userId && Boolean(authStatus.session_id)
  && authStatus.live === true && authStatus.leave_manage === true);

const functionGrantMatrix = queryAdmin(`SELECT jsonb_object_agg(fn,jsonb_build_object(
  'anon',has_function_privilege('anon',fn,'EXECUTE'),
  'authenticated',has_function_privilege('authenticated',fn,'EXECUTE'),
  'service_role',has_function_privilege('service_role',fn,'EXECUTE')))
FROM (VALUES
  ('public.has_tenant_permission(uuid,text)'),
  ('public.hris_get_tenant_dashboard_summary(uuid)'),
  ('public.hris_get_tenant_attendance_data(uuid,date,date,text,text,boolean)'),
  ('public.hris_get_tenant_shift_roster_data(uuid,date,date,text)'),
  ('public.hris_get_tenant_shift_roster_options(uuid)'),
  ('public.hris_assign_tenant_employee_shift(uuid,uuid,uuid,date)'),
  ('public.hris_get_tenant_leave_data(uuid,date,date)'),
  ('public.hris_get_my_dashboard_data(uuid)'),
  ('public.hris_employee_submit_attendance_correction(uuid,jsonb)'),
  ('public.hris_employee_record_attendance_event(uuid,text)'),
  ('public.hris_employee_submit_leave_request(uuid,jsonb)'),
  ('public.hris_get_my_timesheet_context(uuid)'),
  ('public.hris_save_my_timesheet(uuid,uuid,text,date,date,jsonb)'),
  ('public.hris_save_my_timesheet(uuid,uuid,text,date,date,jsonb,integer)'),
  ('public.hris_submit_my_timesheet(uuid,uuid)'),
  ('public.hris_get_my_project_timesheet_reviews(uuid)'),
  ('public.hris_resolve_project_timesheet(uuid,uuid,uuid,integer,text,text)'),
  ('public.hris_resubmit_rejected_project_timesheet(uuid,uuid,uuid,integer,jsonb)'),
  ('public.hris_get_my_travel_context(uuid)'),
  ('public.hris_save_my_travel_request(uuid,uuid,text,date,date,text,numeric,text)'),
  ('public.hris_submit_my_travel_request(uuid,uuid)'),
  ('public.hris_get_tenant_travel_requests(uuid)'),
  ('public.hris_resolve_travel_request(uuid,uuid,text,text)'),
  ('public.hris_get_my_expense_context(uuid)'),
  ('public.hris_save_my_expense_draft(uuid,uuid,text,uuid,date,numeric,text)'),
  ('public.hris_submit_my_expense_claim(uuid,uuid)'),
  ('public.hris_reopen_my_expense_claim(uuid,uuid)'),
  ('public.hris_get_tenant_expense_claims(uuid)'),
  ('public.hris_get_my_service_requests(uuid)'),
  ('public.hris_submit_my_service_request(uuid,text,text)'),
  ('public.hris_get_tenant_project_workspace(uuid)'),
  ('public.hris_get_my_projects(uuid)'),
  ('public.hris_get_my_notifications(uuid,integer,timestamptz,text,uuid)'),
  ('public.hris_create_tenant_project(uuid,text,text,text,text,uuid,date,date,text)'),
  ('public.hris_assign_tenant_project_allocation(uuid,uuid,uuid,text,numeric,date,date)'),
  ('public.hris_release_tenant_project_allocation(uuid,uuid)'),
  ('public.admin_resolve_leave_request(uuid,text,text)'),
  ('public.admin_resolve_attendance_correction(uuid,text,text)'),
  ('public.hris_can_access_leave_evidence(text,text)'),
  ('public.hris_own_employee_for_tenant(uuid)'),
  ('public.hris_admin_can_read_tenant(uuid,text)')
) f(fn)`);
record('Tenant and employee RPC grants exclude anon and permit authenticated/service_role',
  Object.values(functionGrantMatrix).every(grants => grants.anon === false
    && grants.authenticated === true && grants.service_role === true),
  JSON.stringify(functionGrantMatrix));

const rosterA = queryAs(managerA, `SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.assignment_date,r.full_name),'[]'::jsonb)
  FROM public.hris_get_tenant_shift_roster_data('${ids.tenantA}'::uuid,'${localCurrentDate}'::date,'${localCurrentDate}'::date,NULL) r`);
const rosterB = queryAs(managerB, `SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.assignment_date,r.full_name),'[]'::jsonb)
  FROM public.hris_get_tenant_shift_roster_data('${ids.tenantB}'::uuid,'${localCurrentDate}'::date,'${localCurrentDate}'::date,NULL) r`);
record('Roster RPC returns assigned employee and shift details for the active tenant only',
  rosterA.length === 1 && rosterA[0].employee_number === 'QA-A-001'
  && rosterA[0].shift_name === 'Synthetic Day Shift'
  && rosterB.length === 1 && rosterB[0].employee_number === 'QA-B-001'
  && rosterB[0].shift_name === 'Synthetic Tenant B Shift',
  JSON.stringify({ tenantA: rosterA, tenantB: rosterB }));

const rosterCrossTenant = attemptAs(managerB,
  `SELECT * FROM public.hris_get_tenant_shift_roster_data('${ids.tenantA}'::uuid,'${localCurrentDate}'::date,'${localCurrentDate}'::date,NULL)`);
const rosterGlobalOnly = attemptAs(globalOnly,
  `SELECT * FROM public.hris_get_tenant_shift_roster_data('${ids.tenantA}'::uuid,'${localCurrentDate}'::date,'${localCurrentDate}'::date,NULL)`);
record('Roster RPC denies cross-tenant and global-role-only access',
  !rosterCrossTenant.ok && !rosterGlobalOnly.ok,
  `tenant B=${rosterCrossTenant.ok ? 'allowed' : 'denied'}, global-only=${rosterGlobalOnly.ok ? 'allowed' : 'denied'}`);

const rosterViewerB = queryAs(tenantViewer,
  `SELECT count(*)::integer FROM public.hris_get_tenant_shift_roster_data('${ids.tenantB}'::uuid,'${localCurrentDate}'::date,'${localCurrentDate}'::date,'QA-B-001')`);
const rosterSearchMismatch = queryAs(managerA,
  `SELECT count(*)::integer FROM public.hris_get_tenant_shift_roster_data('${ids.tenantA}'::uuid,'${localCurrentDate}'::date,'${localCurrentDate}'::date,'no matching shift')`);
const rosterBadRange = attemptAs(managerA,
  `SELECT * FROM public.hris_get_tenant_shift_roster_data('${ids.tenantA}'::uuid,'${localCurrentDate}'::date,'${localCurrentDate}'::date - 1,NULL)`);
record('Roster RPC supports tenant-viewer search and rejects an inverted date range',
  rosterViewerB === 1 && rosterSearchMismatch === 0
  && !rosterBadRange.ok,
  JSON.stringify({ viewerSearch: rosterViewerB, emptySearch: rosterSearchMismatch,
    invertedRangeRejected: !rosterBadRange.ok }));

const rosterOptionsA = queryAs(managerA,
  `SELECT public.hris_get_tenant_shift_roster_options('${ids.tenantA}'::uuid)`);
const rosterOptionsB = queryAs(managerB,
  `SELECT public.hris_get_tenant_shift_roster_options('${ids.tenantB}'::uuid)`);
record('Roster assignment options return only the active employees and shifts from the manager’s tenant',
  rosterOptionsA.employees.some(row => row.employee_number === 'QA-A-002')
  && rosterOptionsA.shifts.length === 1 && rosterOptionsA.shifts[0].code === 'QA-DAY'
  && rosterOptionsB.employees.some(row => row.employee_number === 'QA-B-001')
  && rosterOptionsB.shifts.length === 1 && rosterOptionsB.shifts[0].code === 'QA-B');

const rosterViewerOptions = attemptAs(tenantViewer,
  `SELECT public.hris_get_tenant_shift_roster_options('${ids.tenantB}'::uuid)`);
const rosterGlobalOptions = attemptAs(globalOnly,
  `SELECT public.hris_get_tenant_shift_roster_options('${ids.tenantA}'::uuid)`);
record('Roster assignment options require tenant attendance.manage and deny view-only/global-only users',
  !rosterViewerOptions.ok && !rosterGlobalOptions.ok);

const rosterAssignmentDate = queryAdmin(`SELECT to_jsonb('${localCurrentDate}'::date+1)`);
const rosterAssignmentId = queryAs(managerA, `SELECT to_jsonb(public.hris_assign_tenant_employee_shift(
  '${ids.tenantA}'::uuid,'55555555-5555-4555-8555-555555555556'::uuid,
  '33333333-3333-4333-8333-333333333333'::uuid,'${rosterAssignmentDate}'::date))`);
const rosterAssignment = rosterAssignmentId ? tableRow('employee_shift_assignments', rosterAssignmentId) : null;
const rosterAssignmentAudit = Number(queryAdmin(`SELECT count(*)::integer FROM public.admin_audit_logs
  WHERE actor_id='${managerA.userId}'::uuid AND target_type='employee_shift_assignment'
    AND target_id='${rosterAssignmentId}' AND action='shift.assignment.created'`));
record('Attendance manager assigns an active same-tenant employee and shift with one audit event',
  Boolean(rosterAssignmentId) && rosterAssignment?.tenant_id === ids.tenantA
  && rosterAssignment?.employee_id === '55555555-5555-4555-8555-555555555556'
  && rosterAssignment?.shift_id === '33333333-3333-4333-8333-333333333333'
  && rosterAssignment?.assignment_date === rosterAssignmentDate
  && rosterAssignment?.created_by === managerA.userId && rosterAssignmentAudit === 1);

const rosterDuplicateAssignment = attemptAs(managerA, `SELECT public.hris_assign_tenant_employee_shift(
  '${ids.tenantA}'::uuid,'55555555-5555-4555-8555-555555555556'::uuid,
  '33333333-3333-4333-8333-333333333333'::uuid,'${rosterAssignmentDate}'::date)`);
const rosterRowsForDate = Number(queryAdmin(`SELECT count(*)::integer FROM public.employee_shift_assignments
  WHERE tenant_id='${ids.tenantA}'::uuid AND employee_id='55555555-5555-4555-8555-555555555556'
    AND assignment_date='${rosterAssignmentDate}'::date`));
record('Duplicate employee/date assignment is rejected without overwriting the saved shift or duplicate audit',
  !rosterDuplicateAssignment.ok && rosterRowsForDate === 1
  && tableRow('employee_shift_assignments', rosterAssignmentId)?.shift_id === '33333333-3333-4333-8333-333333333333'
  && rosterAssignmentAudit === 1);

const rosterEmployeeWrite = attemptAs(employeeA, `SELECT public.hris_assign_tenant_employee_shift(
  '${ids.tenantA}'::uuid,'55555555-5555-4555-8555-555555555556'::uuid,
  '33333333-3333-4333-8333-333333333333'::uuid,'${localCurrentDate}'::date+2)`);
const rosterCrossTenantWrite = attemptAs(managerB, `SELECT public.hris_assign_tenant_employee_shift(
  '${ids.tenantA}'::uuid,'55555555-5555-4555-8555-555555555556'::uuid,
  '33333333-3333-4333-8333-333333333333'::uuid,'${localCurrentDate}'::date+2)`);
const rosterForeignEmployee = attemptAs(managerA, `SELECT public.hris_assign_tenant_employee_shift(
  '${ids.tenantA}'::uuid,'66666666-6666-4666-8666-666666666666'::uuid,
  '33333333-3333-4333-8333-333333333333'::uuid,'${localCurrentDate}'::date+2)`);
const rosterForeignShift = attemptAs(managerA, `SELECT public.hris_assign_tenant_employee_shift(
  '${ids.tenantA}'::uuid,'55555555-5555-4555-8555-555555555556'::uuid,
  '44444444-4444-4444-8444-444444444444'::uuid,'${localCurrentDate}'::date+2)`);
record('Roster assignment write denies employees and rejects another tenant’s employee or shift',
  !rosterEmployeeWrite.ok && !rosterCrossTenantWrite.ok
  && !rosterForeignEmployee.ok && !rosterForeignShift.ok);

const tenantBAuth = queryAs(managerB, `SELECT jsonb_build_object(
  'legacy_permission',public.has_permission('leave.manage'),
  'tenant_b_permission',public.has_tenant_permission('${ids.tenantB}'::uuid,'leave.manage'))`);
record('Tenant B membership grants only tenant B through permission helpers',
  tenantBAuth.legacy_permission === false && tenantBAuth.tenant_b_permission === true);

const evidencePathA = `${employeeA.userId}/${ids.tenantA}/${randomUUID()}.pdf`;
const evidencePathB = `${employeeB.userId}/${ids.tenantB}/${randomUUID()}.pdf`;
const sampleEvidence = new Blob(['%PDF-1.4\n% isolated synthetic evidence\n'], { type: 'application/pdf' });
const uploadEvidenceA = await employeeA.client.storage.from('leave-evidence').upload(
  evidencePathA, sampleEvidence, { contentType: 'application/pdf', upsert: false },
);
if (!uploadEvidenceA.error) uploadedEvidencePaths.push(evidencePathA);
const uploadEvidenceB = await employeeB.client.storage.from('leave-evidence').upload(
  evidencePathB, sampleEvidence, { contentType: 'application/pdf', upsert: false },
);
if (!uploadEvidenceB.error) uploadedEvidencePaths.push(evidencePathB);
record('Linked employees can upload private evidence only under their own tenant path',
  !uploadEvidenceA.error && !uploadEvidenceB.error,
  uploadEvidenceA.error?.message || uploadEvidenceB.error?.message || 'synthetic files uploaded');

const managerAReadEvidence = await managerA.client.storage.from('leave-evidence').download(evidencePathA);
const managerBReadEvidenceA = await managerB.client.storage.from('leave-evidence').download(evidencePathA);
const managerBReadEvidence = await managerB.client.storage.from('leave-evidence').download(evidencePathB);
const managerAReadEvidenceB = await managerA.client.storage.from('leave-evidence').download(evidencePathB);
record('Leave evidence is readable only by its owner or an authorized manager in the same tenant',
  !managerAReadEvidence.error && Boolean(managerBReadEvidenceA.error)
  && !managerBReadEvidence.error && Boolean(managerAReadEvidenceB.error));

const missingProof = await employeeA.client.rpc('hris_employee_submit_leave_request', {
  p_tenant_id: ids.tenantA,
  p_payload: {
    leave_type_id: ids.leaveTypeEvidence, from_date: '2026-10-19', to_date: '2026-10-19',
    day_portion: 'full', reason: 'Synthetic evidence proof test',
  },
});
record('Leave types that require documentary proof cannot be submitted without evidence',
  Boolean(missingProof.error) && missingProof.error.code === '22000');

const submitWithEvidence = uploadEvidenceA.error ? { data: null, error: uploadEvidenceA.error }
  : await employeeA.client.rpc('hris_employee_submit_leave_request', {
    p_tenant_id: ids.tenantA,
    p_payload: {
      leave_type_id: ids.leaveTypeEvidence, from_date: '2026-10-19', to_date: '2026-10-19',
      day_portion: 'full', reason: 'Synthetic evidence-backed leave request',
      attachment_url: evidencePathA,
    },
  });
const evidenceRequestId = submitWithEvidence.data;
const evidenceRequest = evidenceRequestId ? tableRow('leave_requests', evidenceRequestId)
  : null;
const evidenceBalance = queryAdmin(`SELECT to_jsonb(b) FROM public.employee_leave_balances b
  WHERE tenant_id='${ids.tenantA}'::uuid AND employee_id='55555555-5555-4555-8555-555555555555'
    AND leave_type_id='${ids.leaveTypeEvidence}'::uuid AND balance_year=2026`);
record('Employee submits a proof-backed request and the matching balance moves to pending',
  !submitWithEvidence.error && evidenceRequest?.status === 'pending'
  && evidenceRequest?.tenant_id === ids.tenantA
  && evidenceRequest?.attachment_url === evidencePathA
  && Number(evidenceRequest?.requested_days) === 1
  && Number(evidenceBalance.pending_days) === 1,
  submitWithEvidence.error?.message || 'synthetic leave request created');

const duplicateEvidenceSubmit = await employeeA.client.rpc('hris_employee_submit_leave_request', {
  p_tenant_id: ids.tenantA,
  p_payload: {
    leave_type_id: ids.leaveTypeEvidence, from_date: '2026-10-19', to_date: '2026-10-19',
    day_portion: 'full', reason: 'Synthetic duplicate proof-backed request',
    attachment_url: evidencePathA,
  },
});
record('Duplicate pending leave dates are rejected without incrementing the ledger twice',
  Boolean(duplicateEvidenceSubmit.error)
  && duplicateEvidenceSubmit.error.code === '23505'
  && Number(queryAdmin(`SELECT to_jsonb(b) FROM public.employee_leave_balances b
    WHERE tenant_id='${ids.tenantA}'::uuid AND employee_id='55555555-5555-4555-8555-555555555555'
      AND leave_type_id='${ids.leaveTypeEvidence}'::uuid AND balance_year=2026`).pending_days) === 1);

const employeeSummaryA = queryAs(employeeA,
  `SELECT public.hris_get_my_dashboard_data('${ids.tenantA}'::uuid)`);
const employeeSummaryB = queryAs(employeeB,
  `SELECT public.hris_get_my_dashboard_data('${ids.tenantB}'::uuid)`);
const employeeEvidenceRequest = employeeSummaryA.requests.find(row => row.id === evidenceRequestId);
record('Employee leave history returns its own private evidence path and excludes it from another tenant',
  employeeEvidenceRequest?.attachment_url === evidencePathA
  && !JSON.stringify(employeeSummaryB.requests).includes(evidencePathA),
  JSON.stringify({ ownerPathReturned: employeeEvidenceRequest?.attachment_url === evidencePathA,
    foreignTenantContainsPath: JSON.stringify(employeeSummaryB.requests).includes(evidencePathA) }));

const leaveRejectionNote = 'Please correct the requested dates before resubmitting.';
const leaveRejectionSubmit = await employeeA.client.rpc('hris_employee_submit_leave_request', {
  p_tenant_id: ids.tenantA,
  p_payload: {
    leave_type_id: ids.leaveTypeA, from_date: '2026-10-22', to_date: '2026-10-22',
    day_portion: 'full', reason: 'Synthetic UI rejection acceptance',
  },
});
const leaveRejectionRequestId = leaveRejectionSubmit.data;
record('Employee creates a distinct tenant-bound leave request for the manager rejection journey',
  !leaveRejectionSubmit.error && Boolean(leaveRejectionRequestId)
    && tableRow('leave_requests', leaveRejectionRequestId)?.status === 'pending',
  leaveRejectionSubmit.error?.message || 'pending rejection fixture persisted');

let leaveEvidenceBrowserOutput = '';
let leaveEvidenceBrowserError = '';
try {
  leaveEvidenceBrowserOutput = execFileSync('node', [path.join(here, 'run-leave-evidence-browser.mjs')], {
    cwd: mainRoot,
    env: {
      ...process.env,
      HRIS_LOCAL_SUPABASE_URL: services.API_URL,
      HRIS_LOCAL_SUPABASE_ANON_KEY: services.ANON_KEY,
      HRIS_LOCAL_TEST_PASSWORD: password,
      HRIS_LOCAL_LEAVE_EMPLOYEE_EMAIL: emails[5],
      HRIS_LOCAL_LEAVE_MANAGER_EMAIL: emails[0],
      HRIS_LOCAL_LEAVE_TENANT_ID: ids.tenantA,
      HRIS_LOCAL_LEAVE_EMPLOYEE_ID: employeeA.userId,
      HRIS_LOCAL_LEAVE_REQUEST_ID: evidenceRequestId,
      HRIS_LOCAL_LEAVE_EVIDENCE_PATH: evidencePathA,
      HRIS_LOCAL_LEAVE_REQUEST_REASON: 'Synthetic evidence-backed leave request',
      HRIS_LOCAL_LEAVE_HISTORY_YEAR: String(evidenceRequest?.from_date).slice(0, 4),
      HRIS_LOCAL_LEAVE_REJECTION_NOTE: leaveRejectionNote,
      HRIS_LOCAL_LEAVE_REJECTION_REQUEST_ID: leaveRejectionRequestId,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
} catch (error) {
  leaveEvidenceBrowserError = String(error.stderr || error.message || 'local leave-evidence browser run failed').slice(-1800);
  leaveEvidenceBrowserOutput = String(error.stdout || '');
}
let uiLeaveAcceptance = null;
const uiLeaveAcceptanceMatch = leaveEvidenceBrowserOutput.match(/^LEAVE_UI_REQUEST_ACCEPTANCE=(.+)$/m);
if (uiLeaveAcceptanceMatch) {
  try {
    uiLeaveAcceptance = JSON.parse(uiLeaveAcceptanceMatch[1]);
    if (typeof uiLeaveAcceptance.path === 'string'
        && uiLeaveAcceptance.path.startsWith(`${employeeA.userId}/${ids.tenantA}/`)
        && !uploadedEvidencePaths.includes(uiLeaveAcceptance.path)) {
      uploadedEvidencePaths.push(uiLeaveAcceptance.path);
    }
  } catch {
    uiLeaveAcceptance = null;
  }
}
const leaveEvidenceBrowserPassed = leaveEvidenceBrowserOutput.includes('LEAVE_EVIDENCE_BROWSER_ACCEPTANCE=PASS');
record('Real Auth/Postgres/Storage employee and same-tenant manager browsers retrieve persisted private leave evidence',
  leaveEvidenceBrowserPassed,
  leaveEvidenceBrowserError);
const browserApprovedEvidence = evidenceRequestId ? tableRow('leave_requests', evidenceRequestId) : null;
const browserUiLeave = uiLeaveAcceptance?.id ? tableRow('leave_requests', uiLeaveAcceptance.id) : null;
const approvedEvidenceBalance = queryAdmin(`SELECT to_jsonb(b) FROM public.employee_leave_balances b
  WHERE tenant_id='${ids.tenantA}'::uuid AND employee_id='55555555-5555-4555-8555-555555555555'
    AND leave_type_id='${ids.leaveTypeEvidence}'::uuid AND balance_year=2026`);
record('Real manager leave UI approves the persisted employee request and updates its ledger once',
  leaveEvidenceBrowserPassed
  && browserApprovedEvidence?.status === 'approved'
  && Number(approvedEvidenceBalance.pending_days) === 0
  && Number(approvedEvidenceBalance.used_days) === 2
  && auditCount(evidenceRequestId, 'leave.request.approved') === 1,
  JSON.stringify({ status: browserApprovedEvidence?.status, balance: approvedEvidenceBalance }));
const employeeHistoryAfterUiLeave = queryAs(employeeA,
  `SELECT public.hris_get_my_dashboard_data('${ids.tenantA}'::uuid)`);
const foreignHistoryAfterUiLeave = queryAs(employeeB,
  `SELECT public.hris_get_my_dashboard_data('${ids.tenantB}'::uuid)`);
const employeeUiLeaveHistoryRow = employeeHistoryAfterUiLeave.requests.find(row => row.id === uiLeaveAcceptance?.id);
record('Real employee UI submission persists its own proof-backed leave row, balance and tenant-private history',
  Boolean(uiLeaveAcceptance?.id && uiLeaveAcceptance?.path)
  && browserUiLeave?.status === 'approved'
  && browserUiLeave?.tenant_id === ids.tenantA
  && browserUiLeave?.employee_id === '55555555-5555-4555-8555-555555555555'
  && browserUiLeave?.leave_type_id === ids.leaveTypeEvidence
  && browserUiLeave?.from_date === '2026-10-20'
  && browserUiLeave?.attachment_url === uiLeaveAcceptance.path
  && browserUiLeave?.reason === 'Real employee UI leave evidence request'
  && Number(browserUiLeave?.requested_days) === 1
  && employeeUiLeaveHistoryRow?.status === 'approved'
  && employeeUiLeaveHistoryRow?.attachment_url === uiLeaveAcceptance.path
  && !JSON.stringify(foreignHistoryAfterUiLeave.requests).includes(uiLeaveAcceptance?.path || 'missing-ui-evidence-path')
  && Number(approvedEvidenceBalance.pending_days) === 0
  && Number(approvedEvidenceBalance.used_days) === 2
  && auditCount(uiLeaveAcceptance?.id, 'leave.request.approved') === 1,
  JSON.stringify({ requestId: uiLeaveAcceptance?.id, persisted: Boolean(browserUiLeave), ownerHistory: Boolean(employeeUiLeaveHistoryRow), foreignPathExposed: JSON.stringify(foreignHistoryAfterUiLeave.requests).includes(uiLeaveAcceptance?.path || 'missing-ui-evidence-path') }));
const browserRejectedLeave = leaveRejectionRequestId ? tableRow('leave_requests', leaveRejectionRequestId) : null;
const postBrowserAnnualBalance = balance(ids.leaveTypeA, 2026);
const postBrowserEmployeeHistory = queryAs(employeeA,
  `SELECT public.hris_get_my_dashboard_data('${ids.tenantA}'::uuid)`);
const employeeRejectedLeave = postBrowserEmployeeHistory.requests.find(row => row.id === leaveRejectionRequestId);
record('Real manager UI rejection persists its note, releases pending balance, and refreshes employee history',
  browserRejectedLeave?.status === 'rejected'
  && browserRejectedLeave?.resolution_note === leaveRejectionNote
  && Number(postBrowserAnnualBalance.pending_days) === 5
  && Number(postBrowserAnnualBalance.used_days) === 0
  && auditCount(leaveRejectionRequestId, 'leave.request.rejected') === 1
  && employeeRejectedLeave?.status === 'rejected'
  && employeeRejectedLeave?.resolution_note === leaveRejectionNote,
  JSON.stringify({ managerRow: browserRejectedLeave, balance: postBrowserAnnualBalance,
    employeeRow: employeeRejectedLeave }));
record('Ordinary employees can read their own attendance and leave summary without admin or membership roles',
  employeeSummaryA.attendance.records.length === 1
  && employeeSummaryA.attendance.records[0].id === ids.attendanceRecord
  && employeeSummaryA.balances.length === 3
  && Number(employeeSummaryA.balances.find(row => row.leave_type_id === ids.leaveTypeA).available_days) === 15
  && employeeSummaryA.requests.length === 7
  && employeeSummaryB.attendance.records.length === 1
  && employeeSummaryB.attendance.records[0].id === 'bbbbbbbb-0000-4000-8000-000000000002'
  && employeeSummaryB.requests.length === 2,
  JSON.stringify({
    aAttendance: employeeSummaryA.attendance.records.map(row => row.id),
    aBalance: employeeSummaryA.balances.map(row => ({ leave_type_id: row.leave_type_id, available_days: row.available_days })),
    aRequests: employeeSummaryA.requests.length,
    bAttendance: employeeSummaryB.attendance.records.map(row => row.id),
    bRequests: employeeSummaryB.requests.length,
  }));

record('Employee dashboard profile and date belong to the linked tenant-local employee',
  employeeSummaryA.dashboard_date === localCurrentDate
  && employeeSummaryA.employee.full_name === 'Synthetic Employee A'
  && employeeSummaryA.employee.employee_number === 'QA-A-001'
  && employeeSummaryA.employee.department_name === 'QA A department'
  && employeeSummaryA.employee.designation_title === 'QA A designation'
  && employeeSummaryB.dashboard_date === localCurrentDate
  && employeeSummaryB.employee.full_name === 'Synthetic Employee B'
  && employeeSummaryB.employee.employee_number === 'QA-B-001'
  && employeeSummaryB.employee.department_name === 'QA B department'
  && employeeSummaryB.employee.designation_title === 'QA B designation',
  JSON.stringify({ employeeA: employeeSummaryA.employee, employeeB: employeeSummaryB.employee,
    dateA: employeeSummaryA.dashboard_date, dateB: employeeSummaryB.dashboard_date }));

const employeeAttendanceMonthA = await employeeA.client.rpc('hris_get_my_attendance_period', {
  p_tenant_id: ids.tenantA, p_month_start: currentAttendanceMonth,
});
const employeeAttendanceMonthB = await employeeB.client.rpc('hris_get_my_attendance_period', {
  p_tenant_id: ids.tenantB, p_month_start: currentAttendanceMonth,
});
const employeeAttendancePreviousMonth = await employeeA.client.rpc('hris_get_my_attendance_period', {
  p_tenant_id: ids.tenantA, p_month_start: previousAttendanceMonthStart,
});
record('Employee attendance period returns persisted rows for the selected month and tenant only',
  !employeeAttendanceMonthA.error && employeeAttendanceMonthA.data?.tenant_id === ids.tenantA
    && employeeAttendanceMonthA.data.month_start === currentAttendanceMonth
    && employeeAttendanceMonthA.data.records.some(row => row.id === ids.attendanceRecord)
    && employeeAttendanceMonthA.data.records.every(row => String(row.attendance_date).startsWith(currentAttendanceMonth.slice(0, 7)))
    && !employeeAttendanceMonthB.error && employeeAttendanceMonthB.data?.tenant_id === ids.tenantB
    && employeeAttendanceMonthB.data.records.length === 1
    && employeeAttendanceMonthB.data.records[0].id === 'bbbbbbbb-0000-4000-8000-000000000002'
    && !employeeAttendancePreviousMonth.error && employeeAttendancePreviousMonth.data.records.length === 1
    && employeeAttendancePreviousMonth.data.records[0].id === 'bbbbbbbb-0000-4000-8000-000000000006'
    && Number(employeeAttendancePreviousMonth.data.records[0].work_hours) === 8,
  JSON.stringify({ a: employeeAttendanceMonthA.data?.records?.map(row => row.id),
    b: employeeAttendanceMonthB.data?.records?.map(row => row.id),
    previous: employeeAttendancePreviousMonth.data?.records?.map(row => ({ id: row.id, work_hours: row.work_hours })) }));

const attendancePeriodCrossTenant = await employeeB.client.rpc('hris_get_my_attendance_period', {
  p_tenant_id: ids.tenantA, p_month_start: currentAttendanceMonth,
});
const attendancePeriodNoPermission = await noPermission.client.rpc('hris_get_my_attendance_period', {
  p_tenant_id: ids.tenantA, p_month_start: currentAttendanceMonth,
});
const attendancePeriodGlobalOnly = await globalOnly.client.rpc('hris_get_my_attendance_period', {
  p_tenant_id: ids.tenantA, p_month_start: currentAttendanceMonth,
});
const attendancePeriodAnonymous = await createClient(services.API_URL, services.ANON_KEY, authOptions)
  .rpc('hris_get_my_attendance_period', { p_tenant_id: ids.tenantA, p_month_start: currentAttendanceMonth });
record('Attendance period rejects cross-tenant, unlinked, global-only, and anonymous callers',
  Boolean(attendancePeriodCrossTenant.error?.code === '42501')
    && Boolean(attendancePeriodNoPermission.error?.code === '42501')
    && Boolean(attendancePeriodGlobalOnly.error?.code === '42501')
    && Boolean(attendancePeriodAnonymous.error),
  JSON.stringify({ cross: attendancePeriodCrossTenant.error?.code,
    unlinked: attendancePeriodNoPermission.error?.code, globalOnly: attendancePeriodGlobalOnly.error?.code,
    anonymous: attendancePeriodAnonymous.error?.code }));

const attendancePeriodInvalidMonth = await employeeA.client.rpc('hris_get_my_attendance_period', {
  p_tenant_id: ids.tenantA, p_month_start: `${currentAttendanceMonth.slice(0, 7)}-02`,
});
const attendancePeriodFutureMonth = await employeeA.client.rpc('hris_get_my_attendance_period', {
  p_tenant_id: ids.tenantA, p_month_start: nextAttendanceMonthStart,
});
record('Attendance period rejects non-month-start and future month ranges',
  Boolean(attendancePeriodInvalidMonth.error?.code === '22023')
    && Boolean(attendancePeriodFutureMonth.error?.code === '22023'),
  JSON.stringify({ invalid: attendancePeriodInvalidMonth.error?.code,
    future: attendancePeriodFutureMonth.error?.code }));

const attendancePeriodAcl = queryAdmin(`SELECT jsonb_build_object(
  'anon_execute',has_function_privilege('anon','public.hris_get_my_attendance_period(uuid,date)','EXECUTE'),
  'authenticated_execute',has_function_privilege('authenticated','public.hris_get_my_attendance_period(uuid,date)','EXECUTE'))`);
record('Attendance period RPC is executable by authenticated users and not anonymous users',
  attendancePeriodAcl.anon_execute === false && attendancePeriodAcl.authenticated_execute === true,
  JSON.stringify(attendancePeriodAcl));

const clockOutBeforeCheckIn = await employeeClock.client.rpc('hris_employee_record_attendance_event', {
  p_tenant_id: ids.tenantA, p_event: 'check_out',
});
const clockRowsBefore = queryAdmin(`SELECT jsonb_build_object('count',count(*))
  FROM public.attendance_records WHERE employee_id='${ids.clockEmployee}'::uuid`);
record('Employee web clock-out before clock-in is denied without creating an attendance row',
  Boolean(clockOutBeforeCheckIn.error) && clockRowsBefore.count === 0);

const crossTenantClock = await employeeClock.client.rpc('hris_employee_record_attendance_event', {
  p_tenant_id: ids.tenantB, p_event: 'check_in',
});
const crossTenantClockRows = queryAdmin(`SELECT jsonb_build_object('count',count(*))
  FROM public.attendance_records WHERE employee_id='${ids.clockEmployee}'::uuid`);
record('Linked employee cannot create a web punch in another tenant',
  Boolean(crossTenantClock.error) && crossTenantClockRows.count === 0);

const unsupportedClockEvent = await employeeClock.client.rpc('hris_employee_record_attendance_event', {
  p_tenant_id: ids.tenantA, p_event: 'toggle',
});
record('Employee web punch rejects unsupported event names without creating a row',
  Boolean(unsupportedClockEvent.error)
  && queryAdmin(`SELECT jsonb_build_object('count',count(*)) FROM public.attendance_records
    WHERE employee_id='${ids.clockEmployee}'::uuid`).count === 0);

const clockInResult = await employeeClock.client.rpc('hris_employee_record_attendance_event', {
  p_tenant_id: ids.tenantA, p_event: 'check_in',
});
const clockInRecordId = clockInResult.data?.id;
const clockInRecord = clockInRecordId ? tableRow('attendance_records', clockInRecordId) : null;
record('Active linked employee clocks in using tenant-local date and safe attendance defaults with one audit event',
  !clockInResult.error && clockInRecord?.tenant_id === ids.tenantA
  && clockInRecord.employee_id === ids.clockEmployee
  && clockInRecord.attendance_date === localCurrentDate
  && Boolean(clockInRecord.check_in) && clockInRecord.check_out === null
  && clockInRecord.work_mode === 'office' && clockInRecord.status === 'present'
  && clockInRecord.source === 'employee'
  && auditCount(clockInRecordId, 'attendance.web_check_in') === 1);

const originalClockIn = clockInRecord?.check_in;
const duplicateClockIn = await employeeClock.client.rpc('hris_employee_record_attendance_event', {
  p_tenant_id: ids.tenantA, p_event: 'check_in',
});
const afterDuplicateClockIn = clockInRecordId ? tableRow('attendance_records', clockInRecordId) : null;
record('Duplicate employee clock-in is rejected without overwriting time or duplicating audit',
  Boolean(duplicateClockIn.error) && afterDuplicateClockIn?.check_in === originalClockIn
  && auditCount(clockInRecordId, 'attendance.web_check_in') === 1);

const clockOutResult = await employeeClock.client.rpc('hris_employee_record_attendance_event', {
  p_tenant_id: ids.tenantA, p_event: 'check_out',
});
const afterClockOut = clockInRecordId ? tableRow('attendance_records', clockInRecordId) : null;
record('Employee clocks out once and retains the original check-in with an audit event',
  !clockOutResult.error && afterClockOut?.check_in === originalClockIn
  && Boolean(afterClockOut?.check_out)
  && new Date(afterClockOut.check_out).getTime() >= new Date(originalClockIn).getTime()
  && auditCount(clockInRecordId, 'attendance.web_check_out') === 1);

const duplicateClockOut = await employeeClock.client.rpc('hris_employee_record_attendance_event', {
  p_tenant_id: ids.tenantA, p_event: 'check_out',
});
const afterDuplicateClockOut = clockInRecordId ? tableRow('attendance_records', clockInRecordId) : null;
record('Duplicate employee clock-out is rejected without overwriting time or duplicating audit',
  Boolean(duplicateClockOut.error) && afterDuplicateClockOut?.check_out === afterClockOut?.check_out
  && auditCount(clockInRecordId, 'attendance.web_check_out') === 1);

const globalOnlyClock = await globalOnly.client.rpc('hris_employee_record_attendance_event', {
  p_tenant_id: ids.tenantA, p_event: 'check_in',
});
record('Global role without an active linked employee cannot use employee web clock-in/out',
  Boolean(globalOnlyClock.error)
  && queryAdmin(`SELECT jsonb_build_object('count',count(*)) FROM public.attendance_records
    WHERE employee_id='${ids.clockEmployee}'::uuid`).count === 1);

const attendanceCorrectionSubmission = await employeeA.client.rpc('hris_employee_submit_attendance_correction', {
  p_tenant_id: ids.tenantA,
  p_payload: {
    attendance_date: localCurrentDate, check_in_time: '09:15', check_out_time: null,
    work_mode: null, reason: 'Synthetic employee attendance correction',
  },
});
if (attendanceCorrectionSubmission.error) throw attendanceCorrectionSubmission.error;
const submittedCorrectionId = attendanceCorrectionSubmission.data;
const submittedCorrectionRow = tableRow('attendance_corrections', submittedCorrectionId);
const correctionSummaryA = queryAs(employeeA,
  `SELECT public.hris_get_my_dashboard_data('${ids.tenantA}'::uuid)`);
const correctionSummaryB = queryAs(employeeB,
  `SELECT public.hris_get_my_dashboard_data('${ids.tenantB}'::uuid)`);
record('Linked employee submits a tenant-bound correction with organization-local time and audit',
  submittedCorrectionRow.tenant_id === ids.tenantA
  && submittedCorrectionRow.employee_id === '55555555-5555-4555-8555-555555555555'
  && submittedCorrectionRow.requested_by === employeeA.userId
  && submittedCorrectionRow.attendance_date === localCurrentDate
  && Date.parse(submittedCorrectionRow.requested_check_in) === Date.parse(`${localCurrentDate}T03:15:00Z`)
  && submittedCorrectionRow.status === 'pending'
  && auditCount(submittedCorrectionId, 'attendance.correction.submitted') === 1);
record('Personal dashboard lists only the linked employee’s attendance corrections',
  correctionSummaryA.attendance.corrections.some(row => row.id === submittedCorrectionId)
  && correctionSummaryB.attendance.corrections.every(row => row.employee_id !== '55555555-5555-4555-8555-555555555555')
  && correctionSummaryA.attendance.corrections.every(row => row.employee_id === undefined || row.employee_id === '55555555-5555-4555-8555-555555555555'));

const emptyAttendanceCorrection = await employeeA.client.rpc('hris_employee_submit_attendance_correction', {
  p_tenant_id: ids.tenantA,
  p_payload: { attendance_date: localCurrentDate, check_in_time: null, check_out_time: null,
    work_mode: null, reason: 'Missing correction values' },
});
const crossTenantAttendanceCorrection = await employeeA.client.rpc('hris_employee_submit_attendance_correction', {
  p_tenant_id: ids.tenantB,
  p_payload: { attendance_date: localCurrentDate, check_in_time: '09:15', reason: 'Cross tenant attempt' },
});
record('Employee correction submission rejects empty changes and a different tenant',
  Boolean(emptyAttendanceCorrection.error) && Boolean(crossTenantAttendanceCorrection.error)
  && tableRow('attendance_corrections', submittedCorrectionId).status === 'pending');

const employeeTenantRows = queryAs(employeeA, `SELECT jsonb_build_object(
  'attendance_tenants',coalesce((SELECT jsonb_agg(DISTINCT tenant_id::text) FROM public.attendance_records),'[]'::jsonb),
  'balance_tenants',coalesce((SELECT jsonb_agg(DISTINCT tenant_id::text) FROM public.employee_leave_balances),'[]'::jsonb),
  'request_tenants',coalesce((SELECT jsonb_agg(DISTINCT tenant_id::text) FROM public.leave_requests),'[]'::jsonb))`);
const employeeCrossTenantSummary = attemptAs(employeeA,
  `SELECT public.hris_get_my_dashboard_data('${ids.tenantB}'::uuid)`);
record('Employee self-service exposes only its linked tenant and denies other tenant IDs',
  employeeTenantRows.attendance_tenants.length === 1
  && employeeTenantRows.attendance_tenants[0] === ids.tenantA
  && employeeTenantRows.balance_tenants.length === 1
  && employeeTenantRows.balance_tenants[0] === ids.tenantA
  && employeeTenantRows.request_tenants.length === 1
  && employeeTenantRows.request_tenants[0] === ids.tenantA
  && !employeeCrossTenantSummary.ok,
  JSON.stringify({ tenantRows: employeeTenantRows, crossTenantCallDenied: !employeeCrossTenantSummary.ok }));

const timesheetContextA = queryAs(employeeA,
  `SELECT public.hris_get_my_timesheet_context('${ids.tenantA}'::uuid)`);
const timesheetContextB = queryAs(employeeB,
  `SELECT public.hris_get_my_timesheet_context('${ids.tenantB}'::uuid)`);
const timesheetDirectTableReads = ['timesheets', 'timesheet_entries', 'timesheet_project_reviews',
  'timesheet_project_review_events'].map(table => attemptAs(employeeA,
  `SELECT count(*) FROM public.${table}`));
record('Timesheet context returns each linked employee’s own tenant activities and rows while direct table reads are denied',
  timesheetContextA.employee_id === '55555555-5555-4555-8555-555555555555'
    && timesheetContextA.activities.length === 1
    && timesheetContextA.activities[0].id === '88888888-8888-4888-8888-888888888901'
    && timesheetContextA.timesheets.length === 1
    && timesheetContextA.timesheets[0].id === '77777777-7777-4777-8777-777777777701'
    && timesheetContextB.employee_id === '66666666-6666-4666-8666-666666666666'
    && timesheetContextB.activities.length === 1
    && timesheetContextB.activities[0].id === '88888888-8888-4888-8888-888888888902'
    && timesheetContextB.timesheets.length === 1
    && timesheetContextB.timesheets[0].id === '77777777-7777-4777-8777-777777777702'
    && timesheetDirectTableReads.every(result => !result.ok));

const timesheetContextCrossTenant = attemptAs(employeeA,
  `SELECT public.hris_get_my_timesheet_context('${ids.tenantB}'::uuid)`);
const timesheetContextGlobalOnly = attemptAs(globalOnly,
  `SELECT public.hris_get_my_timesheet_context('${ids.tenantA}'::uuid)`);
record('Timesheet context denies cross-tenant IDs and global roles without an active employee link',
  !timesheetContextCrossTenant.ok && !timesheetContextGlobalOnly.ok);

const newTimesheetEntries = [{ activity_id: '88888888-8888-4888-8888-888888888901',
  work_date: '2026-10-15', hours: 3.5, note: 'Synthetic local acceptance entry' }];
const savedTimesheet = saveTimesheet(employeeA, ids.tenantA, null, 'weekly',
  '2026-10-12', '2026-10-18', newTimesheetEntries);
const savedTimesheetState = queryAdmin(`SELECT jsonb_build_object(
  'status',(SELECT status FROM public.timesheets WHERE id='${savedTimesheet.id}'::uuid),
  'entries',(SELECT count(*) FROM public.timesheet_entries WHERE timesheet_id='${savedTimesheet.id}'::uuid))`);
record('Employee saves a tenant-bound draft with one atomic audit event',
  Boolean(savedTimesheet.id)
    && savedTimesheetState.status === 'draft'
    && savedTimesheetState.entries === 1
    && auditCount(savedTimesheet.id, 'timesheet.saved') === 1);

const submittedTimesheet = submitTimesheet(employeeA, ids.tenantA, savedTimesheet.id);
const submittedTimesheetState = queryAdmin(`SELECT jsonb_build_object(
  'status',(SELECT status FROM public.timesheets WHERE id='${savedTimesheet.id}'::uuid),
  'submitted_at',(SELECT submitted_at FROM public.timesheets WHERE id='${savedTimesheet.id}'::uuid))`);
record('Employee submits the saved timesheet and records the submission once',
  submittedTimesheet.id === savedTimesheet.id
    && submittedTimesheetState.status === 'submitted'
    && Boolean(submittedTimesheetState.submitted_at)
    && auditCount(savedTimesheet.id, 'timesheet.submitted') === 1);

const submittedEdit = attemptAs(employeeA, `SELECT public.hris_save_my_timesheet(
  '${ids.tenantA}'::uuid,'${savedTimesheet.id}'::uuid,'weekly','2026-10-12','2026-10-18',
  '${JSON.stringify(newTimesheetEntries)}'::jsonb)`);
const foreignTimesheetEdit = attemptAs(employeeA, `SELECT public.hris_save_my_timesheet(
  '${ids.tenantA}'::uuid,'77777777-7777-4777-8777-777777777702'::uuid,'weekly',
  '2026-10-05','2026-10-11','${JSON.stringify(newTimesheetEntries)}'::jsonb)`);
const foreignTimesheetSubmit = attemptAs(employeeA,
  `SELECT public.hris_submit_my_timesheet('${ids.tenantA}'::uuid,'77777777-7777-4777-8777-777777777702'::uuid)`);
record('Submitted and another employee’s timesheets cannot be edited',
  !submittedEdit.ok && !foreignTimesheetEdit.ok && !foreignTimesheetSubmit.ok
    && queryAdmin(`SELECT jsonb_build_object('status',status) FROM public.timesheets WHERE id='${savedTimesheet.id}'::uuid`).status === 'submitted'
    && auditCount(savedTimesheet.id, 'timesheet.saved') === 1);

const emptyTimesheet = saveTimesheet(employeeA, ids.tenantA, null, 'daily',
  '2026-10-09', '2026-10-09', []);
const emptySubmit = attemptAs(employeeA,
  `SELECT public.hris_submit_my_timesheet('${ids.tenantA}'::uuid,'${emptyTimesheet.id}'::uuid)`);
record('Empty draft can be saved for later but cannot be submitted',
  Boolean(emptyTimesheet.id) && !emptySubmit.ok
    && queryAdmin(`SELECT jsonb_build_object('status',status) FROM public.timesheets WHERE id='${emptyTimesheet.id}'::uuid`).status === 'draft'
    && auditCount(emptyTimesheet.id, 'timesheet.saved') === 1
    && auditCount(emptyTimesheet.id, 'timesheet.submitted') === 0);

const badActivityEntries = [{ activity_id: '88888888-8888-4888-8888-888888888902',
  work_date: '2026-10-15', hours: 3, note: 'Cross tenant activity' }];
const inactiveActivityEntries = [{ activity_id: '88888888-8888-4888-8888-888888888903',
  work_date: '2026-10-15', hours: 3, note: 'Inactive activity' }];
const badDateEntries = [{ activity_id: '88888888-8888-4888-8888-888888888901',
  work_date: '2026-10-19', hours: 3, note: null }];
const tooManyHoursEntries = [
  { activity_id: '88888888-8888-4888-8888-888888888901', work_date: '2026-10-16', hours: 12 },
  { activity_id: '88888888-8888-4888-8888-888888888901', work_date: '2026-10-16', hours: 13 },
];
const badActivitySave = attemptAs(employeeA, `SELECT public.hris_save_my_timesheet(
  '${ids.tenantA}'::uuid,NULL,'weekly','2026-10-12','2026-10-18','${JSON.stringify(badActivityEntries)}'::jsonb)`);
const inactiveActivitySave = attemptAs(employeeA, `SELECT public.hris_save_my_timesheet(
  '${ids.tenantA}'::uuid,NULL,'weekly','2026-10-12','2026-10-18','${JSON.stringify(inactiveActivityEntries)}'::jsonb)`);
const badDateSave = attemptAs(employeeA, `SELECT public.hris_save_my_timesheet(
  '${ids.tenantA}'::uuid,NULL,'weekly','2026-10-12','2026-10-18','${JSON.stringify(badDateEntries)}'::jsonb)`);
const tooManyHoursSave = attemptAs(employeeA, `SELECT public.hris_save_my_timesheet(
  '${ids.tenantA}'::uuid,NULL,'weekly','2026-10-12','2026-10-18','${JSON.stringify(tooManyHoursEntries)}'::jsonb)`);
const timesheetWriteCounts = queryAdmin(`SELECT jsonb_build_object(
  'a',(SELECT count(*) FROM public.timesheets WHERE tenant_id='${ids.tenantA}'::uuid),
  'b',(SELECT count(*) FROM public.timesheets WHERE tenant_id='${ids.tenantB}'::uuid),
  'activity_audit',(SELECT count(*) FROM public.admin_audit_logs WHERE action='timesheet.saved'))`);
record('Cross-tenant or inactive activity, out-of-period date, and over-24-hour daily totals roll back completely',
  !badActivitySave.ok && !inactiveActivitySave.ok && !badDateSave.ok && !tooManyHoursSave.ok
    && timesheetWriteCounts.a === 3 && timesheetWriteCounts.b === 1
    && timesheetWriteCounts.activity_audit === 2);

const anonTimesheetContext = attemptAs(null,
  `SELECT public.hris_get_my_timesheet_context('${ids.tenantA}'::uuid)`, 'anon');
record('Anonymous users cannot execute any employee timesheet RPC',
  !anonTimesheetContext.ok
    && functionGrantMatrix['public.hris_get_my_timesheet_context(uuid)'].anon === false
    && functionGrantMatrix['public.hris_save_my_timesheet(uuid,uuid,text,date,date,jsonb)'].anon === false
    && functionGrantMatrix['public.hris_submit_my_timesheet(uuid,uuid)'].anon === false);

const travelIds = {
  requestA: '89898989-8989-4898-8898-989898989801',
  requestB: '89898989-8989-4898-8898-989898989802',
};
const myTravelA = await employeeA.client.rpc('hris_get_my_travel_context', { p_tenant_id: ids.tenantA });
const myTravelB = await employeeB.client.rpc('hris_get_my_travel_context', { p_tenant_id: ids.tenantB });
const myTravelCrossTenant = await employeeA.client.rpc('hris_get_my_travel_context', { p_tenant_id: ids.tenantB });
const travelNoPermission = await noPermission.client.rpc('hris_get_tenant_travel_requests', { p_tenant_id: ids.tenantA });
const travelGlobalOnly = await globalOnly.client.rpc('hris_get_tenant_travel_requests', { p_tenant_id: ids.tenantA });
const travelQueueA = await managerA.client.rpc('hris_get_tenant_travel_requests', { p_tenant_id: ids.tenantA });
const travelQueueB = await managerB.client.rpc('hris_get_tenant_travel_requests', { p_tenant_id: ids.tenantB });
const travelQueueViewer = await tenantViewer.client.rpc('hris_get_tenant_travel_requests', { p_tenant_id: ids.tenantB });
const travelQueueCrossTenant = await managerA.client.rpc('hris_get_tenant_travel_requests', { p_tenant_id: ids.tenantB });
const travelDirectRead = await employeeA.client.from('travel_requests').select('id,tenant_id');
record('Employee travel context and manager queues stay tenant-scoped; view-only is separate from manage',
  !myTravelA.error && myTravelA.data?.employee_id === '55555555-5555-4555-8555-555555555555'
    && myTravelA.data.requests.length === 1 && myTravelA.data.requests[0].id === travelIds.requestA
    && !myTravelB.error && myTravelB.data?.employee_id === '66666666-6666-4666-8666-666666666666'
    && myTravelB.data.requests.length === 1 && myTravelB.data.requests[0].id === travelIds.requestB
    && Boolean(myTravelCrossTenant.error?.code === '42501')
    && !travelQueueA.error && travelQueueA.data.length === 1 && travelQueueA.data[0].id === travelIds.requestA
    && !travelQueueB.error && travelQueueB.data.length === 1 && travelQueueB.data[0].id === travelIds.requestB
    && !travelQueueViewer.error && travelQueueViewer.data.length === 1
    && Boolean(travelQueueCrossTenant.error?.code === '42501')
    && Boolean(travelNoPermission.error?.code === '42501')
    && Boolean(travelGlobalOnly.error?.code === '42501')
    && !travelDirectRead.error && travelDirectRead.data.length === 0,
  JSON.stringify({ personalA: myTravelA.data?.requests?.map(row => row.id), personalB: myTravelB.data?.requests?.map(row => row.id),
    managerA: travelQueueA.data?.map(row => row.id), managerB: travelQueueB.data?.map(row => row.id),
    viewerBCount: travelQueueViewer.data?.length, crossTenantCode: travelQueueCrossTenant.error?.code || null,
    directReadCount: travelDirectRead.data?.length }));

const travelDraft = await employeeA.client.rpc('hris_save_my_travel_request', {
  p_tenant_id: ids.tenantA, p_id: null, p_destination: '  Synthetic QA site  ',
  p_from_date: '2026-12-02', p_to_date: '2026-12-04', p_purpose: '  Local travel workflow acceptance  ',
  p_estimated_cost: 450, p_estimated_currency: 'bdt',
});
const travelDraftRow = typeof travelDraft.data === 'string'
  ? queryAdmin(`SELECT to_jsonb(r) FROM public.travel_requests r WHERE r.id=${sqlLiteral(travelDraft.data)}::uuid`)
  : null;
const travelIncompleteDraft = await employeeA.client.rpc('hris_save_my_travel_request', {
  p_tenant_id: ids.tenantA, p_id: null, p_destination: null,
  p_from_date: null, p_to_date: null, p_purpose: null,
  p_estimated_cost: null, p_estimated_currency: null,
});
const travelBadDates = await employeeA.client.rpc('hris_save_my_travel_request', {
  p_tenant_id: ids.tenantA, p_id: null, p_destination: 'Invalid range',
  p_from_date: '2026-12-05', p_to_date: '2026-12-04', p_purpose: 'Invalid date order',
  p_estimated_cost: null, p_estimated_currency: null,
});
const travelBadCostPair = await employeeA.client.rpc('hris_save_my_travel_request', {
  p_tenant_id: ids.tenantA, p_id: null, p_destination: 'Missing currency',
  p_from_date: null, p_to_date: null, p_purpose: null, p_estimated_cost: 100, p_estimated_currency: null,
});
const crossTenantTravelSave = await employeeA.client.rpc('hris_save_my_travel_request', {
  p_tenant_id: ids.tenantB, p_id: null, p_destination: 'Wrong tenant',
  p_from_date: null, p_to_date: null, p_purpose: null, p_estimated_cost: null, p_estimated_currency: null,
});
const directTravelWrite = await employeeA.client.from('travel_requests').insert({
  tenant_id: ids.tenantA, employee_id: '55555555-5555-4555-8555-555555555555', status: 'draft',
});
const travelIncompleteSubmit = typeof travelIncompleteDraft.data === 'string'
  ? await employeeA.client.rpc('hris_submit_my_travel_request', { p_tenant_id: ids.tenantA, p_id: travelIncompleteDraft.data })
  : { error: new Error('No incomplete request was created.') };
const travelRowsAfterDrafts = queryAdmin(`SELECT jsonb_build_object('count',count(*)::integer) FROM public.travel_requests WHERE tenant_id='${ids.tenantA}'::uuid`);
record('Employee can persist a draft; malformed dates, mismatched optional cost, cross-tenant IDs, direct writes, and incomplete submission are denied',
  !travelDraft.error && travelDraftRow?.status === 'draft'
    && travelDraftRow?.destination === 'Synthetic QA site'
    && travelDraftRow?.purpose === 'Local travel workflow acceptance'
    && Number(travelDraftRow?.estimated_cost) === 450 && travelDraftRow?.estimated_currency === 'BDT'
    && !travelIncompleteDraft.error && typeof travelIncompleteDraft.data === 'string'
    && Boolean(travelBadDates.error?.code === '22023')
    && Boolean(travelBadCostPair.error?.code === '22023')
    && Boolean(crossTenantTravelSave.error?.code === '42501')
    && Boolean(directTravelWrite.error)
    && Boolean(travelIncompleteSubmit.error?.code === '22023')
    && travelRowsAfterDrafts.count === 3,
  JSON.stringify({ draft: travelDraftRow, draftError: travelDraft.error?.message || null,
    draftDetails: travelDraft.error?.details || null, incompleteDraftError: travelIncompleteDraft.error?.message || null,
    incompleteDraftId: travelIncompleteDraft.data || null, rows: travelRowsAfterDrafts.count,
    incompleteSubmitError: travelIncompleteSubmit.error?.message || null,
    badDate: travelBadDates.error?.code || null,
    badCost: travelBadCostPair.error?.code || null, crossTenant: crossTenantTravelSave.error?.code || null,
    directWrite: directTravelWrite.error?.code || null, incompleteSubmit: travelIncompleteSubmit.error?.code || null }));

const travelSubmitted = await employeeA.client.rpc('hris_submit_my_travel_request', { p_tenant_id: ids.tenantA, p_id: travelDraft.data });
const employeeCannotDecideTravel = await employeeA.client.rpc('hris_resolve_travel_request', {
  p_tenant_id: ids.tenantA, p_id: travelIds.requestA, p_decision: 'approved', p_note: null,
});
const viewerCannotDecideTravel = await tenantViewer.client.rpc('hris_resolve_travel_request', {
  p_tenant_id: ids.tenantB, p_id: travelIds.requestB, p_decision: 'approved', p_note: null,
});
const noPermissionCannotDecideTravel = await noPermission.client.rpc('hris_resolve_travel_request', {
  p_tenant_id: ids.tenantA, p_id: travelIds.requestA, p_decision: 'approved', p_note: null,
});
const crossTenantTravelDecision = await managerA.client.rpc('hris_resolve_travel_request', {
  p_tenant_id: ids.tenantA, p_id: travelIds.requestB, p_decision: 'approved', p_note: null,
});
const travelApproveViaManager = await managerB.client.rpc('hris_resolve_travel_request', {
  p_tenant_id: ids.tenantB, p_id: travelIds.requestB, p_decision: 'approved', p_note: 'Tenant B isolated approval',
});
const duplicateTravelDecision = await managerB.client.rpc('hris_resolve_travel_request', {
  p_tenant_id: ids.tenantB, p_id: travelIds.requestB, p_decision: 'rejected', p_note: null,
});
record('Travel submission is persisted once; employees, viewers, unprivileged and cross-tenant managers cannot decide; tenant manager decisions are audited and unique',
  !travelSubmitted.error && travelSubmitted.data === travelDraft.data
    && Boolean(employeeCannotDecideTravel.error?.code === '42501')
    && Boolean(viewerCannotDecideTravel.error?.code === '42501')
    && Boolean(noPermissionCannotDecideTravel.error?.code === '42501')
    && Boolean(crossTenantTravelDecision.error?.code === 'P0002')
    && !travelApproveViaManager.error && travelApproveViaManager.data?.status === 'approved'
    && Boolean(duplicateTravelDecision.error?.code === 'P0002')
    && queryAdmin(`SELECT jsonb_build_object('status',(SELECT status FROM public.travel_requests WHERE id=${sqlLiteral(travelDraft.data)}::uuid),'history',(SELECT count(*)::integer FROM public.travel_status_history WHERE travel_request_id=${sqlLiteral(travelDraft.data)}::uuid),'audit',(SELECT count(*)::integer FROM public.admin_audit_logs WHERE target_id=${sqlLiteral(travelDraft.data)} AND action='travel.submitted'))`).status === 'submitted'
    && queryAdmin(`SELECT jsonb_build_object('status',(SELECT status FROM public.travel_requests WHERE id='${travelIds.requestB}'::uuid),'history',(SELECT count(*)::integer FROM public.travel_status_history WHERE travel_request_id='${travelIds.requestB}'::uuid),'decision',(SELECT new_status FROM public.travel_status_history WHERE travel_request_id='${travelIds.requestB}'::uuid ORDER BY created_at DESC LIMIT 1))`).status === 'approved',
  JSON.stringify({ submit: travelSubmitted.error?.code || travelSubmitted.data,
    submitError: travelSubmitted.error?.message || null, submitDetails: travelSubmitted.error?.details || null,
    employee: employeeCannotDecideTravel.error?.code,
    viewer: viewerCannotDecideTravel.error?.code, noPermission: noPermissionCannotDecideTravel.error?.code,
    crossTenant: crossTenantTravelDecision.error?.code, managerDecision: travelApproveViaManager.data,
    duplicate: duplicateTravelDecision.error?.code }));

const rejectSeedTravel = await managerA.client.rpc('hris_resolve_travel_request', {
  p_tenant_id: ids.tenantA, p_id: travelIds.requestA, p_decision: 'rejected', p_note: 'Please add the visit objective.',
});
const rejectedTravelContext = await employeeA.client.rpc('hris_get_my_travel_context', { p_tenant_id: ids.tenantA });
const rejectedTravel = rejectedTravelContext.data?.requests?.find(row => row.id === travelIds.requestA);
const revisedTravel = await employeeA.client.rpc('hris_save_my_travel_request', {
  p_tenant_id: ids.tenantA, p_id: travelIds.requestA, p_destination: 'QA A client site',
  p_from_date: '2026-11-02', p_to_date: '2026-11-04', p_purpose: 'Client delivery review',
  p_estimated_cost: null, p_estimated_currency: null,
});
const resubmittedTravel = await employeeA.client.rpc('hris_submit_my_travel_request', { p_tenant_id: ids.tenantA, p_id: travelIds.requestA });
const finalTravelApproval = await managerA.client.rpc('hris_resolve_travel_request', {
  p_tenant_id: ids.tenantA, p_id: travelIds.requestA, p_decision: 'approved', p_note: null,
});
const finalTravelEmployeeContext = await employeeA.client.rpc('hris_get_my_travel_context', { p_tenant_id: ids.tenantA });
record('Returned travel requests retain reviewer notes through employee revision and can be resubmitted and resolved',
  !rejectSeedTravel.error && rejectedTravel?.status === 'rejected'
    && rejectedTravel.review_note === 'Please add the visit objective.'
    && rejectedTravel.history.some(row => row.new_status === 'rejected' && row.note === 'Please add the visit objective.')
    && !revisedTravel.error && revisedTravel.data === travelIds.requestA
    && !resubmittedTravel.error && resubmittedTravel.data === travelIds.requestA
    && !finalTravelApproval.error && finalTravelApproval.data?.status === 'approved'
    && finalTravelEmployeeContext.data?.requests?.find(row => row.id === travelIds.requestA)?.status === 'approved'
    && auditCount(travelIds.requestA, 'travel.rejected') === 1
    && auditCount(travelIds.requestA, 'travel.approved') === 1,
  JSON.stringify({ rejection: rejectSeedTravel.error?.code || rejectSeedTravel.data,
    note: rejectedTravel?.review_note, revision: revisedTravel.error?.code || revisedTravel.data,
    resubmit: resubmittedTravel.error?.code || resubmittedTravel.data,
    finalApproval: finalTravelApproval.error?.code || finalTravelApproval.data }));

const anonTravelContext = attemptAs(null,
  `SELECT public.hris_get_my_travel_context('${ids.tenantA}'::uuid)`, 'anon');
record('Anonymous callers cannot execute employee or manager travel RPCs',
  !anonTravelContext.ok
    && functionGrantMatrix['public.hris_get_my_travel_context(uuid)'].anon === false
    && functionGrantMatrix['public.hris_save_my_travel_request(uuid,uuid,text,date,date,text,numeric,text)'].anon === false
    && functionGrantMatrix['public.hris_submit_my_travel_request(uuid,uuid)'].anon === false
    && functionGrantMatrix['public.hris_get_tenant_travel_requests(uuid)'].anon === false
    && functionGrantMatrix['public.hris_resolve_travel_request(uuid,uuid,text,text)'].anon === false);

let travelBrowserOutput = '';
let travelBrowserError = '';
try {
  travelBrowserOutput = execFileSync('node', [path.join(here, 'run-travel-browser.mjs')], {
    cwd: mainRoot,
    env: {
      ...process.env,
      HRIS_LOCAL_SUPABASE_URL: services.API_URL,
      HRIS_LOCAL_SUPABASE_ANON_KEY: services.ANON_KEY,
      HRIS_LOCAL_TEST_PASSWORD: password,
      HRIS_LOCAL_TRAVEL_EMPLOYEE_EMAIL: emails[5],
      HRIS_LOCAL_TRAVEL_MANAGER_EMAIL: emails[0],
      HRIS_LOCAL_TRAVEL_TENANT_ID: ids.tenantA,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
} catch (error) {
  travelBrowserError = String(error.stderr || error.message || 'local travel browser run failed').slice(-1800);
}
const travelBrowserId = travelBrowserOutput.match(/TRAVEL_ACCEPTANCE_ID=([0-9a-f-]{36})/i)?.[1];
const browserTravelPersistence = travelBrowserId ? queryAdmin(`SELECT jsonb_build_object(
  'tenant_id',tenant_id,'employee_id',employee_id,'destination',destination,'purpose',purpose,'status',status,
  'history_count',(SELECT count(*)::integer FROM public.travel_status_history h WHERE h.travel_request_id=r.id),
  'history',coalesce((SELECT jsonb_agg(new_status ORDER BY created_at) FROM public.travel_status_history h WHERE h.travel_request_id=r.id),'[]'::jsonb),
  'decision_audit',(SELECT count(*)::integer FROM public.admin_audit_logs WHERE target_id=r.id::text AND action IN ('travel.rejected','travel.approved')))
  FROM public.travel_requests r WHERE r.id=${sqlLiteral(travelBrowserId)}::uuid`) : null;
record('Real browser employee-to-manager-to-employee travel journey persists its final decision and history in isolated Postgres',
  travelBrowserOutput.includes('Local Auth-to-Postgres travel workflow persisted employee draft, submission, manager return, employee recovery, resubmission, approval, and history in EN/BN across mobile and desktop; failed history read recovered on retry.')
    && browserTravelPersistence?.tenant_id === ids.tenantA
    && browserTravelPersistence?.employee_id === '55555555-5555-4555-8555-555555555555'
    && browserTravelPersistence?.status === 'approved'
    && browserTravelPersistence?.history_count === 4
    && JSON.stringify(browserTravelPersistence?.history) === JSON.stringify(['submitted','rejected','submitted','approved'])
    && browserTravelPersistence?.decision_audit === 2,
  travelBrowserError || JSON.stringify(browserTravelPersistence));

const expenseIds = {
  categoryA: '89898989-8989-4898-8898-989898989811', inactiveCategoryA: '89898989-8989-4898-8898-989898989812',
  submittedA: '89898989-8989-4898-8898-989898989821', submittedB: '89898989-8989-4898-8898-989898989822',
  rejectedA: '89898989-8989-4898-8898-989898989823',
};
const expenseContextA = await employeeA.client.rpc('hris_get_my_expense_context', { p_tenant_id: ids.tenantA });
const expenseContextB = await employeeB.client.rpc('hris_get_my_expense_context', { p_tenant_id: ids.tenantB });
const expenseCrossContext = await employeeA.client.rpc('hris_get_my_expense_context', { p_tenant_id: ids.tenantB });
const expenseQueueA = await managerA.client.rpc('hris_get_tenant_expense_claims', { p_tenant_id: ids.tenantA });
const expenseQueueB = await managerB.client.rpc('hris_get_tenant_expense_claims', { p_tenant_id: ids.tenantB });
const expenseQueueViewer = await tenantViewer.client.rpc('hris_get_tenant_expense_claims', { p_tenant_id: ids.tenantB });
const expenseQueueCross = await managerA.client.rpc('hris_get_tenant_expense_claims', { p_tenant_id: ids.tenantB });
const expenseQueueNoPermission = await noPermission.client.rpc('hris_get_tenant_expense_claims', { p_tenant_id: ids.tenantA });
const expenseQueueGlobalOnly = await globalOnly.client.rpc('hris_get_tenant_expense_claims', { p_tenant_id: ids.tenantA });
const expenseQueueEmployee = await employeeA.client.rpc('hris_get_tenant_expense_claims', { p_tenant_id: ids.tenantA });
const expenseDirectEmployeeRead = await employeeA.client.from('expense_claims').select('id,tenant_id');
const expenseDirectManagerRead = await managerA.client.from('expense_claims').select('id,tenant_id');
const expenseDirectNoPermissionRead = await noPermission.client.from('expense_claims').select('id,tenant_id');
const expenseDirectGlobalOnlyRead = await globalOnly.client.from('expense_claims').select('id,tenant_id');
const expenseDirectCrossTenantRead = await managerA.client.from('expense_claims').select('id,tenant_id').eq('tenant_id', ids.tenantB);
record('Expense contexts and manager queues stay scoped to active tenant memberships',
  !expenseContextA.error && expenseContextA.data?.employee_id === '55555555-5555-4555-8555-555555555555'
    && expenseContextA.data.categories?.length === 1 && expenseContextA.data.claims?.length === 2
    && expenseContextA.data.claims.some(row => row.id === expenseIds.rejectedA)
    && !expenseContextB.error && expenseContextB.data?.claims?.length === 1
    && Boolean(expenseCrossContext.error?.code === '42501')
    && !expenseQueueA.error && expenseQueueA.data.length === 1 && expenseQueueA.data[0].id === expenseIds.submittedA
    && !expenseQueueB.error && expenseQueueB.data.length === 1 && expenseQueueB.data[0].id === expenseIds.submittedB
    && !expenseQueueViewer.error && expenseQueueViewer.data.length === 1
    && Boolean(expenseQueueCross.error?.code === '42501')
    && Boolean(expenseQueueNoPermission.error?.code === '42501')
    && Boolean(expenseQueueGlobalOnly.error?.code === '42501')
    && Boolean(expenseQueueEmployee.error?.code === '42501')
    && !expenseDirectEmployeeRead.error && expenseDirectEmployeeRead.data.length === 2
    && expenseDirectEmployeeRead.data.every(row => row.tenant_id === ids.tenantA)
    && !expenseDirectManagerRead.error && expenseDirectManagerRead.data.length >= 1
    && expenseDirectManagerRead.data.every(row => row.tenant_id === ids.tenantA)
    && !expenseDirectNoPermissionRead.error && expenseDirectNoPermissionRead.data.length === 0
    && !expenseDirectGlobalOnlyRead.error && expenseDirectGlobalOnlyRead.data.length === 0
    && !expenseDirectCrossTenantRead.error && expenseDirectCrossTenantRead.data.length === 0,
  JSON.stringify({ contextA: expenseContextA.data?.claims?.map(row => row.id), contextB: expenseContextB.data?.claims?.length,
    queueA: expenseQueueA.data?.map(row => row.id), queueB: expenseQueueB.data?.map(row => row.id),
    directEmployeeRows: expenseDirectEmployeeRead.data?.length, directManagerRows: expenseDirectManagerRead.data?.length,
    directNoPermission: expenseDirectNoPermissionRead.data?.length, directGlobalOnly: expenseDirectGlobalOnlyRead.data?.length,
    viewerQueue: expenseQueueViewer.data?.length, viewerQueueError: expenseQueueViewer.error?.code,
    crossTenant: expenseQueueCross.error?.code, globalOnly: expenseQueueGlobalOnly.error?.code }));

const partialExpenseDraft = await employeeA.client.rpc('hris_save_my_expense_draft', {
  p_tenant_id: ids.tenantA, p_id: null, p_description: '  Partial local expense draft  ',
  p_category_id: null, p_claim_date: null, p_amount: null, p_currency: null,
});
const partialExpenseRow = typeof partialExpenseDraft.data === 'string'
  ? queryAdmin(`SELECT to_jsonb(c) FROM public.expense_claims c WHERE c.id=${sqlLiteral(partialExpenseDraft.data)}::uuid`)
  : null;
const invalidExpenseCategory = await employeeA.client.rpc('hris_save_my_expense_draft', {
  p_tenant_id: ids.tenantA, p_id: null, p_description: 'Invalid inactive category',
  p_category_id: expenseIds.inactiveCategoryA, p_claim_date: localCurrentDate, p_amount: 1, p_currency: 'BDT',
});
const invalidExpenseCurrency = await employeeA.client.rpc('hris_save_my_expense_draft', {
  p_tenant_id: ids.tenantA, p_id: null, p_description: 'Invalid currency',
  p_category_id: expenseIds.categoryA, p_claim_date: localCurrentDate, p_amount: 1, p_currency: 'US',
});
const invalidExpenseAmount = await employeeA.client.rpc('hris_save_my_expense_draft', {
  p_tenant_id: ids.tenantA, p_id: null, p_description: 'Invalid amount',
  p_category_id: expenseIds.categoryA, p_claim_date: localCurrentDate, p_amount: 1.001, p_currency: 'BDT',
});
const crossTenantExpenseDraft = await employeeA.client.rpc('hris_save_my_expense_draft', {
  p_tenant_id: ids.tenantB, p_id: null, p_description: 'Cross tenant expense',
  p_category_id: null, p_claim_date: null, p_amount: null, p_currency: null,
});
const incompleteExpenseSubmit = typeof partialExpenseDraft.data === 'string'
  ? await employeeA.client.rpc('hris_submit_my_expense_claim', { p_tenant_id: ids.tenantA, p_id: partialExpenseDraft.data })
  : null;
const completeExpenseSave = typeof partialExpenseDraft.data === 'string'
  ? await employeeA.client.rpc('hris_save_my_expense_draft', {
    p_tenant_id: ids.tenantA, p_id: partialExpenseDraft.data, p_description: 'Local completed expense draft',
    p_category_id: expenseIds.categoryA, p_claim_date: localCurrentDate, p_amount: 2490.75, p_currency: 'bdt',
  })
  : null;
record('Expense drafts validate active categories, dates, amount, currency, and submit completeness',
  !partialExpenseDraft.error && partialExpenseRow?.status === 'draft'
    && partialExpenseRow?.description === 'Partial local expense draft'
    && Boolean(invalidExpenseCategory.error?.code === '22023')
    && Boolean(invalidExpenseCurrency.error?.code === '22023')
    && Boolean(invalidExpenseAmount.error?.code === '22023')
    && Boolean(crossTenantExpenseDraft.error?.code === '42501')
    && Boolean(incompleteExpenseSubmit?.error?.code === '22023')
    && !completeExpenseSave?.error && completeExpenseSave?.data === partialExpenseDraft.data,
  JSON.stringify({ partial: partialExpenseRow?.status, inactiveCategory: invalidExpenseCategory.error?.code,
    currency: invalidExpenseCurrency.error?.code, amount: invalidExpenseAmount.error?.code,
    crossTenant: crossTenantExpenseDraft.error?.code, incompleteSubmit: incompleteExpenseSubmit?.error?.code }));

const expenseDraftId = String(partialExpenseDraft.data);
const employeeDirectDecision = await employeeA.client.from('expense_claims').update({ status: 'approved' }).eq('id', expenseDraftId).select('id');
const managerDirectDecision = await managerA.client.from('expense_claims').update({ status: 'approved' }).eq('id', expenseIds.submittedA).select('id');
const expenseSubmit = await employeeA.client.rpc('hris_submit_my_expense_claim', { p_tenant_id: ids.tenantA, p_id: expenseDraftId });
const expenseDuplicateSubmit = await employeeA.client.rpc('hris_submit_my_expense_claim', { p_tenant_id: ids.tenantA, p_id: expenseDraftId });
const expenseSavedState = queryAdmin(`SELECT jsonb_build_object(
  'status',(SELECT status FROM public.expense_claims WHERE id=${sqlLiteral(expenseDraftId)}::uuid),
  'submitted_at',(SELECT submitted_at FROM public.expense_claims WHERE id=${sqlLiteral(expenseDraftId)}::uuid),
  'history',(SELECT count(*)::integer FROM public.expense_claim_status_history WHERE claim_id=${sqlLiteral(expenseDraftId)}::uuid))`);
record('Expense submission stores status history and ordinary employees or managers cannot approve directly',
  (Boolean(employeeDirectDecision.error) || employeeDirectDecision.data?.length === 0)
    && !managerDirectDecision.error && managerDirectDecision.data.length === 0
    && !expenseSubmit.error && expenseSubmit.data === expenseDraftId
    && Boolean(expenseDuplicateSubmit.error?.code === '42501')
    && expenseSavedState.status === 'submitted' && Boolean(expenseSavedState.submitted_at)
    && expenseSavedState.history === 1,
  JSON.stringify({ employeeRows: employeeDirectDecision.data?.length, managerRows: managerDirectDecision.data?.length,
    submit: expenseSubmit.error?.code || expenseSubmit.data, duplicate: expenseDuplicateSubmit.error?.code,
    saved: expenseSavedState }));

const reopenedExpense = await employeeA.client.rpc('hris_reopen_my_expense_claim', { p_tenant_id: ids.tenantA, p_id: expenseIds.rejectedA });
const reopenedExpenseEdit = await employeeA.client.rpc('hris_save_my_expense_draft', {
  p_tenant_id: ids.tenantA, p_id: expenseIds.rejectedA, p_description: 'Revised after reviewer feedback',
  p_category_id: expenseIds.categoryA, p_claim_date: localCurrentDate, p_amount: 700, p_currency: 'BDT',
});
const reopenedExpenseContext = await employeeA.client.rpc('hris_get_my_expense_context', { p_tenant_id: ids.tenantA });
const reopenedExpenseCard = reopenedExpenseContext.data?.claims?.find(row => row.id === expenseIds.rejectedA);
record('Returned expense claims reopen and revise while retaining reviewer notes',
  !reopenedExpense.error && reopenedExpense.data === expenseIds.rejectedA
    && !reopenedExpenseEdit.error && reopenedExpenseEdit.data === expenseIds.rejectedA
    && reopenedExpenseCard?.status === 'draft' && reopenedExpenseCard?.review_note === 'Please attach the receipt.',
  JSON.stringify({ status: reopenedExpenseCard?.status, note: reopenedExpenseCard?.review_note }));

const receiptDraft = await employeeA.client.rpc('hris_save_my_expense_draft', {
  p_tenant_id: ids.tenantA, p_id: null, p_description: 'Local receipt storage acceptance',
  p_category_id: expenseIds.categoryA, p_claim_date: localCurrentDate, p_amount: 85.5, p_currency: 'BDT',
});
const receiptClaimId = String(receiptDraft.data);
const receiptStoragePath = `${employeeA.userId}/${receiptClaimId}/${randomBytes(12).toString('hex')}.pdf`;
const receiptUpload = await employeeA.client.storage.from('expense-receipts').upload(
  receiptStoragePath, new Blob(['%PDF-1.4 local expense receipt'], { type: 'application/pdf' }),
  { contentType: 'application/pdf', upsert: false },
);
if (!receiptUpload.error) uploadedExpensePaths.push(receiptStoragePath);
const receiptMetadata = receiptUpload.error ? null : await employeeA.client.from('expense_claim_receipts').insert({
  tenant_id: ids.tenantA, claim_id: receiptClaimId, employee_id: '55555555-5555-4555-8555-555555555555',
  storage_path: receiptStoragePath, file_name: 'local-receipt.pdf', mime_type: 'application/pdf', file_size: 30,
});
const receiptReadOwn = await employeeA.client.from('expense_claim_receipts').select('id,tenant_id').eq('claim_id', receiptClaimId);
const receiptReadOther = await employeeB.client.from('expense_claim_receipts').select('id').eq('claim_id', receiptClaimId);
const receiptDownloadOwn = await employeeA.client.storage.from('expense-receipts').download(receiptStoragePath);
const receiptDownloadOther = await employeeB.client.storage.from('expense-receipts').download(receiptStoragePath);
const receiptCrossInsert = await employeeA.client.from('expense_claim_receipts').insert({
  tenant_id: ids.tenantB, claim_id: expenseIds.submittedB, employee_id: '66666666-6666-4666-8666-666666666666',
  storage_path: `${employeeA.userId}/${expenseIds.submittedB}/cross-tenant.pdf`, file_name: 'cross-tenant.pdf',
  mime_type: 'application/pdf', file_size: 25,
});
record('Receipt objects and metadata remain private to the owning employee and tenant draft',
  !receiptDraft.error && !receiptUpload.error && !receiptMetadata?.error
    && !receiptReadOwn.error && receiptReadOwn.data.length === 1 && receiptReadOwn.data[0].tenant_id === ids.tenantA
    && !receiptReadOther.error && receiptReadOther.data.length === 0
    && !receiptDownloadOwn.error && Boolean(receiptDownloadOwn.data)
    && Boolean(receiptDownloadOther.error) && Boolean(receiptCrossInsert?.error),
  JSON.stringify({ upload: receiptUpload.error?.message || 'ok', ownRows: receiptReadOwn.data?.length,
    otherRows: receiptReadOther.data?.length, ownDownload: receiptDownloadOwn.error?.message || 'ok',
    otherDownload: receiptDownloadOther.error?.statusCode || receiptDownloadOther.error?.message,
    crossTenantInsert: receiptCrossInsert?.error?.code }));

const anonExpenseContext = attemptAs(null,
  `SELECT public.hris_get_my_expense_context('${ids.tenantA}'::uuid)`, 'anon');
const anonExpenseSubmit = attemptAs(null,
  `SELECT public.hris_submit_my_expense_claim('${ids.tenantA}'::uuid,'${expenseDraftId}'::uuid)`, 'anon');
record('Anonymous callers cannot execute employee or manager expense RPCs',
  !anonExpenseContext.ok && !anonExpenseSubmit.ok
    && functionGrantMatrix['public.hris_get_my_expense_context(uuid)'].anon === false
    && functionGrantMatrix['public.hris_save_my_expense_draft(uuid,uuid,text,uuid,date,numeric,text)'].anon === false
    && functionGrantMatrix['public.hris_submit_my_expense_claim(uuid,uuid)'].anon === false
    && functionGrantMatrix['public.hris_reopen_my_expense_claim(uuid,uuid)'].anon === false
    && functionGrantMatrix['public.hris_get_tenant_expense_claims(uuid)'].anon === false);

const serviceRequestSubmit = await employeeA.client.rpc('hris_submit_my_service_request', {
  p_tenant_id: ids.tenantA, p_request_type: 'other', p_reason: 'Need an updated employment document for a bank application.',
});
const serviceRequestId = serviceRequestSubmit.data?.id;
const serviceRequestContext = await employeeA.client.rpc('hris_get_my_service_requests', { p_tenant_id: ids.tenantA });
const serviceRequestRow = serviceRequestContext.data?.requests?.find(row => row.id === serviceRequestId);
const serviceRequestWrongTenant = await employeeA.client.rpc('hris_submit_my_service_request', {
  p_tenant_id: ids.tenantB, p_request_type: 'other', p_reason: 'Must not create under another tenant.',
});
const serviceRequestUnknownType = await employeeA.client.rpc('hris_submit_my_service_request', {
  p_tenant_id: ids.tenantA, p_request_type: 'unlisted_type', p_reason: 'Must be rejected by the server.',
});
const serviceRequestEmptyReason = await employeeA.client.rpc('hris_submit_my_service_request', {
  p_tenant_id: ids.tenantA, p_request_type: 'other', p_reason: '   ',
});
const serviceRequestDirectInsert = await employeeA.client.from('service_requests').insert({
  tenant_id: ids.tenantA, employee_id: '55555555-5555-4555-8555-555555555555',
  request_type: 'other', reason: 'Direct writes must use the server-side employee RPC.',
});
const serviceRequestOtherTenantContext = await employeeB.client.rpc('hris_get_my_service_requests', { p_tenant_id: ids.tenantA });
const anonServiceRequestSubmit = attemptAs(null,
  `SELECT public.hris_submit_my_service_request('${ids.tenantA}'::uuid,'other','Anonymous request')`, 'anon');
record('Employee service requests bind the active employee and tenant, validate the fixed request types, and deny direct or anonymous writes',
  !serviceRequestSubmit.error && serviceRequestRow?.status === 'pending'
    && serviceRequestRow?.request_type === 'other'
    && serviceRequestRow?.reason === 'Need an updated employment document for a bank application.'
    && Boolean(serviceRequestWrongTenant.error?.code === '42501')
    && Boolean(serviceRequestUnknownType.error?.code === '22023')
    && Boolean(serviceRequestEmptyReason.error?.code === '22023')
    && Boolean(serviceRequestDirectInsert.error)
    && Boolean(serviceRequestOtherTenantContext.error?.code === '42501')
    && !anonServiceRequestSubmit.ok
    && functionGrantMatrix['public.hris_submit_my_service_request(uuid,text,text)'].anon === false,
  JSON.stringify({ submit: serviceRequestSubmit.error?.message || serviceRequestRow?.status,
    wrongTenant: serviceRequestWrongTenant.error?.code, invalidType: serviceRequestUnknownType.error?.code,
    emptyReason: serviceRequestEmptyReason.error?.code, directWrite: serviceRequestDirectInsert.error?.code,
    otherTenantContext: serviceRequestOtherTenantContext.error?.code }));

const managerServiceQueue = await managerA.client.rpc('hris_get_tenant_service_requests', { p_tenant_id: ids.tenantA });
const managerServiceRows = Array.isArray(managerServiceQueue.data) ? managerServiceQueue.data : [];
const managerVisibleRequest = managerServiceRows.find(row => row.id === serviceRequestId);
const viewerServiceQueue = await employeesViewer.client.rpc('hris_get_tenant_service_requests', { p_tenant_id: ids.tenantA });
const workflowReviewerServiceQueue = await managerA2.client.rpc('hris_get_tenant_service_requests', { p_tenant_id: ids.tenantA });
const noMembershipServiceQueue = await globalOnly.client.rpc('hris_get_tenant_service_requests', { p_tenant_id: ids.tenantA });
const wrongTenantManagerServiceQueue = await managerB.client.rpc('hris_get_tenant_service_requests', { p_tenant_id: ids.tenantA });
const wrongTenantRequestServiceQueue = await managerA.client.rpc('hris_get_tenant_service_requests', { p_tenant_id: ids.tenantB });
const employeeDirectServiceHistory = await employeeA.client.from('service_request_status_history')
  .select('id').eq('tenant_id', ids.tenantA).limit(1);
const managerDirectServiceQueue = await managerA.client.from('service_requests')
  .select('id,status').eq('tenant_id', ids.tenantA);
record('Only an active tenant employees.manage membership can review the tenant service queue and history stays RPC-private',
  !managerServiceQueue.error && managerVisibleRequest?.employee_name === 'Synthetic Employee A'
    && managerVisibleRequest?.status === 'pending'
    && Boolean(viewerServiceQueue.error?.code === '42501')
    && Boolean(workflowReviewerServiceQueue.error?.code === '42501')
    && Boolean(noMembershipServiceQueue.error?.code === '42501')
    && Boolean(wrongTenantManagerServiceQueue.error?.code === '42501')
    && Boolean(wrongTenantRequestServiceQueue.error?.code === '42501')
    && Boolean(employeeDirectServiceHistory.error)
    && !managerDirectServiceQueue.error
    && managerDirectServiceQueue.data.some(row => row.id === serviceRequestId),
  JSON.stringify({ viewer: viewerServiceQueue.error?.code, reviewer: workflowReviewerServiceQueue.error?.code,
    globalOnly: noMembershipServiceQueue.error?.code, tenantB: wrongTenantManagerServiceQueue.error?.code,
    managerOtherTenant: wrongTenantRequestServiceQueue.error?.code,
    directHistory: employeeDirectServiceHistory.error?.code }));

const managerStartReview = await managerA.client.rpc('hris_resolve_tenant_service_request', {
  p_tenant_id: ids.tenantA, p_request_id: serviceRequestId,
  p_expected_status: 'pending', p_next_status: 'in_progress', p_note: null,
});
const duplicateStartReview = await managerA.client.rpc('hris_resolve_tenant_service_request', {
  p_tenant_id: ids.tenantA, p_request_id: serviceRequestId,
  p_expected_status: 'pending', p_next_status: 'in_progress', p_note: null,
});
const completeBeforeReview = await managerA.client.rpc('hris_resolve_tenant_service_request', {
  p_tenant_id: ids.tenantA, p_request_id: serviceRequestId,
  p_expected_status: 'pending', p_next_status: 'completed', p_note: 'Must first enter in progress.',
});
const completeWithoutOutcome = await managerA.client.rpc('hris_resolve_tenant_service_request', {
  p_tenant_id: ids.tenantA, p_request_id: serviceRequestId,
  p_expected_status: 'in_progress', p_next_status: 'completed', p_note: '   ',
});
const serviceRejectWithoutReason = await managerA.client.rpc('hris_resolve_tenant_service_request', {
  p_tenant_id: ids.tenantA, p_request_id: serviceRequestId,
  p_expected_status: 'in_progress', p_next_status: 'rejected', p_note: '   ',
});
const employeeUnauthorizedDecision = await employeeA.client.rpc('hris_resolve_tenant_service_request', {
  p_tenant_id: ids.tenantA, p_request_id: serviceRequestId,
  p_expected_status: 'in_progress', p_next_status: 'completed', p_note: 'Not allowed.',
});
const managerCompletedRequest = await managerA.client.rpc('hris_resolve_tenant_service_request', {
  p_tenant_id: ids.tenantA, p_request_id: serviceRequestId,
  p_expected_status: 'in_progress', p_next_status: 'completed', p_note: 'Employment certificate prepared for the employee.',
});
const duplicateCompletedDecision = await managerA.client.rpc('hris_resolve_tenant_service_request', {
  p_tenant_id: ids.tenantA, p_request_id: serviceRequestId,
  p_expected_status: 'in_progress', p_next_status: 'completed', p_note: 'Duplicate completion must be denied.',
});
const resolvedEmployeeHistory = await employeeA.client.rpc('hris_get_my_service_requests', { p_tenant_id: ids.tenantA });
const resolvedEmployeeHistoryRow = resolvedEmployeeHistory.data?.requests?.find(row => row.id === serviceRequestId);
const serviceStatusAudit = queryAdmin(`SELECT jsonb_build_object(
  'statuses',(SELECT coalesce(jsonb_agg(new_status ORDER BY created_at,id),'[]'::jsonb)
    FROM public.service_request_status_history WHERE tenant_id='${ids.tenantA}'::uuid AND service_request_id='${serviceRequestId}'::uuid),
  'audit_count',(SELECT count(*)::integer FROM public.admin_audit_logs WHERE target_type='service_request' AND target_id='${serviceRequestId}'))`);
const directServiceRequestUpdate = await managerA.client.from('service_requests')
  .update({ status: 'rejected' }).eq('tenant_id', ids.tenantA).eq('id', serviceRequestId).select('id');
record('Service-request review enforces allowed transitions, required outcomes, duplicate prevention, employee denial, and immutable audit history',
  !managerStartReview.error && Boolean(duplicateStartReview.error?.code === '40001')
    && Boolean(completeBeforeReview.error?.code === '22023')
    && Boolean(completeWithoutOutcome.error?.code === '22023')
    && Boolean(serviceRejectWithoutReason.error?.code === '22023')
    && Boolean(employeeUnauthorizedDecision.error?.code === '42501')
    && !managerCompletedRequest.error && managerCompletedRequest.data?.status === 'completed'
    && Boolean(duplicateCompletedDecision.error?.code === '40001')
    && resolvedEmployeeHistoryRow?.status === 'completed'
    && resolvedEmployeeHistoryRow?.history?.map(event => event.new_status).join(',') === 'pending,in_progress,completed'
    && resolvedEmployeeHistoryRow?.history?.at(-1)?.note === 'Employment certificate prepared for the employee.'
    && JSON.stringify(serviceStatusAudit.statuses) === JSON.stringify(['pending','in_progress','completed'])
    && serviceStatusAudit.audit_count === 3
    && Boolean(directServiceRequestUpdate.error)
    && queryAdmin(`SELECT jsonb_build_object('status',status) FROM public.service_requests WHERE id='${serviceRequestId}'::uuid`).status === 'completed',
  JSON.stringify({ start: managerStartReview.error?.code, duplicateStart: duplicateStartReview.error?.code,
    completeBeforeReview: completeBeforeReview.error?.code,
    completeNoOutcome: completeWithoutOutcome.error?.code, rejectNoReason: serviceRejectWithoutReason.error?.code,
    employeeDecision: employeeUnauthorizedDecision.error?.code, completion: managerCompletedRequest.error?.code,
    duplicateCompletion: duplicateCompletedDecision.error?.code, status: resolvedEmployeeHistoryRow?.status,
    history: resolvedEmployeeHistoryRow?.history?.map(event => event.new_status), audit: serviceStatusAudit.audit_count,
    directUpdate: directServiceRequestUpdate.error?.code }));

const serviceRequestRejectDraft = await employeeA.client.rpc('hris_submit_my_service_request', {
  p_tenant_id: ids.tenantA, p_request_type: 'shift_change', p_reason: 'Request a shift change for the next schedule.',
});
const serviceRequestRejectId = serviceRequestRejectDraft.data?.id;
const serviceRequestTenantBDraft = await employeeB.client.rpc('hris_submit_my_service_request', {
  p_tenant_id: ids.tenantB, p_request_type: 'other', p_reason: 'Synthetic tenant B service request.',
});
const serviceRequestTenantBId = serviceRequestTenantBDraft.data?.id;
const serviceRequestTenantBDecision = await managerB.client.rpc('hris_resolve_tenant_service_request', {
  p_tenant_id: ids.tenantB, p_request_id: serviceRequestTenantBId,
  p_expected_status: 'pending', p_next_status: 'rejected', p_note: 'Synthetic tenant B decision.',
});
record('Tenant B service requests can be decided only in tenant B and retain their own employee owner',
  !serviceRequestTenantBDraft.error && !serviceRequestTenantBDecision.error
    && serviceRequestTenantBDecision.data?.status === 'rejected'
    && serviceRequestTenantBDecision.data?.tenant_id === ids.tenantB,
  JSON.stringify({ draft: serviceRequestTenantBDraft.error?.code, decision: serviceRequestTenantBDecision.error?.code,
    tenant: serviceRequestTenantBDecision.data?.tenant_id }));
const pendingReject = await managerA.client.rpc('hris_resolve_tenant_service_request', {
  p_tenant_id: ids.tenantA, p_request_id: serviceRequestRejectId,
  p_expected_status: 'pending', p_next_status: 'rejected', p_note: 'The requested shift is not available for the selected schedule.',
});
const duplicatePendingReject = await managerA.client.rpc('hris_resolve_tenant_service_request', {
  p_tenant_id: ids.tenantA, p_request_id: serviceRequestRejectId,
  p_expected_status: 'pending', p_next_status: 'rejected', p_note: 'Duplicate rejection must be denied.',
});
const wrongTransition = await managerA.client.rpc('hris_resolve_tenant_service_request', {
  p_tenant_id: ids.tenantA, p_request_id: serviceRequestRejectId,
  p_expected_status: 'rejected', p_next_status: 'completed', p_note: 'No transition out of rejected.',
});
record('Employees receive a recorded rejection reason and rejected requests cannot be decided again',
  !serviceRequestRejectDraft.error && !pendingReject.error && pendingReject.data?.status === 'rejected'
    && pendingReject.data?.resolution_note === 'The requested shift is not available for the selected schedule.'
    && Boolean(duplicatePendingReject.error?.code === '40001')
    && Boolean(wrongTransition.error?.code === '22023'),
  JSON.stringify({ create: serviceRequestRejectDraft.error?.message, reject: pendingReject.error?.code,
    duplicate: duplicatePendingReject.error?.code, invalid: wrongTransition.error?.code }));

const concurrentServiceDraft = await employeeA.client.rpc('hris_submit_my_service_request', {
  p_tenant_id: ids.tenantA, p_request_type: 'work_from_home', p_reason: 'Synthetic concurrency review request.',
});
const concurrentServiceId = concurrentServiceDraft.data?.id;
const concurrentServiceDecisions = await Promise.all([1, 2].map(() => managerA.client.rpc('hris_resolve_tenant_service_request', {
  p_tenant_id: ids.tenantA, p_request_id: concurrentServiceId,
  p_expected_status: 'pending', p_next_status: 'in_progress', p_note: null,
})));
const concurrentServiceState = queryAdmin(`SELECT jsonb_build_object(
  'status',r.status,'history_count',(SELECT count(*)::integer FROM public.service_request_status_history h WHERE h.service_request_id=r.id),
  'decision_events',(SELECT count(*)::integer FROM public.service_request_status_history h
    WHERE h.service_request_id=r.id AND h.new_status='in_progress'))
  FROM public.service_requests r WHERE r.id='${concurrentServiceId}'::uuid`);
record('Concurrent service-request review calls create exactly one state change and one audit-history event',
  !concurrentServiceDraft.error
    && concurrentServiceDecisions.filter(result => !result.error).length === 1
    && concurrentServiceDecisions.filter(result => result.error?.code === '40001').length === 1
    && concurrentServiceState.status === 'in_progress'
    && concurrentServiceState.history_count === 2
    && concurrentServiceState.decision_events === 1,
  JSON.stringify({ draft: concurrentServiceDraft.error?.message,
    decisions: concurrentServiceDecisions.map(result => result.error?.code || result.data?.status),
    state: concurrentServiceState }));

let expenseBrowserOutput = '';
let expenseBrowserError = '';
try {
  expenseBrowserOutput = execFileSync('node', [path.join(here, 'run-expense-browser.mjs')], {
    cwd: mainRoot,
    env: {
      ...process.env,
      HRIS_LOCAL_SUPABASE_URL: services.API_URL,
      HRIS_LOCAL_SUPABASE_ANON_KEY: services.ANON_KEY,
      HRIS_LOCAL_TEST_PASSWORD: password,
      HRIS_LOCAL_EXPENSE_EMPLOYEE_EMAIL: emails[5],
      HRIS_LOCAL_EXPENSE_MANAGER_EMAIL: emails[0],
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
} catch (error) {
  expenseBrowserError = String(error.stderr || error.message || 'local expense browser run failed').slice(-1800);
}
const expenseBrowserId = expenseBrowserOutput.match(/EXPENSE_ACCEPTANCE_ID=([0-9a-f-]{36})/i)?.[1];
const expenseBrowserPath = expenseBrowserOutput.match(/EXPENSE_ACCEPTANCE_PATH=([^\r\n]+)/i)?.[1];
if (expenseBrowserPath) uploadedExpensePaths.push(expenseBrowserPath);
const browserExpensePersistence = expenseBrowserId ? queryAdmin(`SELECT jsonb_build_object(
  'tenant_id',c.tenant_id,'employee_id',c.employee_id,'status',c.status,
  'receipt_count',(SELECT count(*)::integer FROM public.expense_claim_receipts r WHERE r.claim_id=c.id),
  'history_count',(SELECT count(*)::integer FROM public.expense_claim_status_history h WHERE h.claim_id=c.id),
  'history',(SELECT coalesce(jsonb_agg(new_status ORDER BY created_at),'[]'::jsonb) FROM public.expense_claim_status_history h WHERE h.claim_id=c.id))
  FROM public.expense_claims c WHERE c.id=${sqlLiteral(expenseBrowserId)}::uuid`) : null;
record('Real browser employee expense, private receipt, submission history, and read-only manager queue persist in isolated Postgres',
  expenseBrowserOutput.includes('Local Auth-to-Postgres expense workflow persisted an employee draft, validation recovery, private receipt, submission, history, and tenant-scoped read-only manager queue across mobile and desktop.')
    && browserExpensePersistence?.tenant_id === ids.tenantA
    && browserExpensePersistence?.employee_id === '55555555-5555-4555-8555-555555555555'
    && browserExpensePersistence?.status === 'submitted'
    && browserExpensePersistence?.receipt_count === 1
    && browserExpensePersistence?.history_count === 1
    && JSON.stringify(browserExpensePersistence?.history) === JSON.stringify(['submitted']),
  expenseBrowserError || JSON.stringify(browserExpensePersistence));

let serviceBrowserOutput = '';
let serviceBrowserError = '';
try {
  serviceBrowserOutput = execFileSync('node', [path.join(here, 'run-service-requests-browser.mjs')], {
    cwd: mainRoot,
    env: {
      ...process.env,
      HRIS_LOCAL_SUPABASE_URL: services.API_URL,
      HRIS_LOCAL_SUPABASE_ANON_KEY: services.ANON_KEY,
      HRIS_LOCAL_TEST_PASSWORD: password,
      HRIS_LOCAL_SERVICE_EMPLOYEE_EMAIL: emails[5],
      HRIS_LOCAL_SERVICE_MANAGER_EMAIL: emails[0],
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
} catch (error) {
  serviceBrowserError = String(error.stderr || error.message || 'local service-request browser run failed').slice(-1800);
}
const serviceBrowserId = serviceBrowserOutput.match(/SERVICE_REQUEST_ACCEPTANCE_ID=([0-9a-f-]{36})/i)?.[1];
const serviceBrowserRejectedId = serviceBrowserOutput.match(/SERVICE_REQUEST_REJECTION_ACCEPTANCE_ID=([0-9a-f-]{36})/i)?.[1];
const browserServicePersistence = serviceBrowserId ? queryAdmin(`SELECT jsonb_build_object(
  'tenant_id',tenant_id,'employee_id',employee_id,'request_type',request_type,'reason',reason,
  'status',status,'submitted_by',submitted_by IS NOT NULL,'resolution_note',resolution_note,
  'history',(SELECT coalesce(jsonb_agg(new_status ORDER BY created_at,id),'[]'::jsonb)
    FROM public.service_request_status_history h WHERE h.service_request_id=service_requests.id),
  'audit_count',(SELECT count(*)::integer FROM public.admin_audit_logs a
    WHERE a.target_type='service_request' AND a.target_id=service_requests.id::text))
  FROM public.service_requests WHERE id=${sqlLiteral(serviceBrowserId)}::uuid`) : null;
const browserServiceRejected = serviceBrowserRejectedId ? queryAdmin(`SELECT jsonb_build_object(
  'tenant_id',tenant_id,'employee_id',employee_id,'status',status,'resolution_note',resolution_note,
  'history',(SELECT coalesce(jsonb_agg(new_status ORDER BY created_at,id),'[]'::jsonb)
    FROM public.service_request_status_history h WHERE h.service_request_id=service_requests.id),
  'audit_count',(SELECT count(*)::integer FROM public.admin_audit_logs a
    WHERE a.target_type='service_request' AND a.target_id=service_requests.id::text))
  FROM public.service_requests WHERE id=${sqlLiteral(serviceBrowserRejectedId)}::uuid`) : null;
record('Real Auth/Postgres employee-to-HR service-request review, outcomes, history and refresh recovery persist in EN/BN on mobile and desktop',
  serviceBrowserOutput.includes('Local Auth/Postgres employee submission, HR review, outcome, rejection, status history, refresh recovery, EN/BN, and mobile/desktop journeys persisted.')
    && serviceBrowserOutput.includes('SERVICE_REQUEST_NOTIFICATION_ACCEPTANCE=PASS')
    && browserServicePersistence?.tenant_id === ids.tenantA
    && browserServicePersistence?.employee_id === '55555555-5555-4555-8555-555555555555'
    && browserServicePersistence?.request_type === 'employment_certificate'
    && browserServicePersistence?.status === 'completed'
    && browserServicePersistence?.resolution_note?.startsWith('Synthetic HR resolution outcome ')
    && JSON.stringify(browserServicePersistence?.history) === JSON.stringify(['pending','in_progress','completed'])
    && browserServicePersistence?.audit_count === 3
    && browserServiceRejected?.tenant_id === ids.tenantA
    && browserServiceRejected?.employee_id === '55555555-5555-4555-8555-555555555555'
    && browserServiceRejected?.status === 'rejected'
    && browserServiceRejected?.resolution_note === 'The requested schedule is not available.'
    && JSON.stringify(browserServiceRejected?.history) === JSON.stringify(['pending','rejected'])
    && browserServiceRejected?.audit_count === 2,
  serviceBrowserError || JSON.stringify({ completed: browserServicePersistence, rejected: browserServiceRejected }));

psqlSync(`UPDATE public.employees SET employment_status='terminated'
  WHERE id='55555555-5555-4555-8555-555555555555';`);
const terminatedEmployeeSummary = attemptAs(employeeA,
  `SELECT public.hris_get_my_dashboard_data('${ids.tenantA}'::uuid)`);
psqlSync(`UPDATE public.employees SET employment_status='active'
  WHERE id='55555555-5555-4555-8555-555555555555';`);
record('Terminated employee immediately loses self-service attendance and leave access',
  !terminatedEmployeeSummary.ok);

const policyId = '99999999-9999-4999-8999-999999999905';
const policyPayload = {
  name: 'Synthetic configurable leave policy', code: 'SYN-CONF', applicable_gender: null,
  min_days_notice: 2, requires_document_proof: false, annual_entitlement: 12, active: true,
};
const policyCreate = await managerA.client.rpc('hris_save_leave_type', {
  p_tenant_id: ids.tenantA, p_leave_type_id: policyId, p_payload: policyPayload, p_expected: null,
});
const policyRetryCreate = await managerA.client.rpc('hris_save_leave_type', {
  p_tenant_id: ids.tenantA, p_leave_type_id: policyId, p_payload: policyPayload, p_expected: null,
});
const duplicatePolicyCode = await managerA.client.rpc('hris_save_leave_type', {
  p_tenant_id: ids.tenantA, p_leave_type_id: '99999999-9999-4999-8999-999999999906',
  p_payload: { ...policyPayload, code: 'syn-conf' }, p_expected: null,
});
const policyUpdatePayload = { ...policyPayload, name: 'Synthetic configurable leave policy revised',
  min_days_notice: 4, annual_entitlement: 14 };
const policyExpected = { ...policyPayload };
const policyUpdate = await managerA.client.rpc('hris_save_leave_type', {
  p_tenant_id: ids.tenantA, p_leave_type_id: policyId,
  p_payload: policyUpdatePayload, p_expected: policyExpected,
});
const policyStaleUpdate = await managerA.client.rpc('hris_save_leave_type', {
  p_tenant_id: ids.tenantA, p_leave_type_id: policyId,
  p_payload: { ...policyPayload, annual_entitlement: 99 }, p_expected: policyExpected,
});
const policyEmployeeContext = await employeeA.client.rpc('hris_get_my_dashboard_data', { p_tenant_id: ids.tenantA });
const employeePolicyVisible = policyEmployeeContext.data?.leave_types?.some(item => item.id === policyId);
const policyDeactivate = await managerA.client.rpc('hris_save_leave_type', {
  p_tenant_id: ids.tenantA, p_leave_type_id: policyId,
  p_payload: { ...policyUpdatePayload, active: false }, p_expected: policyUpdatePayload,
});
const policyEmployeeContextAfterDeactivate = await employeeA.client.rpc('hris_get_my_dashboard_data', { p_tenant_id: ids.tenantA });
const employeePolicyHiddenAfterDeactivate = !policyEmployeeContextAfterDeactivate.data?.leave_types?.some(item => item.id === policyId);
const policyRow = queryAdmin(`SELECT to_jsonb(lt) FROM public.leave_types lt WHERE id='${policyId}'::uuid`);
const policyHistory = queryAdmin(`SELECT jsonb_build_object(
  'created',count(*) FILTER (WHERE action='leave.type.created')::integer,
  'updated',count(*) FILTER (WHERE action='leave.type.updated')::integer,
  'last_before',(array_agg(details->'before' ORDER BY created_at DESC)
    FILTER (WHERE action='leave.type.updated'))[1],
  'last_after',(array_agg(details->'annual_entitlement' ORDER BY created_at DESC)
    FILTER (WHERE action='leave.type.updated'))[1])
  FROM public.admin_audit_logs WHERE target_type='leave_type' AND target_id='${policyId}'`);
const policyNoPermission = await employeeA.client.rpc('hris_save_leave_type', {
  p_tenant_id: ids.tenantA, p_leave_type_id: '99999999-9999-4999-8999-999999999907', p_payload: policyPayload,
});
const policyReadOnlyViewer = await tenantViewer.client.rpc('hris_save_leave_type', {
  p_tenant_id: ids.tenantB, p_leave_type_id: '99999999-9999-4999-8999-999999999908', p_payload: policyPayload,
});
const policyGlobalOnly = await globalOnly.client.rpc('hris_save_leave_type', {
  p_tenant_id: ids.tenantA, p_leave_type_id: '99999999-9999-4999-8999-999999999909', p_payload: policyPayload,
});
const policyCrossTenant = await managerB.client.rpc('hris_save_leave_type', {
  p_tenant_id: ids.tenantA, p_leave_type_id: '99999999-9999-4999-8999-999999999910', p_payload: policyPayload,
});
const directLeavePolicyWrite = await managerA.client.from('leave_types')
  .update({ annual_entitlement: 100 }).eq('tenant_id', ids.tenantA).eq('id', policyId);
record('Tenant leave managers can configure existing leave policy fields with idempotent create, optimistic edits, audit, and employee visibility',
  !policyCreate.error && policyCreate.data?.id === policyId
    && !policyRetryCreate.error && policyRetryCreate.data?.id === policyId
    && Boolean(duplicatePolicyCode.error?.code === '23505')
    && !policyUpdate.error && policyUpdate.data?.annual_entitlement === 14
    && Boolean(policyStaleUpdate.error?.code === '40001')
    && !policyDeactivate.error && policyDeactivate.data?.active === false
    && policyRow?.name === policyUpdatePayload.name && Number(policyRow?.annual_entitlement) === 14 && policyRow?.active === false
    && Number(policyRow?.min_days_notice) === 4 && employeePolicyVisible === true && employeePolicyHiddenAfterDeactivate
    && policyHistory.created === 1 && policyHistory.updated === 2
    && Number(policyHistory.last_before?.annual_entitlement) === 14
    && policyHistory.last_before?.active === true && Number(policyHistory.last_after) === 14,
  JSON.stringify({ create: policyCreate.error?.code || policyCreate.data?.id,
    retry: policyRetryCreate.error?.code || policyRetryCreate.data?.id,
    duplicate: duplicatePolicyCode.error?.code, update: policyUpdate.error?.code || policyUpdate.data?.annual_entitlement,
    stale: policyStaleUpdate.error?.code, deactivate: policyDeactivate.error?.code || policyDeactivate.data?.active,
    employeeVisible: employeePolicyVisible, hiddenAfterDeactivate: employeePolicyHiddenAfterDeactivate,
    audit: policyHistory, row: policyRow }));
record('Leave policy writes require active same-tenant leave.manage and cannot bypass the RPC',
  Boolean(policyNoPermission.error?.code === '42501')
    && Boolean(policyReadOnlyViewer.error?.code === '42501')
    && Boolean(policyGlobalOnly.error?.code === '42501')
    && Boolean(policyCrossTenant.error?.code === '42501')
    && Boolean(directLeavePolicyWrite.error),
  JSON.stringify({ employee: policyNoPermission.error?.code,
    viewer: policyReadOnlyViewer.error?.code, globalOnly: policyGlobalOnly.error?.code,
    crossTenant: policyCrossTenant.error?.code, directWrite: directLeavePolicyWrite.error?.code }));

const genderPolicyId = '99999999-9999-4999-8999-999999999911';
const noticePolicyId = '99999999-9999-4999-8999-999999999912';
const genderPolicyCreate = await managerA.client.rpc('hris_save_leave_type', {
  p_tenant_id: ids.tenantA, p_leave_type_id: genderPolicyId, p_expected: null,
  p_payload: { name: 'Synthetic gender-restricted leave', code: 'SYN-GENDER',
    applicable_gender: 'female', min_days_notice: null, requires_document_proof: false,
    annual_entitlement: 5, active: true },
});
const noticePolicyCreate = await managerA.client.rpc('hris_save_leave_type', {
  p_tenant_id: ids.tenantA, p_leave_type_id: noticePolicyId, p_expected: null,
  p_payload: { name: 'Synthetic notice-restricted leave', code: 'SYN-NOTICE',
    applicable_gender: null, min_days_notice: 2, requires_document_proof: false,
    annual_entitlement: 5, active: true },
});
const leavePolicyEligibleDate = queryAdmin(`SELECT jsonb_build_object('date',to_char(candidate,'YYYY-MM-DD'))
  FROM (
    SELECT g.day::date AS candidate
    FROM generate_series('${localCurrentDate}'::date+2,'${localCurrentDate}'::date+20,interval '1 day') g(day)
  ) dates
  JOIN public.employees e ON e.user_id='${employeeA.userId}'::uuid AND e.tenant_id='${ids.tenantA}'::uuid
  LEFT JOIN public.shifts s ON s.id=e.shift_id AND s.tenant_id=e.tenant_id
  WHERE NOT (extract(dow FROM candidate)::integer=ANY(coalesce(s.weekly_off_days,'{}'::integer[])))
    AND NOT EXISTS (SELECT 1 FROM public.holidays h WHERE h.tenant_id=e.tenant_id
      AND h.active IS TRUE AND candidate BETWEEN h.start_date AND h.end_date)
    AND NOT EXISTS (SELECT 1 FROM public.leave_requests r WHERE r.tenant_id=e.tenant_id
      AND r.employee_id=e.id AND r.status IN ('pending','approved')
      AND daterange(r.from_date,r.to_date,'[]') && daterange(candidate,candidate,'[]'))
  ORDER BY candidate LIMIT 1`);
const genderRestrictedRequest = await employeeA.client.rpc('hris_employee_submit_leave_request', {
  p_tenant_id: ids.tenantA,
  p_payload: { leave_type_id: genderPolicyId, from_date: leavePolicyEligibleDate.date,
    to_date: leavePolicyEligibleDate.date, day_portion: 'full', reason: 'Synthetic gender policy denial' },
});
const genderRestrictedRows = queryAdmin(`SELECT jsonb_build_object('requests',count(*)::integer,'balances',
  (SELECT count(*)::integer FROM public.employee_leave_balances b WHERE b.tenant_id='${ids.tenantA}'::uuid
    AND b.employee_id=(SELECT e.id FROM public.employees e WHERE e.user_id='${employeeA.userId}'::uuid
      AND e.tenant_id='${ids.tenantA}'::uuid) AND b.leave_type_id='${genderPolicyId}'::uuid))
  FROM public.leave_requests r WHERE r.tenant_id='${ids.tenantA}'::uuid
    AND r.employee_id=(SELECT e.id FROM public.employees e WHERE e.user_id='${employeeA.userId}'::uuid
      AND e.tenant_id='${ids.tenantA}'::uuid) AND r.leave_type_id='${genderPolicyId}'::uuid`);
record('Gender-restricted leave is denied for a non-matching employee profile without creating a request or balance',
  !genderPolicyCreate.error && !noticePolicyCreate.error && Boolean(leavePolicyEligibleDate.date)
    && Boolean(genderRestrictedRequest.error?.code === '42501')
    && genderRestrictedRows.requests === 0 && genderRestrictedRows.balances === 0,
  JSON.stringify({ gender: queryAdmin(`SELECT jsonb_build_object('gender',gender) FROM public.employees
    WHERE user_id='${employeeA.userId}'::uuid AND tenant_id='${ids.tenantA}'::uuid`).gender,
    eligibleDate: leavePolicyEligibleDate.date,
    error: genderRestrictedRequest.error?.code, writes: genderRestrictedRows }));

const tooSoonDate = addCalendarDays(localCurrentDate, 1);
const tooSoonRequest = await employeeA.client.rpc('hris_employee_submit_leave_request', {
  p_tenant_id: ids.tenantA,
  p_payload: { leave_type_id: noticePolicyId, from_date: tooSoonDate, to_date: tooSoonDate,
    day_portion: 'full', reason: 'Synthetic minimum notice denial' },
});
const tooSoonRows = queryAdmin(`SELECT jsonb_build_object('count',count(*)::integer) FROM public.leave_requests r
  WHERE r.tenant_id='${ids.tenantA}'::uuid
    AND r.employee_id=(SELECT e.id FROM public.employees e WHERE e.user_id='${employeeA.userId}'::uuid
      AND e.tenant_id='${ids.tenantA}'::uuid) AND r.leave_type_id='${noticePolicyId}'::uuid`);
const noticeRequest = await employeeA.client.rpc('hris_employee_submit_leave_request', {
  p_tenant_id: ids.tenantA,
  p_payload: { leave_type_id: noticePolicyId, from_date: leavePolicyEligibleDate.date,
    to_date: leavePolicyEligibleDate.date, day_portion: 'full', reason: 'Synthetic valid notice boundary' },
});
const noticeRequestRow = noticeRequest.data ? tableRow('leave_requests', noticeRequest.data) : null;
const noticeBalance = queryAdmin(`SELECT jsonb_build_object('balance',(
  SELECT to_jsonb(b) FROM public.employee_leave_balances b
  WHERE b.tenant_id='${ids.tenantA}'::uuid
    AND b.employee_id=(SELECT e.id FROM public.employees e
      WHERE e.user_id='${employeeA.userId}'::uuid AND e.tenant_id='${ids.tenantA}'::uuid)
    AND b.leave_type_id='${noticePolicyId}'::uuid
    AND b.balance_year=${Number(leavePolicyEligibleDate.date?.slice(0, 4))}
  LIMIT 1))`).balance;
record('Minimum advance notice is enforced at submission; an eligible work date persists with its balance',
  !noticePolicyCreate.error && Boolean(leavePolicyEligibleDate.date)
    && Boolean(tooSoonRequest.error?.code === '22000')
    && String(tooSoonRequest.error?.message || '').includes('advance notice')
    && tooSoonRows.count === 0 && !noticeRequest.error
    && noticeRequestRow?.status === 'pending'
    && noticeRequestRow?.from_date === leavePolicyEligibleDate.date
    && Number(noticeBalance?.pending_days) === 1,
  JSON.stringify({ tooSoonDate, tooSoonError: tooSoonRequest.error?.message,
    tooSoonRows: tooSoonRows.count, eligibleDate: leavePolicyEligibleDate.date,
    validRequestError: noticeRequest.error?.code || null, validRequestStatus: noticeRequestRow?.status,
    pendingDays: noticeBalance?.pending_days ?? null }));

const leaveApproved = resolveLeave(managerA, ids.leaveApprove, 'approved', 'isolated local acceptance');
const approvedRow = tableRow('leave_requests', ids.leaveApprove);
const leaveBalance = balance(ids.leaveTypeA, 2026);
record('Tenant A leave approval applies holiday-aware balance and audit atomically',
  leaveApproved.success === true && approvedRow.status === 'approved'
  && Number(leaveBalance.pending_days) === 4 && Number(leaveBalance.used_days) === 1
  && auditCount(ids.leaveApprove, 'leave.request.approved') === 1,
  JSON.stringify({ decision: leaveApproved, status: approvedRow.status,
    pendingDays: leaveBalance.pending_days, usedDays: leaveBalance.used_days,
    auditCount: auditCount(ids.leaveApprove, 'leave.request.approved') }));
const persistedLeaveDecision = queryAdmin(`SELECT jsonb_build_object(
  'count',count(*)::integer,'kind',max(kind),'tenant_id',max(tenant_id::text),
  'request_id',max(leave_request_id::text),'recipient_id',max(recipient_employee_id::text),
  'created_at',max(created_at))
  FROM public.leave_request_notifications WHERE tenant_id='${ids.tenantA}'::uuid
    AND leave_request_id='${ids.leaveApprove}'::uuid`);
const ownerLeaveDecisionRows = await employeeA.client.from('leave_request_notifications')
  .select('id,tenant_id,leave_request_id,recipient_employee_id,kind,created_at')
  .eq('tenant_id', ids.tenantA).eq('leave_request_id', ids.leaveApprove);
const otherTenantLeaveDecisionRows = await employeeB.client.from('leave_request_notifications')
  .select('id,tenant_id,leave_request_id,recipient_employee_id,kind')
  .eq('tenant_id', ids.tenantA);
const directLeaveDecisionInsert = await employeeA.client.from('leave_request_notifications').insert({
  tenant_id: ids.tenantA, leave_request_id: ids.leaveApprove,
  recipient_employee_id: '55555555-5555-4555-8555-555555555555', kind: 'rejected',
  created_at: new Date().toISOString(),
});
const directLeaveDecisionUpdate = await employeeA.client.from('leave_request_notifications')
  .update({ kind: 'rejected' }).eq('tenant_id', ids.tenantA).eq('leave_request_id', ids.leaveApprove);
const directLeaveDecisionDelete = await employeeA.client.from('leave_request_notifications')
  .delete().eq('tenant_id', ids.tenantA).eq('leave_request_id', ids.leaveApprove);
const anonLeaveDecisionRead = attemptAs(null,
  `SELECT * FROM public.leave_request_notifications WHERE tenant_id='${ids.tenantA}'::uuid`, 'anon');
record('Leave decision notifications persist atomically and are owner-readable, tenant-isolated, and immutable to client roles',
  persistedLeaveDecision.count === 1 && persistedLeaveDecision.kind === 'approved'
    && persistedLeaveDecision.tenant_id === ids.tenantA
    && persistedLeaveDecision.request_id === ids.leaveApprove
    && persistedLeaveDecision.recipient_id === '55555555-5555-4555-8555-555555555555'
    && Boolean(persistedLeaveDecision.created_at)
    && !ownerLeaveDecisionRows.error && ownerLeaveDecisionRows.data.length === 1
    && ownerLeaveDecisionRows.data[0].kind === 'approved'
    && !otherTenantLeaveDecisionRows.error && otherTenantLeaveDecisionRows.data.length === 0
    && Boolean(directLeaveDecisionInsert.error) && Boolean(directLeaveDecisionUpdate.error)
    && Boolean(directLeaveDecisionDelete.error) && !anonLeaveDecisionRead.ok,
  JSON.stringify({ persistedKind: persistedLeaveDecision.kind, ownerRows: ownerLeaveDecisionRows.data?.length,
    foreignTenantRows: otherTenantLeaveDecisionRows.data?.length,
    insertDenied: Boolean(directLeaveDecisionInsert.error), updateDenied: Boolean(directLeaveDecisionUpdate.error),
    deleteDenied: Boolean(directLeaveDecisionDelete.error), anonymousDenied: !anonLeaveDecisionRead.ok }));

const yearApproval = resolveLeave(managerA, ids.leaveYearBoundary, 'approved');
const year2026 = balance(ids.leaveTypeA, 2026);
const year2027 = balance(ids.leaveTypeA, 2027);
record('Cross-year leave updates only the matching yearly ledgers', yearApproval.success === true
  && Number(year2026.pending_days) === 3 && Number(year2026.used_days) === 2
  && Number(year2027.pending_days) === 0 && Number(year2027.used_days) === 1,
  JSON.stringify({ decision: yearApproval, year2026: {
    pendingDays: year2026.pending_days, usedDays: year2026.used_days,
  }, year2027: { pendingDays: year2027.pending_days, usedDays: year2027.used_days } }));

const halfReject = resolveLeave(managerA, ids.leaveHalfDay, 'rejected', 'isolated rejection');
const halfRow = tableRow('leave_requests', ids.leaveHalfDay);
const afterHalf = balance(ids.leaveTypeA, 2026);
record('Half-day rejection releases pending days without increasing used days', halfReject.success === true
  && halfRow.status === 'rejected' && Number(afterHalf.pending_days) === 2.5
  && Number(afterHalf.used_days) === 2,
  JSON.stringify({ decision: halfReject, status: halfRow.status,
    pendingDays: afterHalf.pending_days, usedDays: afterHalf.used_days }));

const missingLedger = attemptAs(managerA, `SELECT public.admin_resolve_leave_request(
  '${ids.leaveMissingLedger}'::uuid,'approved',NULL)::jsonb`);
const missingRequest = tableRow('leave_requests', ids.leaveMissingLedger);
const missingBalance = balance(ids.leaveTypeMissingLedger, 2026);
record('Missing second-year ledger rolls back earlier updates and audit', !missingLedger.ok
  && missingRequest.status === 'pending' && Number(missingBalance.pending_days) === 1
  && Number(missingBalance.used_days) === 0 && auditCount(ids.leaveMissingLedger, 'leave.request.approved') === 0,
  missingLedger.ok ? 'unexpected approval' : 'expected transactional rejection');

const allocationSnapshotDate = queryAdmin(`SELECT to_jsonb(candidate::date)
  FROM generate_series('2098-01-01'::date,'2098-02-28'::date,interval '1 day') AS g(candidate)
  JOIN public.employees e ON e.id='55555555-5555-4555-8555-555555555555'::uuid
  LEFT JOIN public.shifts s ON s.id=e.shift_id AND s.active IS TRUE
  WHERE NOT (extract(dow FROM candidate)::integer=ANY(coalesce(s.weekly_off_days,'{}'::integer[])))
    AND NOT EXISTS (SELECT 1 FROM public.holidays h WHERE h.tenant_id='${ids.tenantA}'::uuid
      AND h.active IS TRUE AND candidate::date BETWEEN h.start_date AND h.end_date)
    AND NOT EXISTS (SELECT 1 FROM public.leave_requests r WHERE r.tenant_id='${ids.tenantA}'::uuid
      AND r.employee_id=e.id AND r.status IN ('pending','approved')
      AND daterange(r.from_date,r.to_date,'[]') && daterange(candidate::date,candidate::date,'[]'))
  ORDER BY candidate LIMIT 1`);
const allocationSnapshotSubmission = await employeeA.client.rpc('hris_employee_submit_leave_request', {
  p_tenant_id: ids.tenantA,
  p_payload: {
    leave_type_id: ids.leaveTypeA, from_date: allocationSnapshotDate, to_date: allocationSnapshotDate,
    day_portion: 'full', reason: 'Synthetic leave allocation snapshot acceptance',
  },
});
const allocationSnapshotRequestId = allocationSnapshotSubmission.data;
const allocationSnapshotYear = allocationSnapshotDate ? Number(allocationSnapshotDate.slice(0,4)) : null;
const allocationSnapshotRows = allocationSnapshotRequestId ? queryAdmin(`SELECT coalesce(jsonb_agg(jsonb_build_object(
    'balance_year',balance_year,'chargeable_days',chargeable_days) ORDER BY balance_year),'[]'::jsonb)
  FROM private.hris_leave_balance_allocations WHERE tenant_id='${ids.tenantA}'::uuid
    AND leave_request_id=${sqlLiteral(allocationSnapshotRequestId)}::uuid
    AND employee_id='55555555-5555-4555-8555-555555555555'::uuid`) : [];
const allocationSnapshotEmployeeRead = allocationSnapshotRequestId && attemptAs(employeeA,
  `SELECT count(*) FROM private.hris_leave_balance_allocations WHERE leave_request_id=${sqlLiteral(allocationSnapshotRequestId)}::uuid`);
const allocationSnapshotManagerRead = allocationSnapshotRequestId && attemptAs(managerA,
  `SELECT count(*) FROM private.hris_leave_balance_allocations WHERE leave_request_id=${sqlLiteral(allocationSnapshotRequestId)}::uuid`);
record('New leave request records an internal per-year allocation and keeps it private from employee and manager table reads',
  !allocationSnapshotSubmission.error && allocationSnapshotDate
  && allocationSnapshotRows.length === 1
  && Number(allocationSnapshotRows[0].chargeable_days) === 1
  && allocationSnapshotRows[0].balance_year === allocationSnapshotYear
  && allocationSnapshotEmployeeRead?.ok === false && allocationSnapshotManagerRead?.ok === false,
  JSON.stringify({ date: allocationSnapshotDate, allocations: allocationSnapshotRows,
    employeeDenied: allocationSnapshotEmployeeRead?.ok === false,
    managerDenied: allocationSnapshotManagerRead?.ok === false,
    error: allocationSnapshotSubmission.error?.message }));
if (allocationSnapshotRequestId) {
  psqlSync(`INSERT INTO public.holidays(tenant_id,name,start_date,end_date,holiday_type,active)
    VALUES ('${ids.tenantA}'::uuid,'Synthetic post-submission calendar change',${sqlLiteral(allocationSnapshotDate)}::date,
      ${sqlLiteral(allocationSnapshotDate)}::date,'general',true);`);
}
const allocationSnapshotDecision = allocationSnapshotRequestId
  ? resolveLeave(managerA, allocationSnapshotRequestId, 'approved') : { success: false };
const allocationSnapshotBalance = allocationSnapshotRequestId
  ? queryAdmin(`SELECT to_jsonb(b) FROM public.employee_leave_balances b
      WHERE tenant_id='${ids.tenantA}'::uuid AND employee_id='55555555-5555-4555-8555-555555555555'::uuid
        AND leave_type_id='${ids.leaveTypeA}'::uuid AND balance_year=${allocationSnapshotYear}`) : null;
const allocationSnapshotRequest = allocationSnapshotRequestId
  ? tableRow('leave_requests', allocationSnapshotRequestId) : null;
const duplicateAllocationSnapshotDecision = allocationSnapshotRequestId
  ? attemptAs(managerA, `SELECT public.admin_resolve_leave_request(${sqlLiteral(allocationSnapshotRequestId)}::uuid,'approved',NULL)`)
  : { ok: true };
record('Leave approval consumes the submission allocation after the holiday calendar changes and remains single-decision',
  allocationSnapshotDecision.success === true
  && allocationSnapshotRequest?.status === 'approved'
  && Number(allocationSnapshotBalance.pending_days) === 0
  && Number(allocationSnapshotBalance.used_days) === 1
  && auditCount(allocationSnapshotRequestId, 'leave.request.approved') === 1
  && duplicateAllocationSnapshotDecision.ok === false,
  JSON.stringify({ status: allocationSnapshotRequest?.status, balance: allocationSnapshotBalance,
    auditCount: auditCount(allocationSnapshotRequestId, 'leave.request.approved'),
    duplicateDenied: duplicateAllocationSnapshotDecision.ok === false }));

const attendanceApproved = resolveAttendance(managerA, ids.attendanceCorrection, 'approved');
const attendanceRow = tableRow('attendance_records', ids.attendanceRecord);
const sameInstant = (value, expected) => Date.parse(value) === Date.parse(expected);
record('Check-in-only attendance correction preserves existing checkout and work fields',
  attendanceApproved.success === true
  && sameInstant(attendanceRow.check_in, `${localCurrentDate}T03:30:00Z`)
  && sameInstant(attendanceRow.check_out, `${localCurrentDate}T11:00:00Z`)
  && attendanceRow.work_mode === 'home' && attendanceRow.client_name === 'Existing Client'
  && auditCount(ids.attendanceCorrection, 'attendance.correction.approved') === 1);

const checkoutApproved = resolveAttendance(managerA, ids.attendanceCheckoutOnly, 'approved');
const afterCheckoutOnly = tableRow('attendance_records', ids.attendanceRecord);
record('Check-out-only attendance correction preserves check-in, mode and client fields',
  checkoutApproved.success === true
  && sameInstant(afterCheckoutOnly.check_in, `${localCurrentDate}T03:30:00Z`)
  && sameInstant(afterCheckoutOnly.check_out, `${localCurrentDate}T12:00:00Z`)
  && afterCheckoutOnly.work_mode === 'home' && afterCheckoutOnly.client_name === 'Existing Client'
  && auditCount(ids.attendanceCheckoutOnly, 'attendance.correction.approved') === 1);

const workModeApproved = resolveAttendance(managerA, ids.attendanceWorkModeOnly, 'approved');
const afterWorkModeOnly = tableRow('attendance_records', ids.attendanceRecord);
record('Work-mode-only attendance correction preserves both punches and the client',
  workModeApproved.success === true
  && sameInstant(afterWorkModeOnly.check_in, `${localCurrentDate}T03:30:00Z`)
  && sameInstant(afterWorkModeOnly.check_out, `${localCurrentDate}T12:00:00Z`)
  && afterWorkModeOnly.work_mode === 'office' && afterWorkModeOnly.client_name === 'Existing Client'
  && auditCount(ids.attendanceWorkModeOnly, 'attendance.correction.approved') === 1);

const noExistingAttendance = resolveAttendance(managerA, ids.attendanceNoExistingRow, 'approved');
const createdAttendance = noExistingAttendance.attendance_record_id
  ? tableRow('attendance_records', noExistingAttendance.attendance_record_id)
  : null;
record('Approved correction creates a tenant-bound attendance row when none exists',
  noExistingAttendance.success === true && createdAttendance?.tenant_id === ids.tenantA
  && createdAttendance?.employee_id === '55555555-5555-4555-8555-555555555555'
  && createdAttendance?.attendance_date === '2026-10-13'
  && sameInstant(createdAttendance?.check_in, '2026-10-13T03:00:00Z')
  && createdAttendance?.status === 'present'
  && auditCount(ids.attendanceNoExistingRow, 'attendance.correction.approved') === 1);

const concurrentAttendance = await Promise.allSettled([
  psqlAsync(sessionSql(managerA, `SELECT public.admin_resolve_attendance_correction('${ids.attendanceConcurrent}'::uuid,'approved','first concurrent correction')::jsonb`)),
  psqlAsync(sessionSql(managerA2, `SELECT public.admin_resolve_attendance_correction('${ids.attendanceConcurrent}'::uuid,'approved','second concurrent correction')::jsonb`)),
]);
const concurrentAttendanceCorrection = tableRow('attendance_corrections', ids.attendanceConcurrent);
const concurrentAttendanceRecord = queryAdmin(`SELECT to_jsonb(a) FROM public.attendance_records a
  WHERE tenant_id='${ids.tenantA}'::uuid AND employee_id='55555555-5555-4555-8555-555555555555'
    AND attendance_date='2026-10-14'`);
const dashboardReportFixtureDate = concurrentAttendanceRecord?.attendance_date || '2026-10-14';
record('Concurrent attendance decisions resolve and create one record and audit once',
  concurrentAttendance.filter(result => result.status === 'fulfilled').length === 1
  && concurrentAttendanceCorrection.status === 'approved'
  && concurrentAttendanceRecord.tenant_id === ids.tenantA
  && auditCount(ids.attendanceConcurrent, 'attendance.correction.approved') === 1,
  concurrentAttendance.map(result => result.status === 'fulfilled' ? 'resolved' : 'denied').join('/'));

const concurrent = await Promise.allSettled([
  psqlAsync(sessionSql(managerA, `SELECT public.admin_resolve_leave_request('${ids.leaveConcurrent}'::uuid,'approved','first concurrent call')::jsonb`)),
  psqlAsync(sessionSql(managerA2, `SELECT public.admin_resolve_leave_request('${ids.leaveConcurrent}'::uuid,'approved','second concurrent call')::jsonb`)),
]);
const concurrentRow = tableRow('leave_requests', ids.leaveConcurrent);
record('Concurrent duplicate leave decisions resolve and audit exactly once',
  concurrent.filter((result) => result.status === 'fulfilled').length === 1
  && concurrentRow.status === 'approved'
  && auditCount(ids.leaveConcurrent, 'leave.request.approved') === 1,
  concurrent.map((result) => result.status === 'fulfilled' ? 'resolved' : 'denied').join('/'));

const attendanceVisible = queryAs(managerB, `SELECT coalesce(jsonb_agg(tenant_id ORDER BY tenant_id),'[]'::jsonb)
  FROM (SELECT DISTINCT tenant_id FROM public.attendance_records) visible`);
const attendanceTenants = new Set(attendanceVisible);
record('Tenant B manager cannot read tenant A attendance rows',
  !attendanceTenants.has(ids.tenantA) && attendanceTenants.has(ids.tenantB),
  `visible tenant count=${attendanceTenants.size}`);

const attendanceVisibleA = queryAs(managerA, `SELECT coalesce(jsonb_agg(tenant_id ORDER BY tenant_id),'[]'::jsonb)
  FROM (SELECT DISTINCT tenant_id FROM public.attendance_records) visible`);
const attendanceTenantsA = new Set(attendanceVisibleA);
record('Tenant A manager cannot read tenant B attendance rows',
  attendanceTenantsA.has(ids.tenantA) && !attendanceTenantsA.has(ids.tenantB),
  `visible tenant count=${attendanceTenantsA.size}`);

const leaveVisible = queryAs(managerB, `SELECT coalesce(jsonb_agg(tenant_id ORDER BY tenant_id),'[]'::jsonb)
  FROM (SELECT DISTINCT tenant_id FROM public.leave_requests) visible`);
const leaveTenants = new Set(leaveVisible);
record('Tenant B manager reads tenant B leave rows without seeing tenant A',
  !leaveTenants.has(ids.tenantA) && leaveTenants.has(ids.tenantB),
  `visible tenant count=${leaveTenants.size}`);

const dashboardB = queryAs(managerB, `SELECT public.hris_get_tenant_dashboard_summary('${ids.tenantB}'::uuid)`);
const dashboardA = queryAs(managerA, `SELECT public.hris_get_tenant_dashboard_summary('${ids.tenantA}'::uuid)`);
const attendanceDataA = queryAs(managerA, `SELECT public.hris_get_tenant_attendance_data(
  '${ids.tenantA}'::uuid,'${localCurrentDate}'::date,'${localCurrentDate}'::date,NULL,NULL,false)`);
const attendanceDataB = queryAs(managerB, `SELECT public.hris_get_tenant_attendance_data(
  '${ids.tenantB}'::uuid,'${localCurrentDate}'::date,'${localCurrentDate}'::date,NULL,NULL,false)`);
const attendanceReportA = queryAs(managerA, `SELECT public.hris_get_tenant_attendance_data(
  '${ids.tenantA}'::uuid,'${localCurrentDate}'::date,'${localCurrentDate}'::date,NULL,NULL,true)`);
const attendanceReportOnlyA = queryAs(reportViewerA, `SELECT public.hris_get_tenant_attendance_data(
  '${ids.tenantA}'::uuid,'${localCurrentDate}'::date,'${localCurrentDate}'::date,NULL,NULL,true)`);
const attendanceDetailsReportOnly = attemptAs(reportViewerA, `SELECT public.hris_get_tenant_attendance_data(
  '${ids.tenantA}'::uuid,'${localCurrentDate}'::date,'${localCurrentDate}'::date,NULL,NULL,false)`);
const attendanceReportB = queryAs(managerB, `SELECT public.hris_get_tenant_attendance_data(
  '${ids.tenantB}'::uuid,'${localCurrentDate}'::date,'${localCurrentDate}'::date,NULL,NULL,true)`);
const dashboardTeamReportA = queryAs(managerA, `SELECT public.hris_get_tenant_dashboard_team_report('${ids.tenantA}'::uuid, NULL::date)`);
const dashboardTeamReportB = queryAs(managerB, `SELECT public.hris_get_tenant_dashboard_team_report('${ids.tenantB}'::uuid, NULL::date)`);
const dashboardTeamReportOnly = attemptAs(reportViewerA, `SELECT public.hris_get_tenant_dashboard_team_report('${ids.tenantA}'::uuid, NULL::date)`);
const dashboardTeamReportNoPermission = attemptAs(noPermission, `SELECT public.hris_get_tenant_dashboard_team_report('${ids.tenantA}'::uuid, NULL::date)`);
const dashboardTeamReportCrossTenant = attemptAs(managerB, `SELECT public.hris_get_tenant_dashboard_team_report('${ids.tenantA}'::uuid, NULL::date)`);
const dashboardTeamReportFixtureDate = queryAs(managerA, `SELECT public.hris_get_tenant_dashboard_team_report(
  '${ids.tenantA}'::uuid, '${dashboardReportFixtureDate}'::date)`);
const reportEmployeeA = attendanceReportA.find(row => row.employee_number === 'QA-A-001');
const reportEmployeeB = attendanceReportB.find(row => row.employee_number === 'QA-B-001');
const reportCrossTenantTeam = attendanceReportA.find(row => row.employee_number === 'QA-A-002');
const detailEmployeeA = attendanceDataA.records.find(row => row.employee_number === 'QA-A-001');
const detailCrossTenantTeam = attendanceDataA.records.find(row => row.employee_number === 'QA-A-002');
record('Attendance report resolves same-tenant teams and suppresses cross-tenant team references',
  reportEmployeeA?.team_name === 'QA A Team'
  && reportEmployeeB?.team_name === 'QA B Team'
  && reportCrossTenantTeam?.team_name == null,
  JSON.stringify({ tenantA: reportEmployeeA?.team_name, tenantB: reportEmployeeB?.team_name,
    mismatchedTenantReference: reportCrossTenantTeam?.team_name }));
record('Attendance detail resolves same-tenant teams and suppresses cross-tenant team references',
  detailEmployeeA?.team_name === 'QA A Team'
  && detailCrossTenantTeam?.team_name == null,
  JSON.stringify({ sameTenant: detailEmployeeA?.team_name,
    mismatchedTenantReference: detailCrossTenantTeam?.team_name }));
record('reports.view-only membership can read the aggregate report but not attendance details',
  attendanceReportOnlyA.some(row => row.team_name === 'QA A Team') && !attendanceDetailsReportOnly.ok);
const dashboardTeamA = dashboardTeamReportA.teams.find(row => row.team_name === 'QA A Team');
const dashboardTeamAUnassigned = dashboardTeamReportA.teams.find(row => row.team_name === 'Unassigned');
const dashboardTeamDetailsA = queryAs(managerA, `SELECT public.hris_get_tenant_dashboard_team_details(
  '${ids.tenantA}'::uuid, '${dashboardTeamA.team_id}'::uuid, false, '${localCurrentDate}'::date)`);
const dashboardTeamDetailsUnassigned = queryAs(managerA, `SELECT public.hris_get_tenant_dashboard_team_details(
  '${ids.tenantA}'::uuid, NULL::uuid, true, '${localCurrentDate}'::date)`);
const dashboardTeamDetailsCrossTenant = attemptAs(managerB, `SELECT public.hris_get_tenant_dashboard_team_details(
  '${ids.tenantA}'::uuid, '${dashboardTeamA.team_id}'::uuid, false, '${localCurrentDate}'::date)`);
const dashboardTeamDetailsReportViewer = attemptAs(reportViewerA, `SELECT public.hris_get_tenant_dashboard_team_details(
  '${ids.tenantA}'::uuid, '${dashboardTeamA.team_id}'::uuid, false, '${localCurrentDate}'::date)`);
record('Manager dashboard team report aggregates tenant A counts and groups cross-tenant team references as Unassigned',
  dashboardTeamReportA.dashboard_date === localCurrentDate
  && Number(dashboardTeamA?.total_members) === 5
  && Number(dashboardTeamA?.present_members) === 3
  && Number(dashboardTeamA?.absent_members) === 0
  // The earlier work-mode-only correction changes one fixture from home to office.
  && Number(dashboardTeamA?.work_from_home) === 1
  && Number(dashboardTeamA?.client_meeting) === 1
  && Number(dashboardTeamAUnassigned?.total_members) === 1
  && Number(dashboardTeamAUnassigned?.absent_members) === 1
  && dashboardTeamReportA.teams.every(row => row.team_name !== 'QA B Team'),
  JSON.stringify({ tenantA: dashboardTeamReportA.teams }));
const dashboardTeamB = dashboardTeamReportB.teams.find(row => row.team_name === 'QA B Team');
record('Manager dashboard team report is tenant-scoped and cross-tenant RPC access is denied',
  dashboardTeamReportB.dashboard_date === localCurrentDate
  && dashboardTeamReportB.teams.length === 1
  && Number(dashboardTeamB?.total_members) === 1
  && Number(dashboardTeamB?.present_members) === 1
  && Number(dashboardTeamB?.work_from_office) === 1
  && !dashboardTeamReportCrossTenant.ok);
const dashboardTeamReportFixtureDateTeam = dashboardTeamReportFixtureDate.teams.find(row => row.team_name === 'QA A Team');
record('Manager dashboard team report applies the selected report date to attendance while retaining active team membership totals',
  concurrentAttendanceRecord?.attendance_date === dashboardReportFixtureDate
  && dashboardTeamReportFixtureDate.dashboard_date === dashboardReportFixtureDate
  && Number(dashboardTeamReportFixtureDateTeam?.total_members) === 5
  && Number(dashboardTeamReportFixtureDateTeam?.present_members) === 1
  && Number(dashboardTeamReportFixtureDateTeam?.work_from_office) === 1
  && Number(dashboardTeamReportFixtureDateTeam?.absent_members) === 0,
  JSON.stringify({ dashboard_date: dashboardTeamReportFixtureDate.dashboard_date, team: dashboardTeamReportFixtureDateTeam }));
record('Team detail RPC returns only the selected authorized tenant team and preserves the report contract fields',
  dashboardTeamDetailsA.report_date === localCurrentDate
  && dashboardTeamDetailsA.details.length === Number(dashboardTeamA.total_members)
  && dashboardTeamDetailsA.details.every(row => !('team_id' in row) && !('tenant_id' in row) && !('employee_id' in row))
  && dashboardTeamDetailsA.details.some(row => row.employee_number === 'QA-A-001')
  && dashboardTeamDetailsA.details.every(row => row.employee_number !== 'QA-B-001'),
  JSON.stringify({ count: dashboardTeamDetailsA.details.length, reportDate: dashboardTeamDetailsA.report_date }));
record('Unassigned team detail includes only employees without a same-tenant team join',
  dashboardTeamDetailsUnassigned.report_date === localCurrentDate
  && dashboardTeamDetailsUnassigned.details.length === Number(dashboardTeamAUnassigned.total_members)
  && dashboardTeamDetailsUnassigned.details.every(row => row.employee_number !== 'QA-B-001'),
  JSON.stringify({ employees: dashboardTeamDetailsUnassigned.details.map(row => row.employee_number) }));
record('Team detail RPC denies cross-tenant and dashboard-ineligible report viewers',
  !dashboardTeamDetailsCrossTenant.ok && !dashboardTeamDetailsReportViewer.ok);
record('Team report requires both dashboard and report permissions and returns aggregate-only rows',
  !dashboardTeamReportOnly.ok && !dashboardTeamReportNoPermission.ok
  && dashboardTeamReportA.teams.every(row => !('employee_name' in row) && !('employee_id' in row)));
const leaveDataB = queryAs(managerB, `SELECT public.hris_get_tenant_leave_data('${ids.tenantB}'::uuid,NULL,NULL)`);
const leaveWindowB = queryAs(managerB, `SELECT public.hris_get_tenant_leave_data(
  '${ids.tenantB}'::uuid,'2026-10-20'::date,'2026-10-20'::date)`);
const leaveOverlapB = queryAs(managerB, `SELECT public.hris_get_tenant_leave_data(
  '${ids.tenantB}'::uuid,'2026-10-18'::date,'2026-10-19'::date)`);
const leaveViewWindowB = queryAs(tenantViewer, `SELECT public.hris_get_tenant_leave_data(
  '${ids.tenantB}'::uuid,'2026-10-18'::date,'2026-10-19'::date)`);
const leaveInvalidWindowB = queryAs(managerB, `SELECT public.hris_get_tenant_leave_data(
  '${ids.tenantB}'::uuid,'2026-10-21'::date,'2026-10-19'::date)`);
record('Tenant B dashboard, attendance and leave RPCs return tenant B data only',
  Number(dashboardB.employees) === 1
  && dashboardB.dashboard_date === localCurrentDate
  && Number(dashboardB.team_members) === 1
  && Number(dashboardB.present_today) === 1
  && Number(dashboardB.wfo_today) === 1
  && Number(dashboardB.absent_today) === 0
  && Number(dashboardB.on_leave_today) === 0
  && attendanceDataB.records.length === 1
  && attendanceDataB.records[0].tenant_id === ids.tenantB
  && attendanceDataB.records[0].team_name === 'QA B Team'
  && leaveDataB.requests.length === 2
  && leaveDataB.requests.every(request => request.tenant_id === ids.tenantB));
record('Leave date filters include overlapping dates, honor the upper/lower bounds, and preserve leave.view access',
  leaveWindowB.requests.length === 1
  && leaveWindowB.requests[0].id === ids.leaveTenantBViewer
  && leaveWindowB.requests.every(request => request.tenant_id === ids.tenantB)
  && leaveOverlapB.requests.length === 1
  && leaveOverlapB.requests[0].id === ids.leaveTenantB
  && leaveViewWindowB.requests.length === 1
  && leaveViewWindowB.requests[0].id === ids.leaveTenantB
  && leaveInvalidWindowB.requests.length === 0);
const dashboardAValid = Number(dashboardA.team_members) === 6
  && dashboardA.dashboard_date === localCurrentDate
  && Number(dashboardA.attendance_today) === 5
  && Number(dashboardA.present_today) === 3
  && Number(dashboardA.absent_today) === 1
  && Number(dashboardA.wfo_today) === 3
  && Number(dashboardA.wfh_today) === 1
  && Number(dashboardA.client_meeting_today) === 1
  && Number(dashboardA.on_leave_today) === 1
  && Number(dashboardA.late_today) === 1
  && dashboardA.attendance_last_7_days.length === 7
  && dashboardA.attendance_last_30_days.length === 30;
record('Tenant A dashboard counts explicit attendance modes/statuses and approved leave only',
  dashboardAValid, dashboardAValid ? '' : JSON.stringify(dashboardA));

const crossDashboard = attemptAs(managerB, `SELECT public.hris_get_tenant_dashboard_summary('${ids.tenantA}'::uuid)`);
const crossAttendanceData = attemptAs(managerB, `SELECT public.hris_get_tenant_attendance_data(
  '${ids.tenantA}'::uuid,'2026-10-12'::date,'2026-10-12'::date,NULL,NULL,false)`);
const crossLeaveData = attemptAs(managerB, `SELECT public.hris_get_tenant_leave_data('${ids.tenantA}'::uuid,NULL,NULL)`);
record('Tenant B manager cannot call dashboard, attendance or leave RPCs for tenant A',
  !crossDashboard.ok && !crossAttendanceData.ok && !crossLeaveData.ok);

const viewerAttendance = queryAs(tenantViewer, `SELECT coalesce(jsonb_agg(tenant_id ORDER BY tenant_id),'[]'::jsonb)
  FROM (SELECT DISTINCT tenant_id FROM public.attendance_records) visible`);
const viewerLeaves = queryAs(tenantViewer, `SELECT coalesce(jsonb_agg(tenant_id ORDER BY tenant_id),'[]'::jsonb)
  FROM (SELECT DISTINCT tenant_id FROM public.leave_requests) visible`);
const viewerPermission = queryAs(tenantViewer, `SELECT jsonb_build_object(
  'view',public.has_tenant_permission('${ids.tenantB}'::uuid,'leave.view'),
  'manage',public.has_tenant_permission('${ids.tenantB}'::uuid,'leave.manage'))`);
record('Tenant viewer reads only tenant B records and lacks leave management',
  new Set(viewerAttendance).size === 1 && viewerAttendance.includes(ids.tenantB)
  && new Set(viewerLeaves).size === 1 && viewerLeaves.includes(ids.tenantB)
  && viewerPermission.view === true && viewerPermission.manage === false);

const viewerDecision = attemptAs(tenantViewer, `SELECT public.admin_resolve_leave_request(
  '${ids.leaveTenantBViewer}'::uuid,'approved',NULL)::jsonb`);
record('Tenant viewer cannot approve a leave request in their own tenant', !viewerDecision.ok
  && tableRow('leave_requests', ids.leaveTenantBViewer).status === 'pending');

const crossLeave = attemptAs(managerB, `SELECT public.admin_resolve_leave_request(
  '${ids.leaveCrossTenant}'::uuid,'approved','must remain denied')::jsonb`);
const crossLeaveRow = tableRow('leave_requests', ids.leaveCrossTenant);
record('Tenant B manager is denied a tenant A leave decision', !crossLeave.ok
  && crossLeaveRow.status === 'pending', crossLeave.ok ? 'unexpectedly resolved' : 'denied');

const crossAttendance = attemptAs(managerB, `SELECT public.admin_resolve_attendance_correction(
  '${ids.attendanceCrossTenant}'::uuid,'approved','must remain denied')::jsonb`);
const crossCorrectionRow = tableRow('attendance_corrections', ids.attendanceCrossTenant);
record('Tenant B manager is denied a tenant A attendance decision', !crossAttendance.ok
  && crossCorrectionRow.status === 'pending', crossAttendance.ok ? 'unexpectedly resolved' : 'denied');

const ownTenantB = attemptAs(managerB, `SELECT public.admin_resolve_leave_request(
  '${ids.leaveTenantB}'::uuid,'approved',NULL)::jsonb`);
record('Tenant B manager can resolve a request in their own tenant', ownTenantB.ok,
  ownTenantB.ok ? '' : 'active tenant membership role was not accepted');

const tenantBLeaveRow = tableRow('leave_requests', ids.leaveTenantB);
const tenantBLeaveBalance = queryAdmin(`SELECT to_jsonb(b) FROM public.employee_leave_balances b
  WHERE tenant_id='${ids.tenantB}'::uuid AND employee_id='66666666-6666-4666-8666-666666666666'
    AND leave_type_id='${ids.leaveTypeB}'::uuid AND balance_year=2026`);
record('Tenant B approval updates only its own ledger and audit record',
  ownTenantB.ok && tenantBLeaveRow.tenant_id === ids.tenantB
  && tenantBLeaveRow.status === 'approved'
  && Number(tenantBLeaveBalance.pending_days) === 1
  && Number(tenantBLeaveBalance.used_days) === 1
  && auditCount(ids.leaveTenantB, 'leave.request.approved') === 1);

const ownAttendanceB = resolveAttendance(managerB, ids.attendanceCorrectionB, 'approved');
const tenantBAttendance = tableRow('attendance_records', 'bbbbbbbb-0000-4000-8000-000000000002');
record('Tenant B manager can approve its own correction while preserving other punch fields',
  ownAttendanceB.success === true
  && sameInstant(tenantBAttendance.check_in, `${localCurrentDate}T03:10:00Z`)
  && sameInstant(tenantBAttendance.check_out, `${localCurrentDate}T11:30:00Z`)
  && tenantBAttendance.work_mode === 'office'
  && auditCount(ids.attendanceCorrectionB, 'attendance.correction.approved') === 1,
  ownAttendanceB.success === true ? JSON.stringify(tenantBAttendance) : 'correction was rejected');

async function createProject(session, tenantId, code, leadId) {
  return session.client.rpc('hris_create_tenant_project', {
    p_tenant_id: tenantId,
    p_code: code,
    p_name: `Synthetic ${code}`,
    p_client_name: 'QA client',
    p_description: 'Disposable project allocation acceptance fixture.',
    p_project_lead_id: leadId,
    p_start_date: localCurrentDate,
    p_target_end_date: localCurrentDate,
    p_status: 'active',
  });
}

psqlSync(`UPDATE public.tenants SET timezone='Pacific/Honolulu' WHERE id='${ids.tenantB}'::uuid;`);
const deniedProjectA = await createProject(managerA, ids.tenantA, 'QA-A-DENIED', '55555555-5555-4555-8555-555555555555');
const deniedProjectB = await createProject(managerB, ids.tenantB, 'QA-B-DENIED', '66666666-6666-4666-8666-666666666666');
const projectsAfterDeniedCreate = queryAdmin(`SELECT jsonb_build_object(
  'tenant_a',(SELECT count(*)::integer FROM public.projects WHERE tenant_id='${ids.tenantA}'::uuid),
  'tenant_b',(SELECT count(*)::integer FROM public.projects WHERE tenant_id='${ids.tenantB}'::uuid))`);
record('Ordinary Admin cannot create a project or appoint its Project Manager',
  deniedProjectA.error?.code === '42501' && projectsAfterDeniedCreate.tenant_a === 0);
record('Ordinary Manager cannot create a project or appoint its Project Manager',
  deniedProjectB.error?.code === '42501' && projectsAfterDeniedCreate.tenant_b === 0);

const projectAResult = await createProject(superAdmin, ids.tenantA, 'QA-A-ALPHA', '55555555-5555-4555-8555-555555555555');
const projectA2Result = await createProject(superAdmin, ids.tenantA, 'QA-A-BETA', '55555555-5555-4555-8555-555555555555');
const projectA3Result = await createProject(superAdmin, ids.tenantA, 'QA-A-GAMMA', '55555555-5555-4555-8555-555555555555');
const projectBResult = await createProject(superAdmin, ids.tenantB, 'QA-B-ALPHA', '66666666-6666-4666-8666-666666666666');
const projectB2Result = await createProject(superAdmin, ids.tenantB, 'QA-B-BETA', '66666666-6666-4666-8666-666666666666');
const projectA = projectAResult.data;
const projectA2 = projectA2Result.data;
const projectA3 = projectA3Result.data;
const projectB = projectBResult.data;
const projectB2 = projectB2Result.data;
record('Active Super Admin creates tenant projects and appoints active employee Project Managers',
  !projectAResult.error && !projectBResult.error
    && projectA?.tenant_id === ids.tenantA && projectB?.tenant_id === ids.tenantB
    && projectA?.project_lead_id === '55555555-5555-4555-8555-555555555555'
    && auditCount(projectA?.id, 'project.created') === 1
    && auditCount(projectB?.id, 'project.created') === 1);

const noPermissionProject = await createProject(noPermission, ids.tenantA, 'QA-NO-PERM', '55555555-5555-4555-8555-555555555555');
const managerBProjectA = await managerB.client.rpc('hris_get_tenant_project_workspace', { p_tenant_id: ids.tenantA });
const globalOnlyProjectA = await globalOnly.client.rpc('hris_get_tenant_project_workspace', { p_tenant_id: ids.tenantA });
const superAdminWorkspace = await superAdmin.client.rpc('hris_get_tenant_project_workspace', { p_tenant_id: ids.tenantA });
const anonymousProjectRead = attemptAs(null,
  `SELECT public.hris_get_tenant_project_workspace('${ids.tenantA}'::uuid)`, 'anon');
record('Project workspace denies unauthorized users and marks Super Admin creation capability',
  Boolean(noPermissionProject.error) && Boolean(managerBProjectA.error)
    && Boolean(globalOnlyProjectA.error) && !anonymousProjectRead.ok
    && !superAdminWorkspace.error && superAdminWorkspace.data.can_create === true);

const workspaceA = await managerA.client.rpc('hris_get_tenant_project_workspace', { p_tenant_id: ids.tenantA });
const workspaceB = await managerB.client.rpc('hris_get_tenant_project_workspace', { p_tenant_id: ids.tenantB });
const projectManagerWorkspaceA = await employeeA.client.rpc('hris_get_tenant_project_workspace', { p_tenant_id: ids.tenantA });
const projectManagerWorkspaceB = await employeeB.client.rpc('hris_get_tenant_project_workspace', { p_tenant_id: ids.tenantB });
const directProjectsA = await managerA.client.from('projects').select('id,tenant_id').eq('tenant_id', ids.tenantA);
const directProjectsB = await managerB.client.from('projects').select('id,tenant_id').eq('tenant_id', ids.tenantA);
const directProjectsSuperAdmin = await superAdmin.client.from('projects').select('id,tenant_id').eq('tenant_id', ids.tenantA);
const directProjectsProjectManager = await employeeA.client.from('projects').select('id,tenant_id').eq('tenant_id', ids.tenantA);
const projectLeadUpdateAttempts = await Promise.all([
  managerA.client.from('projects').update({ project_lead_id: '55555555-5555-4555-8555-555555555556' }).eq('tenant_id', ids.tenantA).eq('id', projectA.id).select('id'),
  managerB.client.from('projects').update({ project_lead_id: '66666666-6666-4666-8666-666666666667' }).eq('tenant_id', ids.tenantB).eq('id', projectB.id).select('id'),
  employeeA.client.from('projects').update({ project_lead_id: '55555555-5555-4555-8555-555555555556' }).eq('tenant_id', ids.tenantA).eq('id', projectA.id).select('id'),
  superAdmin.client.from('projects').update({ project_lead_id: '55555555-5555-4555-8555-555555555556' }).eq('tenant_id', ids.tenantA).eq('id', projectA.id).select('id'),
]);
const projectLeadAfterAttempts = queryAdmin(`SELECT jsonb_build_object('lead',project_lead_id::text)
  FROM public.projects WHERE tenant_id='${ids.tenantA}'::uuid AND id='${projectA.id}'::uuid`);
record('No authenticated Admin, Manager, Project Manager, or Super Admin can appoint a manager by direct table write',
  projectLeadUpdateAttempts.every(result => Boolean(result.error))
    && projectLeadAfterAttempts.lead === '55555555-5555-4555-8555-555555555555');
record('Organization readers retain tenant scope; assigned Project Managers see and manage only their projects',
  !workspaceA.error && !workspaceB.error
    && workspaceA.data.projects.length === 3 && workspaceB.data.projects.length === 2
    && workspaceA.data.can_create === false && workspaceA.data.projects.every(project => project.can_manage === false)
    && workspaceB.data.can_create === false && workspaceB.data.projects.every(project => project.can_manage === false)
    && superAdminWorkspace.data.projects.every(project => project.can_manage === false)
    && !projectManagerWorkspaceA.error && projectManagerWorkspaceA.data.projects.length === 3
    && projectManagerWorkspaceA.data.can_create === false
    && projectManagerWorkspaceA.data.projects.every(project => project.can_manage === true)
    && !projectManagerWorkspaceB.error && projectManagerWorkspaceB.data.projects.length === 2
    && projectManagerWorkspaceB.data.can_create === false
    && projectManagerWorkspaceB.data.projects.every(project => project.can_manage === true)
    && !directProjectsSuperAdmin.error && directProjectsSuperAdmin.data.length === 3
    && !directProjectsProjectManager.error && directProjectsProjectManager.data.length === 3
    && !directProjectsA.error && directProjectsA.data.every(row => row.tenant_id === ids.tenantA)
    && !directProjectsB.error && directProjectsB.data.length === 0,
  JSON.stringify({
    managerA: workspaceA.error ? workspaceA.error.message : { count: workspaceA.data.projects.length, can_create: workspaceA.data.can_create, can_manage: workspaceA.data.projects.map(project => project.can_manage) },
    managerB: workspaceB.error ? workspaceB.error.message : { count: workspaceB.data.projects.length },
    projectManagerA: projectManagerWorkspaceA.error ? projectManagerWorkspaceA.error.message : { count: projectManagerWorkspaceA.data.projects.length, can_manage: projectManagerWorkspaceA.data.projects.map(project => project.can_manage) },
    projectManagerB: projectManagerWorkspaceB.error ? projectManagerWorkspaceB.error.message : { count: projectManagerWorkspaceB.data.projects.length, can_manage: projectManagerWorkspaceB.data.projects.map(project => project.can_manage) },
  }));

const superAdminMemberAssignment = await superAdmin.client.rpc('hris_assign_tenant_project_allocation', {
  p_tenant_id: ids.tenantB, p_project_id: projectB.id,
  p_employee_id: '55555555-5555-4555-8555-555555555555',
  p_role_on_project: 'Unauthorized', p_allocation_percentage: 5,
  p_assigned_date: localCurrentDate, p_release_date: null,
});
const superAdminMemberRelease = await superAdmin.client.rpc('hris_release_tenant_project_allocation', {
  p_tenant_id: ids.tenantA, p_allocation_id: '99999999-9999-4999-8999-999999999999',
});
record('Super Admin project creation does not grant project membership management',
  superAdminMemberAssignment.error?.code === '42501' && superAdminMemberRelease.error?.code === '42501');

const otherProjectManagerResult = await createProject(superAdmin, ids.tenantA,
  'QA-A-OTHER-PM', '55555555-5555-4555-8555-555555555560');
const otherProjectManagerProject = otherProjectManagerResult.data;
const otherProjectManagerWorkspace = await employeeClock.client.rpc('hris_get_tenant_project_workspace', {
  p_tenant_id: ids.tenantA,
});
const otherManagerAdd = await employeeClock.client.rpc('hris_assign_tenant_project_allocation', {
  p_tenant_id: ids.tenantA, p_project_id: otherProjectManagerProject?.id,
  p_employee_id: '55555555-5555-4555-8555-555555555557',
  p_role_on_project: 'Contributor', p_allocation_percentage: 25,
  p_assigned_date: localCurrentDate, p_release_date: null,
});
const assignedManagerAUnauthorizedAdd = await employeeA.client.rpc('hris_assign_tenant_project_allocation', {
  p_tenant_id: ids.tenantA, p_project_id: otherProjectManagerProject?.id,
  p_employee_id: '55555555-5555-4555-8555-555555555558',
  p_role_on_project: 'Unauthorized', p_allocation_percentage: 10,
  p_assigned_date: localCurrentDate, p_release_date: null,
});
const assignedManagerAUnauthorizedRelease = await employeeA.client.rpc('hris_release_tenant_project_allocation', {
  p_tenant_id: ids.tenantA, p_allocation_id: otherManagerAdd.data?.id,
});
const actualOtherManagerRelease = await employeeClock.client.rpc('hris_release_tenant_project_allocation', {
  p_tenant_id: ids.tenantA, p_allocation_id: otherManagerAdd.data?.id,
});
record('A Project Manager can add/release only members on projects they manage in the same tenant',
  !otherProjectManagerResult.error && !otherProjectManagerWorkspace.error
    && otherProjectManagerWorkspace.data.projects.length === 1
    && otherProjectManagerWorkspace.data.projects[0].id === otherProjectManagerProject?.id
    && otherProjectManagerWorkspace.data.projects[0].can_manage === true
    && !otherManagerAdd.error
    && assignedManagerAUnauthorizedAdd.error?.code === '42501'
    && assignedManagerAUnauthorizedRelease.error?.code === '42501'
    && !actualOtherManagerRelease.error && actualOtherManagerRelease.data?.status === 'released');

const projectDirectWrite = attemptAs(managerA, `INSERT INTO public.projects
  (tenant_id,code,name,project_lead_id,start_date) VALUES
  ('${ids.tenantA}'::uuid,'QA-DIRECT','Direct write','55555555-5555-4555-8555-555555555555','${localCurrentDate}'::date)`);
record('Authenticated users cannot bypass audited project RPCs with direct table writes', !projectDirectWrite.ok);

psqlSync(`UPDATE public.employees SET employment_status='on_leave'
  WHERE tenant_id='${ids.tenantA}'::uuid AND id='55555555-5555-4555-8555-555555555555'::uuid;`);
const allocationA60 = await employeeA.client.rpc('hris_assign_tenant_project_allocation', {
  p_tenant_id: ids.tenantA, p_project_id: projectA.id,
  p_employee_id: '55555555-5555-4555-8555-555555555555',
  p_role_on_project: 'Delivery lead', p_allocation_percentage: 60,
  p_assigned_date: localCurrentDate, p_release_date: null,
});
const allocationA40 = await employeeA.client.rpc('hris_assign_tenant_project_allocation', {
  p_tenant_id: ids.tenantA, p_project_id: projectA2.id,
  p_employee_id: '55555555-5555-4555-8555-555555555555',
  p_role_on_project: 'Contributor', p_allocation_percentage: 40,
  p_assigned_date: localCurrentDate, p_release_date: null,
});
const allocationAOver = await employeeA.client.rpc('hris_assign_tenant_project_allocation', {
  p_tenant_id: ids.tenantA, p_project_id: projectA3.id,
  p_employee_id: '55555555-5555-4555-8555-555555555555',
  p_role_on_project: 'Contributor', p_allocation_percentage: 1,
  p_assigned_date: localCurrentDate, p_release_date: null,
});
const foreignEmployeeAllocation = await employeeA.client.rpc('hris_assign_tenant_project_allocation', {
  p_tenant_id: ids.tenantA, p_project_id: projectA.id,
  p_employee_id: '66666666-6666-4666-8666-666666666666',
  p_role_on_project: 'Contributor', p_allocation_percentage: 10,
  p_assigned_date: localCurrentDate, p_release_date: null,
});
record('Assigned Project Manager can add members across projects within the shared 100% overlap cap',
  !allocationA60.error && !allocationA40.error
    && Boolean(allocationAOver.error) && Boolean(foreignEmployeeAllocation.error)
    && auditCount(allocationA60.data?.id, 'project.allocation.assigned') === 1
    && auditCount(allocationA40.data?.id, 'project.allocation.assigned') === 1);

// Project-scoped timesheet acceptance: one employee, two projects, two assigned
// Project Managers. All test identities and records exist only in local Postgres.
psqlSync(`INSERT INTO public.timesheet_activities(id,tenant_id,activity_type,name,code,active) VALUES
  ('88888888-8888-4888-8888-888888888904','${ids.tenantA}'::uuid,'project','QA Project Work','QA-PROJECT',true)
  ON CONFLICT (tenant_id,code) DO UPDATE SET activity_type='project',active=true;`);
const submitterProjectAllocationA = await employeeA.client.rpc('hris_assign_tenant_project_allocation', {
  p_tenant_id: ids.tenantA, p_project_id: projectA.id, p_employee_id: '55555555-5555-4555-8555-555555555556',
  p_role_on_project: 'QA contributor', p_allocation_percentage: 50,
  p_assigned_date: localCurrentDate, p_release_date: null,
});
const submitterProjectAllocationB = await employeeClock.client.rpc('hris_assign_tenant_project_allocation', {
  p_tenant_id: ids.tenantA, p_project_id: otherProjectManagerProject.id, p_employee_id: '55555555-5555-4555-8555-555555555556',
  p_role_on_project: 'QA contributor', p_allocation_percentage: 50,
  p_assigned_date: localCurrentDate, p_release_date: null,
});
const projectHourEntries = [
  { activity_id: '88888888-8888-4888-8888-888888888904', project_allocation_id: submitterProjectAllocationA.data?.id,
    work_date: localCurrentDate, hours: 2, note: 'Synthetic project A hours' },
  { activity_id: '88888888-8888-4888-8888-888888888904', project_allocation_id: submitterProjectAllocationB.data?.id,
    work_date: localCurrentDate, hours: 3, note: 'Synthetic project B hours' },
];
const projectTimesheet = saveTimesheet(managerA2, ids.tenantA, null, 'daily', localCurrentDate, localCurrentDate, projectHourEntries);
const draftVersionedUpdate = queryAs(managerA2, `SELECT jsonb_build_object('id',public.hris_save_my_timesheet(
  '${ids.tenantA}'::uuid,'${projectTimesheet.id}'::uuid,'daily','${localCurrentDate}'::date,'${localCurrentDate}'::date,
  '${JSON.stringify(projectHourEntries)}'::jsonb,1))`);
const staleDraftUpdate = attemptAs(managerA2, `SELECT public.hris_save_my_timesheet(
  '${ids.tenantA}'::uuid,'${projectTimesheet.id}'::uuid,'daily','${localCurrentDate}'::date,'${localCurrentDate}'::date,
  '${JSON.stringify(projectHourEntries)}'::jsonb,1)`);
const invalidNoAllocation = attemptAs(managerA2, `SELECT public.hris_save_my_timesheet(
  '${ids.tenantA}'::uuid,NULL,'daily','${localCurrentDate}'::date,'${localCurrentDate}'::date,
  '[{"activity_id":"88888888-8888-4888-8888-888888888904","work_date":"${localCurrentDate}","hours":1}]'::jsonb)`);
const invalidForeignAllocation = attemptAs(managerA2, `SELECT public.hris_save_my_timesheet(
  '${ids.tenantA}'::uuid,NULL,'daily','${localCurrentDate}'::date,'${localCurrentDate}'::date,
  '${JSON.stringify([{ ...projectHourEntries[0], project_allocation_id: allocationA60.data?.id }])}'::jsonb)`);
const previousWorkDate = addCalendarDays(localCurrentDate, -1);
const invalidAllocationDate = attemptAs(managerA2, `SELECT public.hris_save_my_timesheet(
  '${ids.tenantA}'::uuid,NULL,'daily','${previousWorkDate}'::date,'${previousWorkDate}'::date,
  '${JSON.stringify([{ ...projectHourEntries[0], work_date: previousWorkDate }])}'::jsonb)`);
const projectSubmission = submitTimesheet(managerA2, ids.tenantA, projectTimesheet.id);
const projectReviewRows = queryAdmin(`SELECT jsonb_build_object('count',count(*)::integer)
  FROM public.timesheet_project_reviews WHERE tenant_id='${ids.tenantA}'::uuid AND timesheet_id='${projectTimesheet.id}'::uuid`);
record('New project hours require a verified employee allocation and optimistic draft version; submit creates two independent reviews',
  !submitterProjectAllocationA.error && !submitterProjectAllocationB.error
    && draftVersionedUpdate.id === projectTimesheet.id && !staleDraftUpdate.ok
    && !invalidNoAllocation.ok && !invalidForeignAllocation.ok && !invalidAllocationDate.ok
    && projectSubmission.id === projectTimesheet.id && projectReviewRows.count === 2);

const projectInboxA = await employeeA.client.rpc('hris_get_my_project_timesheet_reviews', { p_tenant_id: ids.tenantA });
const projectInboxB = await employeeClock.client.rpc('hris_get_my_project_timesheet_reviews', { p_tenant_id: ids.tenantA });
const projectInboxCrossTenant = await employeeA.client.rpc('hris_get_my_project_timesheet_reviews', { p_tenant_id: ids.tenantB });
const projectInboxOrdinaryAdmin = await managerA.client.rpc('hris_get_my_project_timesheet_reviews', { p_tenant_id: ids.tenantA });
const directProjectReviewRead = attemptAs(employeeA, `SELECT count(*) FROM public.timesheet_project_reviews`);
const directTimesheetRead = attemptAs(employeeA, `SELECT count(*) FROM public.timesheets`);
const directTimesheetEntryWrite = attemptAs(employeeA, `INSERT INTO public.timesheet_entries(timesheet_id,activity_id,work_date,hours)
  VALUES ('${projectTimesheet.id}'::uuid,'88888888-8888-4888-8888-888888888904'::uuid,'${localCurrentDate}'::date,1)`);
record('Project review inbox is visible only through active-tenant Project Manager RPCs and table reads remain denied',
  !projectInboxA.error && !projectInboxB.error && projectInboxA.data.reviews.length === 1
    && projectInboxA.data.reviews[0].project_id === projectA.id
    && projectInboxB.data.reviews.length === 1 && projectInboxB.data.reviews[0].project_id === otherProjectManagerProject.id
    && Boolean(projectInboxCrossTenant.error) && Boolean(projectInboxOrdinaryAdmin.error)
    && !directProjectReviewRead.ok && !directTimesheetRead.ok && !directTimesheetEntryWrite.ok);

const rejectWithoutReason = attemptAs(employeeClock, `SELECT public.hris_resolve_project_timesheet(
  '${ids.tenantA}'::uuid,'${projectTimesheet.id}'::uuid,'${otherProjectManagerProject.id}'::uuid,1,'rejected',NULL)`);
const nonManagerReview = attemptAs(managerA2, `SELECT public.hris_resolve_project_timesheet(
  '${ids.tenantA}'::uuid,'${projectTimesheet.id}'::uuid,'${projectA.id}'::uuid,1,'approved',NULL)`);
const missingRevisionReview = attemptAs(employeeA, `SELECT public.hris_resolve_project_timesheet(
  '${ids.tenantA}'::uuid,'${projectTimesheet.id}'::uuid,'${projectA.id}'::uuid,NULL,'approved',NULL)`);
const crossProjectReview = attemptAs(employeeA, `SELECT public.hris_resolve_project_timesheet(
  '${ids.tenantA}'::uuid,'${projectTimesheet.id}'::uuid,'${otherProjectManagerProject.id}'::uuid,1,'approved',NULL)`);
const crossTenantReview = attemptAs(employeeA, `SELECT public.hris_resolve_project_timesheet(
  '${ids.tenantB}'::uuid,'${projectTimesheet.id}'::uuid,'${projectB.id}'::uuid,1,'approved',NULL)`);
const approveProjectA = resolveProjectTimesheet(employeeA, ids.tenantA, projectTimesheet.id, projectA.id, 1, 'approved');
const duplicateProjectDecision = attemptAs(employeeA, `SELECT public.hris_resolve_project_timesheet(
  '${ids.tenantA}'::uuid,'${projectTimesheet.id}'::uuid,'${projectA.id}'::uuid,1,'approved',NULL)`);
const statusAfterFirstDecision = queryAdmin(`SELECT jsonb_build_object('status',status) FROM public.timesheets WHERE id='${projectTimesheet.id}'::uuid`).status;
const projectAEntryBeforeCorrection = queryAdmin(`SELECT jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.id),'[]'::jsonb))
  FROM public.timesheet_entries e
  JOIN public.project_allocations a ON a.id=e.project_allocation_id
  WHERE e.timesheet_id='${projectTimesheet.id}'::uuid AND a.project_id='${projectA.id}'::uuid`).rows;
record('Only each appointed Project Manager may decide their own project portion; rejection reason and duplicate-decision rules hold',
  !approveProjectA.error && approveProjectA.status === 'approved' && statusAfterFirstDecision === 'submitted'
    && Boolean(rejectWithoutReason.error) && Boolean(nonManagerReview.error) && Boolean(missingRevisionReview.error)
    && Boolean(crossProjectReview.error) && Boolean(crossTenantReview.error)
    && !duplicateProjectDecision.ok && projectAEntryBeforeCorrection.length === 1);

const rejectProjectB = resolveProjectTimesheet(employeeClock, ids.tenantA, projectTimesheet.id,
  otherProjectManagerProject.id, 1, 'rejected', 'Correct project B hours.');
const overallRejected = queryAdmin(`SELECT jsonb_build_object('status',status) FROM public.timesheets WHERE id='${projectTimesheet.id}'::uuid`).status;
const rejectedProjectBEntries = [{ ...projectHourEntries[1], hours: 4, note: 'Synthetic corrected project B hours' }];
const resubmittedProjectB = resubmitRejectedProjectTimesheet(managerA2, ids.tenantA, projectTimesheet.id,
  otherProjectManagerProject.id, 1, rejectedProjectBEntries);
const staleProjectBResubmit = attemptAs(managerA2, `SELECT public.hris_resubmit_rejected_project_timesheet(
  '${ids.tenantA}'::uuid,'${projectTimesheet.id}'::uuid,'${otherProjectManagerProject.id}'::uuid,1,
  '${JSON.stringify(rejectedProjectBEntries)}'::jsonb)`);
const approvedProjectEdit = attemptAs(managerA2, `SELECT public.hris_resubmit_rejected_project_timesheet(
  '${ids.tenantA}'::uuid,'${projectTimesheet.id}'::uuid,'${projectA.id}'::uuid,1,
  '${JSON.stringify([projectHourEntries[0]])}'::jsonb)`);
const projectAEntryAfterCorrection = queryAdmin(`SELECT jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.id),'[]'::jsonb))
  FROM public.timesheet_entries e
  JOIN public.project_allocations a ON a.id=e.project_allocation_id
  WHERE e.timesheet_id='${projectTimesheet.id}'::uuid AND a.project_id='${projectA.id}'::uuid`).rows;
const projectBReviewAfterCorrection = queryAdmin(`SELECT jsonb_build_object('status',status,'revision',revision)
  FROM public.timesheet_project_reviews WHERE tenant_id='${ids.tenantA}'::uuid
    AND timesheet_id='${projectTimesheet.id}'::uuid AND project_id='${otherProjectManagerProject.id}'::uuid`);
record('Rejected resubmission changes only that project, preserves approved rows, increments revision, and rejects stale/approved edits',
  !rejectProjectB.error && overallRejected === 'rejected' && !resubmittedProjectB.error
    && !staleProjectBResubmit.ok && !approvedProjectEdit.ok
    && JSON.stringify(projectAEntryAfterCorrection) === JSON.stringify(projectAEntryBeforeCorrection)
    && projectBReviewAfterCorrection.status === 'pending' && projectBReviewAfterCorrection.revision === 2
    && queryAdmin(`SELECT jsonb_build_object('status',status) FROM public.timesheets WHERE id='${projectTimesheet.id}'::uuid`).status === 'submitted');
const approveProjectBRevision2 = resolveProjectTimesheet(employeeClock, ids.tenantA, projectTimesheet.id,
  otherProjectManagerProject.id, 2, 'approved');
const finalProjectTimesheetState = queryAdmin(`SELECT jsonb_build_object(
  'status',t.status,
  'project_a',(SELECT status FROM public.timesheet_project_reviews WHERE timesheet_id=t.id AND project_id='${projectA.id}'::uuid),
  'project_b',(SELECT status FROM public.timesheet_project_reviews WHERE timesheet_id=t.id AND project_id='${otherProjectManagerProject.id}'::uuid),
  'events',(SELECT count(*)::integer FROM public.timesheet_project_review_events WHERE timesheet_id=t.id),
  'review_audit',(SELECT count(*)::integer FROM public.admin_audit_logs WHERE target_type='timesheet_project_review'
    AND details->>'timesheet_id'=t.id::text)) FROM public.timesheets t WHERE t.id='${projectTimesheet.id}'::uuid`);
record('All project portions must pass before overall approval, with append-only decision and correction audit history',
  !approveProjectBRevision2.error && finalProjectTimesheetState.status === 'approved'
    && finalProjectTimesheetState.project_a === 'approved' && finalProjectTimesheetState.project_b === 'approved'
    && finalProjectTimesheetState.events === 6 && finalProjectTimesheetState.review_audit === 4);

const mixedProjectTimesheet = saveTimesheet(managerA2, ids.tenantA, null, 'weekly', previousWorkDate, localCurrentDate, [
  projectHourEntries[0], { activity_id: '88888888-8888-4888-8888-888888888901', work_date: localCurrentDate, hours: 1,
    note: 'Synthetic unlinked non-project work' },
]);
submitTimesheet(managerA2, ids.tenantA, mixedProjectTimesheet.id);
const mixedProjectReview = queryAdmin(`SELECT jsonb_build_object('id',project_id::text)
  FROM public.timesheet_project_reviews WHERE timesheet_id='${mixedProjectTimesheet.id}'::uuid`).id;
resolveProjectTimesheet(employeeA, ids.tenantA, mixedProjectTimesheet.id, mixedProjectReview, 1, 'approved');
record('Non-project hours remain submitted after project approval because no non-project approval authority is defined',
  queryAdmin(`SELECT jsonb_build_object('status',status) FROM public.timesheets WHERE id='${mixedProjectTimesheet.id}'::uuid`).status === 'submitted'
    && queryAdmin(`SELECT jsonb_build_object('count',count(*)::integer) FROM public.timesheet_project_reviews WHERE timesheet_id='${mixedProjectTimesheet.id}'::uuid`).count === 1);

const concurrentProjectTimesheet = saveTimesheet(managerA2, ids.tenantA, null, 'weekly', localCurrentDate,
  addCalendarDays(localCurrentDate, 1),
  [projectHourEntries[0]]);
submitTimesheet(managerA2, ids.tenantA, concurrentProjectTimesheet.id);
const concurrentProjectDecisions = await Promise.allSettled([
  psqlAsync(sessionSql(employeeA, `SELECT public.hris_resolve_project_timesheet(
    '${ids.tenantA}'::uuid,'${concurrentProjectTimesheet.id}'::uuid,'${projectA.id}'::uuid,1,'approved',NULL)::jsonb`)),
  psqlAsync(sessionSql(employeeA, `SELECT public.hris_resolve_project_timesheet(
    '${ids.tenantA}'::uuid,'${concurrentProjectTimesheet.id}'::uuid,'${projectA.id}'::uuid,1,'approved',NULL)::jsonb`)),
]);
const concurrentProjectState = queryAdmin(`SELECT jsonb_build_object(
  'timesheet_status',t.status,
  'review_status',(SELECT r.status FROM public.timesheet_project_reviews r WHERE r.tenant_id=t.tenant_id AND r.timesheet_id=t.id AND r.project_id='${projectA.id}'::uuid),
  'events',(SELECT count(*)::integer FROM public.timesheet_project_review_events ev WHERE ev.tenant_id=t.tenant_id AND ev.timesheet_id=t.id),
  'audit',(SELECT count(*)::integer FROM public.admin_audit_logs a WHERE a.target_type='timesheet_project_review'
    AND a.details->>'timesheet_id'=t.id::text AND a.action='timesheet.project.approved'))
  FROM public.timesheets t WHERE t.tenant_id='${ids.tenantA}'::uuid AND t.id='${concurrentProjectTimesheet.id}'::uuid`);
record('Concurrent project approval attempts commit one decision, one history event, and one audit record',
  concurrentProjectDecisions.filter(result => result.status === 'fulfilled').length === 1
    && concurrentProjectState.timesheet_status === 'approved' && concurrentProjectState.review_status === 'approved'
    && concurrentProjectState.events === 2 && concurrentProjectState.audit === 1,
  concurrentProjectDecisions.map(result => result.status === 'fulfilled' ? 'resolved' : 'denied').join('/'));

let projectTimesheetBrowserOutput = '';
let projectTimesheetBrowserError = '';
try {
  projectTimesheetBrowserOutput = execFileSync('node', [path.join(here, 'run-project-timesheets-browser.mjs')], {
    cwd: mainRoot,
    env: {
      ...process.env,
      HRIS_LOCAL_SUPABASE_URL: services.API_URL,
      HRIS_LOCAL_SUPABASE_ANON_KEY: services.ANON_KEY,
      HRIS_LOCAL_TEST_PASSWORD: password,
      HRIS_LOCAL_TIMESHEET_EMPLOYEE_EMAIL: emails[7],
      HRIS_LOCAL_TIMESHEET_MANAGER_EMAIL: emails[5],
      HRIS_LOCAL_TIMESHEET_TENANT_ID: ids.tenantA,
      HRIS_LOCAL_TIMESHEET_ALLOCATION_ID: submitterProjectAllocationA.data?.id,
      HRIS_LOCAL_TIMESHEET_PROJECT_NAME: projectA.name,
      HRIS_LOCAL_TIMESHEET_WORK_DATE: addCalendarDays(localCurrentDate, 1),
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
} catch (error) {
  projectTimesheetBrowserError = String(error.stderr || error.message || 'local project timesheet browser journey failed')
    .replaceAll(password, '[REDACTED]').slice(-1800);
}
const projectTimesheetBrowserRow = queryAdmin(`SELECT COALESCE((
  SELECT jsonb_build_object('id',t.id::text,'status',t.status,'review_status',r.status,
    'entry_count',(SELECT count(*)::integer FROM public.timesheet_entries e WHERE e.timesheet_id=t.id),
    'corrected_note',(SELECT note FROM public.timesheet_entries e WHERE e.timesheet_id=t.id ORDER BY e.id LIMIT 1),
    'history',(SELECT count(*)::integer FROM public.timesheet_project_review_events ev WHERE ev.timesheet_id=t.id))
  FROM public.timesheets t JOIN public.timesheet_project_reviews r ON r.tenant_id=t.tenant_id AND r.timesheet_id=t.id
  WHERE t.tenant_id='${ids.tenantA}'::uuid AND t.employee_id='55555555-5555-4555-8555-555555555556'::uuid
    AND EXISTS(SELECT 1 FROM public.timesheet_entries e WHERE e.timesheet_id=t.id
      AND e.note LIKE 'Synthetic project timesheet browser acceptance%')
  ORDER BY t.created_at DESC LIMIT 1),
  jsonb_build_object('id',NULL,'status',NULL,'review_status',NULL,'entry_count',0,'corrected_note',NULL,'history',0))`);
record('Real Auth-to-Postgres project timesheet browser journey completes allocation, rejection, scoped correction, approval, retry, refresh, EN/BN, and mobile/desktop states',
  projectTimesheetBrowserOutput.includes('Real Auth/Postgres project timesheet journey passed: allocation-bound submission, PM-only rejection/approval, scoped correction, outage retry, refresh persistence, EN/BN, and 375px/1280px layouts.')
    && projectTimesheetBrowserRow.status === 'approved' && projectTimesheetBrowserRow.review_status === 'approved'
    && projectTimesheetBrowserRow.entry_count === 1
    && projectTimesheetBrowserRow.corrected_note === 'Synthetic project timesheet browser acceptance corrected'
    && projectTimesheetBrowserRow.history === 4,
  JSON.stringify({ browserError: projectTimesheetBrowserError, database: projectTimesheetBrowserRow }));
if (projectTimesheetBrowserRow.id) {
  psqlSync(`DELETE FROM public.admin_audit_logs WHERE (target_type='timesheet' AND target_id='${projectTimesheetBrowserRow.id}')
    OR (target_type='timesheet_project_review' AND details->>'timesheet_id'='${projectTimesheetBrowserRow.id}');
    DELETE FROM public.timesheets WHERE id='${projectTimesheetBrowserRow.id}'::uuid;`);
}
record('Real-browser project timesheet acceptance removes only its marked synthetic rows and audit records',
  queryAdmin(`SELECT jsonb_build_object('count',count(*)::integer) FROM public.timesheets t
    JOIN public.timesheet_entries e ON e.timesheet_id=t.id
    WHERE t.tenant_id='${ids.tenantA}'::uuid AND e.note LIKE 'Synthetic project timesheet browser acceptance%'`).count === 0);

const employeeATeamAndProjectMembership = queryAdmin(`SELECT jsonb_build_object(
  'team_id',e.team_id::text,
  'project_count',(SELECT count(DISTINCT a.project_id)::integer FROM public.project_allocations a
    WHERE a.tenant_id=e.tenant_id AND a.employee_id=e.id AND a.status IN ('active','upcoming')),
  'allocation_total',(SELECT COALESCE(sum(a.allocation_percentage),0)::numeric
    FROM public.project_allocations a WHERE a.tenant_id=e.tenant_id AND a.employee_id=e.id
      AND a.status IN ('active','upcoming')))
  FROM public.employees e WHERE e.tenant_id='${ids.tenantA}'::uuid
    AND e.id='55555555-5555-4555-8555-555555555555'::uuid`);
record('Employee remains on their organizational team while belonging to multiple projects',
  employeeATeamAndProjectMembership.team_id === 'dddddddd-0000-4000-8000-000000000001'
    && employeeATeamAndProjectMembership.project_count === 2
    && Number(employeeATeamAndProjectMembership.allocation_total) === 100,
  JSON.stringify(employeeATeamAndProjectMembership));

const taskMemberAllocation = { error: null, data: submitterProjectAllocationA.data };
const taskAllocationIds = [allocationA60.data?.id, taskMemberAllocation.data?.id];
const adminTaskCreate = await managerA.client.rpc('hris_create_project_task', {
  p_tenant_id: ids.tenantA, p_project_id: projectA.id, p_title: 'Unauthorized task',
  p_description: '', p_due_date: null, p_project_allocation_ids: taskAllocationIds,
});
const tenantManagerTaskCreate = await managerB.client.rpc('hris_create_project_task', {
  p_tenant_id: ids.tenantA, p_project_id: projectA.id, p_title: 'Foreign task',
  p_description: '', p_due_date: null, p_project_allocation_ids: taskAllocationIds,
});
const superAdminTaskCreate = await superAdmin.client.rpc('hris_create_project_task', {
  p_tenant_id: ids.tenantA, p_project_id: projectA.id, p_title: 'Unappointed task',
  p_description: '', p_due_date: null, p_project_allocation_ids: taskAllocationIds,
});
const projectTaskCreate = await employeeA.client.rpc('hris_create_project_task', {
  p_tenant_id: ids.tenantA, p_project_id: projectA.id, p_title: 'Synthetic peer review task',
  p_description: 'A task for isolated task and peer review acceptance.',
  p_due_date: null, p_project_allocation_ids: taskAllocationIds,
});
const projectTaskId = projectTaskCreate.data?.id;
const adminTaskEdit = await managerA.client.rpc('hris_update_project_task', {
  p_tenant_id: ids.tenantA, p_task_id: projectTaskId, p_title: 'Unauthorized task edit',
  p_description: 'Must remain unchanged.', p_due_date: null,
});
const crossTenantTaskEdit = await managerB.client.rpc('hris_update_project_task', {
  p_tenant_id: ids.tenantA, p_task_id: projectTaskId, p_title: 'Cross-tenant task edit',
  p_description: 'Must remain unchanged.', p_due_date: null,
});
const taskEdit = await employeeA.client.rpc('hris_update_project_task', {
  p_tenant_id: ids.tenantA, p_task_id: projectTaskId, p_title: 'Synthetic peer review task — revised',
  p_description: 'Updated task details persist without changing task members.', p_due_date: localCurrentDate,
});
const invalidPastTaskEdit = await employeeA.client.rpc('hris_update_project_task', {
  p_tenant_id: ids.tenantA, p_task_id: projectTaskId, p_title: 'Synthetic peer review task — revised',
  p_description: 'This rejected update must not persist.', p_due_date: addCalendarDays(localCurrentDate, -1),
});
const editedTaskRow = queryAdmin(`SELECT jsonb_build_object(
  'title',title,'description',description,'due_date',due_date::text,
  'updated_at_after_created',updated_at>created_at)
  FROM public.project_tasks WHERE tenant_id='${ids.tenantA}'::uuid AND id='${projectTaskId}'::uuid`);
record('Only the assigned Project Manager creates a task with same-project employee allocations',
  !taskMemberAllocation.error && Boolean(adminTaskCreate.error?.code === '42501')
    && Boolean(tenantManagerTaskCreate.error?.code === '42501')
    && Boolean(superAdminTaskCreate.error?.code === '42501')
    && !projectTaskCreate.error && projectTaskCreate.data?.status === 'open');
record('Task details persist only through the assigned Project Manager while ordinary and cross-tenant edits are denied',
  Boolean(adminTaskEdit.error?.code === '42501') && Boolean(crossTenantTaskEdit.error?.code === '42501')
    && !taskEdit.error && Boolean(invalidPastTaskEdit.error?.code === '22023')
    && taskEdit.data?.title === 'Synthetic peer review task — revised'
    && editedTaskRow.title === 'Synthetic peer review task — revised'
    && editedTaskRow.description === 'Updated task details persist without changing task members.'
    && editedTaskRow.due_date === localCurrentDate && editedTaskRow.updated_at_after_created === true,
  JSON.stringify({ adminCode: adminTaskEdit.error?.code, crossTenantCode: crossTenantTaskEdit.error?.code,
    editError: taskEdit.error?.message, persisted: editedTaskRow }));

const taskWorkspacePM = await employeeA.client.rpc('hris_get_project_task_workspace', {
  p_tenant_id: ids.tenantA, p_project_id: projectA.id,
});
const taskWorkspaceMember = await managerA2.client.rpc('hris_get_project_task_workspace', {
  p_tenant_id: ids.tenantA, p_project_id: projectA.id,
});
const taskWorkspaceAdmin = await managerA.client.rpc('hris_get_project_task_workspace', {
  p_tenant_id: ids.tenantA, p_project_id: projectA.id,
});
const taskWorkspaceForeign = await employeeB.client.rpc('hris_get_project_task_workspace', {
  p_tenant_id: ids.tenantA, p_project_id: projectA.id,
});
const taskPortfolioPM = await employeeA.client.rpc('hris_get_my_project_task_portfolio', { p_tenant_id: ids.tenantA });
const taskPortfolioMember = await managerA2.client.rpc('hris_get_my_project_task_portfolio', { p_tenant_id: ids.tenantA });
const taskPortfolioAdmin = await managerA.client.rpc('hris_get_my_project_task_portfolio', { p_tenant_id: ids.tenantA });
const taskPortfolioCrossTenant = await employeeA.client.rpc('hris_get_my_project_task_portfolio', { p_tenant_id: ids.tenantB });
const taskPortfolioForeign = await managerB.client.rpc('hris_get_my_project_task_portfolio', { p_tenant_id: ids.tenantA });
const taskPortfolioPMB = await employeeB.client.rpc('hris_get_my_project_task_portfolio', { p_tenant_id: ids.tenantB });
const taskPortfolioCrossTenantB = await employeeB.client.rpc('hris_get_my_project_task_portfolio', { p_tenant_id: ids.tenantA });
const taskPortfolioGlobalOnly = await globalOnly.client.rpc('hris_get_my_project_task_portfolio', { p_tenant_id: ids.tenantA });
const taskPortfolioAnonymous = attemptAs(null,
  `SELECT public.hris_get_my_project_task_portfolio('${ids.tenantA}'::uuid)`, 'anon');
const portfolioTasks = (taskPortfolioPM.data?.projects || []).flatMap(project => project.tasks || []);
record('Project Manager portfolio returns only tasks from projects they lead with feedback totals and no review content',
  !taskPortfolioPM.error
    && taskPortfolioPM.data.projects.length === 3
    && taskPortfolioPM.data.projects.every(project => [projectA.id, projectA2.id, projectA3.id].includes(project.project_id))
    && portfolioTasks.length === 1 && portfolioTasks[0].task_id === projectTaskId
    && portfolioTasks[0].status === 'open' && portfolioTasks[0].members.length === 2
    && portfolioTasks[0].feedback_pending === 0
    && taskPortfolioPM.data.counts.tasks === 1 && taskPortfolioPM.data.counts.open === 1
    && taskPortfolioPM.data.counts.feedback_pending === 0
    && !JSON.stringify(taskPortfolioPM.data).includes('quality_of_work_score')
    && Boolean(taskPortfolioMember.error?.code === '42501')
    && Boolean(taskPortfolioAdmin.error?.code === '42501')
    && Boolean(taskPortfolioCrossTenant.error?.code === '42501')
    && Boolean(taskPortfolioForeign.error?.code === '42501')
    && !taskPortfolioPMB.error && taskPortfolioPMB.data.projects.length === 2
    && taskPortfolioPMB.data.counts.tasks === 0
    && Boolean(taskPortfolioCrossTenantB.error?.code === '42501')
    && Boolean(taskPortfolioGlobalOnly.error?.code === '42501')
    && !taskPortfolioAnonymous.ok,
  JSON.stringify({ projects: taskPortfolioPM.data?.projects.map(project => project.project_id),
    taskIds: portfolioTasks.map(task => task.task_id),
    memberCode: taskPortfolioMember.error?.code, adminCode: taskPortfolioAdmin.error?.code,
    crossTenantCode: taskPortfolioCrossTenant.error?.code, foreignCode: taskPortfolioForeign.error?.code,
    tenantBProjects: taskPortfolioPMB.data?.projects.map(project => project.project_id),
    tenantBCrossCode: taskPortfolioCrossTenantB.error?.code,
    globalOnlyCode: taskPortfolioGlobalOnly.error?.code, anonymousDenied: !taskPortfolioAnonymous.ok }));
const memberTasks = await managerA2.client.rpc('hris_get_my_project_tasks', { p_tenant_id: ids.tenantA });
const tenantBTasks = await employeeB.client.rpc('hris_get_my_project_tasks', { p_tenant_id: ids.tenantB });
const directTaskRowsA = await employeeA.client.from('project_tasks').select('id,tenant_id').eq('tenant_id', ids.tenantA);
const directTaskRowsB = await employeeB.client.from('project_tasks').select('id,tenant_id').eq('tenant_id', ids.tenantA);
record('Task workspace, employee task list, and task RLS remain project-member and tenant scoped',
  !taskWorkspacePM.error && taskWorkspacePM.data.can_manage === true && taskWorkspacePM.data.tasks.length === 1
    && !taskWorkspaceMember.error && taskWorkspaceMember.data.can_manage === false && taskWorkspaceMember.data.tasks.length === 1
    && Boolean(taskWorkspaceAdmin.error) && Boolean(taskWorkspaceForeign.error)
    && !memberTasks.error && memberTasks.data.tasks.length === 1 && memberTasks.data.tasks[0].task_id === projectTaskId
    && !tenantBTasks.error && tenantBTasks.data.tasks.length === 0
    && !directTaskRowsA.error && directTaskRowsA.data.length === 1
    && !directTaskRowsB.error && directTaskRowsB.data.length === 0);

const taskAssignments = taskWorkspacePM.data?.tasks?.find(task => task.id === projectTaskId)?.members || [];
const revieweeTaskAssignment = taskAssignments.find(row => row.employee_id === '55555555-5555-4555-8555-555555555556');
const taskAssignmentMemberDenied = await managerA2.client.rpc('hris_assign_project_task_member', {
  p_tenant_id: ids.tenantA, p_task_id: projectTaskId, p_project_allocation_id: allocationA40.data?.id,
});
const taskReleaseMemberDenied = await managerA.client.rpc('hris_release_project_task_member', {
  p_tenant_id: ids.tenantA, p_task_assignment_id: revieweeTaskAssignment?.id,
});
const taskStartMemberDenied = await managerA2.client.rpc('hris_start_project_task', {
  p_tenant_id: ids.tenantA, p_task_id: projectTaskId,
});
const taskRelease = await employeeA.client.rpc('hris_release_project_task_member', {
  p_tenant_id: ids.tenantA, p_task_assignment_id: revieweeTaskAssignment?.id,
});
const afterTaskRelease = await employeeA.client.rpc('hris_get_project_task_workspace', {
  p_tenant_id: ids.tenantA, p_project_id: projectA.id,
});
const releaseCreatedReviews = queryAdmin(`SELECT jsonb_build_object(
  'count',count(*)::integer,
  'reviewee',COALESCE(bool_and(employee_id='55555555-5555-4555-8555-555555555556'::uuid),false),
  'reviewer',COALESCE(bool_and(reviewer_employee_id='55555555-5555-4555-8555-555555555555'::uuid),false))
  FROM public.project_task_peer_reviews WHERE tenant_id='${ids.tenantA}'::uuid AND task_id='${projectTaskId}'::uuid`);
record('Project Manager release creates overlap-based review obligations without blocking the release',
  Boolean(taskAssignmentMemberDenied.error?.code === '42501')
    && Boolean(taskReleaseMemberDenied.error?.code === '42501')
    && Boolean(taskStartMemberDenied.error?.code === '42501')
    && !taskRelease.error && !afterTaskRelease.error
    && afterTaskRelease.data.tasks[0].feedback_pending === 1
    && releaseCreatedReviews.count === 1 && releaseCreatedReviews.reviewee && releaseCreatedReviews.reviewer);

const releaseNotificationsA = await employeeA.client.rpc('hris_get_my_project_notifications', {
  p_tenant_id: ids.tenantA, p_limit: 50, p_before_created_at: null, p_before_id: null,
});
const releaseNotificationsB = await managerA2.client.rpc('hris_get_my_project_notifications', {
  p_tenant_id: ids.tenantA, p_limit: 50, p_before_created_at: null, p_before_id: null,
});
const releaseNotificationsTenantB = await employeeB.client.rpc('hris_get_my_project_notifications', {
  p_tenant_id: ids.tenantB, p_limit: 50, p_before_created_at: null, p_before_id: null,
});
const unifiedLearningNotifications = await employeeA.client.rpc('hris_get_my_notifications', {
  p_tenant_id: ids.tenantA, p_limit: 1,
  p_before_created_at: null, p_before_source: null, p_before_id: null,
});
const unifiedLearningNotificationsPageTwo = await employeeA.client.rpc('hris_get_my_notifications', {
  p_tenant_id: ids.tenantA, p_limit: 1,
  p_before_created_at: unifiedLearningNotifications.data?.notifications?.[0]?.created_at || null,
  p_before_source: unifiedLearningNotifications.data?.notifications?.[0]?.source || null,
  p_before_id: unifiedLearningNotifications.data?.notifications?.[0]?.id || null,
});
const unifiedProjectNotifications = await employeeA.client.rpc('hris_get_my_notifications', {
  p_tenant_id: ids.tenantA, p_limit: 50,
  p_before_created_at: null, p_before_source: null, p_before_id: null,
});
const unifiedTenantBNotifications = await employeeB.client.rpc('hris_get_my_notifications', {
  p_tenant_id: ids.tenantB, p_limit: 50,
  p_before_created_at: null, p_before_source: null, p_before_id: null,
});
const unifiedCrossTenantNotifications = await employeeA.client.rpc('hris_get_my_notifications', {
  p_tenant_id: ids.tenantB, p_limit: 50,
  p_before_created_at: null, p_before_source: null, p_before_id: null,
});
const unifiedGlobalNotifications = await globalOnly.client.rpc('hris_get_my_notifications', {
  p_tenant_id: ids.tenantA, p_limit: 50,
  p_before_created_at: null, p_before_source: null, p_before_id: null,
});
const unifiedAnonymousNotifications = attemptAs(null,
  `SELECT public.hris_get_my_notifications('${ids.tenantA}'::uuid)`, 'anon');
const unifiedLearningRows = unifiedLearningNotifications.data?.notifications || [];
const unifiedProjectRows = unifiedProjectNotifications.data?.notifications || [];
const unifiedTravelRowsA = unifiedProjectRows.filter(row => row.source === 'travel_decision');
const unifiedTravelRowsB = (unifiedTenantBNotifications.data?.notifications || []).filter(row => row.source === 'travel_decision');
const unifiedLeaveRowsA = unifiedProjectRows.filter(row => row.source === 'leave_decision');
const unifiedLeaveRowsB = (unifiedTenantBNotifications.data?.notifications || []).filter(row => row.source === 'leave_decision');
const unifiedServiceRequestRowsA = unifiedProjectRows.filter(row => row.source === 'service_request_decision');
const unifiedServiceRequestRowsB = (unifiedTenantBNotifications.data?.notifications || []).filter(row => row.source === 'service_request_decision');
const travelApprovalNotificationA = unifiedTravelRowsA.find(row => row.travel_request_id === travelIds.requestA && row.kind === 'approved');
const travelRejectionNotificationA = unifiedTravelRowsA.find(row => row.travel_request_id === travelIds.requestA && row.kind === 'rejected');
const travelApprovalNotificationB = unifiedTravelRowsB.find(row => row.travel_request_id === travelIds.requestB && row.kind === 'approved');
const leaveApprovalNotificationA = unifiedLeaveRowsA.find(row => row.leave_request_id === ids.leaveApprove && row.kind === 'approved');
const leaveRejectionNotificationA = unifiedLeaveRowsA.find(row => row.leave_request_id === ids.leaveHalfDay && row.kind === 'rejected');
const leaveBrowserApprovalNotificationA = unifiedLeaveRowsA.find(row => row.leave_request_id === uiLeaveAcceptance?.id && row.kind === 'approved');
const leaveBrowserRejectionNotificationA = unifiedLeaveRowsA.find(row => row.leave_request_id === leaveRejectionRequestId && row.kind === 'rejected');
const leaveApprovalNotificationB = unifiedLeaveRowsB.find(row => row.leave_request_id === ids.leaveTenantB && row.kind === 'approved');
const serviceRequestCompletedNotificationA = unifiedServiceRequestRowsA.find(row => row.service_request_id === serviceRequestId && row.kind === 'completed');
const serviceRequestRejectedNotificationA = unifiedServiceRequestRowsA.find(row => row.service_request_id === serviceRequestRejectId && row.kind === 'rejected');
const serviceRequestRejectedNotificationB = unifiedServiceRequestRowsB.find(row => row.service_request_id === serviceRequestTenantBId && row.kind === 'rejected');
const unifiedProjectReviewRow = unifiedProjectRows.find(row => row.source === 'project_review' && row.task_id === projectTaskId);
const unifiedLearningRowCount = unifiedProjectRows.filter(row => row.source === 'learning_completion').length;
record('Unified notification feed merges leave decisions with project, learning, and travel events using keyset paging and tenant ownership',
  !unifiedLearningNotifications.error && unifiedLearningRows.length === 1
    && unifiedLearningNotifications.data.has_more === true
    && unifiedLearningRows[0].source === 'project_review'
    && unifiedLearningRows[0].task_id === projectTaskId
    && !unifiedLearningNotificationsPageTwo.error && unifiedLearningNotificationsPageTwo.data.notifications.length === 1
    && ['project_review','learning_completion','travel_decision','leave_decision','service_request_decision'].includes(unifiedLearningNotificationsPageTwo.data.notifications[0].source)
    && unifiedLearningNotificationsPageTwo.data.notifications[0].id !== unifiedLearningRows[0].id
    && unifiedProjectRows.some(row => row.id === unifiedLearningNotificationsPageTwo.data.notifications[0].id
      && row.source === unifiedLearningNotificationsPageTwo.data.notifications[0].source)
    && !unifiedProjectNotifications.error && unifiedProjectNotifications.data.unread_project_reviews === 1
    && unifiedProjectRows.length >= 2 && unifiedLearningRowCount >= 1
    && unifiedProjectReviewRow?.review_status === 'pending'
    && travelApprovalNotificationA?.travel_destination === 'QA A client site'
    && travelRejectionNotificationA?.travel_from_date === '2026-11-02'
    && travelApprovalNotificationB?.travel_destination === 'QA B client site'
    && leaveApprovalNotificationA?.leave_type_name === 'Synthetic annual leave'
    && leaveRejectionNotificationA?.leave_type_name === 'Synthetic annual leave'
    && leaveBrowserApprovalNotificationA?.leave_type_name === 'Synthetic evidence-required leave'
    && leaveBrowserRejectionNotificationA?.kind === 'rejected'
    && leaveApprovalNotificationB?.leave_type_name === 'Synthetic tenant B leave'
    && serviceRequestCompletedNotificationA?.service_request_type === 'other'
    && serviceRequestRejectedNotificationA?.service_request_type === 'shift_change'
    && serviceRequestRejectedNotificationB?.service_request_type === 'other'
    && !Object.keys(serviceRequestCompletedNotificationA || {}).some(key => /note|reason|employee|recipient|actor|resolved_by/i.test(key))
    && !Object.keys(leaveApprovalNotificationA || {}).some(key => /note|reason|employee|recipient/i.test(key))
    && !Object.keys(travelApprovalNotificationA || {}).some(key => /note|purpose|cost|employee/i.test(key))
    && !unifiedProjectRows.some(row => row.source === 'travel_decision' && row.travel_request_id === travelIds.requestB)
    && !unifiedTenantBNotifications.error
    && unifiedTenantBNotifications.data.notifications.every(row => ['travel_decision','leave_decision','service_request_decision'].includes(row.source))
    && Boolean(unifiedCrossTenantNotifications.error?.code === '42501')
    && Boolean(unifiedGlobalNotifications.error?.code === '42501') && !unifiedAnonymousNotifications.ok
    && functionGrantMatrix['public.hris_get_my_notifications(uuid,integer,timestamptz,text,uuid)'].anon === false,
  JSON.stringify({ orderedSources: [unifiedLearningRows[0]?.source,
    unifiedLearningNotificationsPageTwo.data?.notifications?.[0]?.source],
    sourceCounts: { total: unifiedProjectRows.length, learning: unifiedLearningRowCount,
      travel: unifiedTravelRowsA.length,
      leave: unifiedLeaveRowsA.length,
      serviceRequest: unifiedServiceRequestRowsA.length,
      projectReview: unifiedProjectRows.filter(row => row.source === 'project_review').length },
    travelApprovalA: travelApprovalNotificationA?.travel_destination,
    travelRejectionA: travelRejectionNotificationA?.kind,
    travelApprovalB: travelApprovalNotificationB?.travel_destination,
    leaveApprovalA: leaveApprovalNotificationA?.leave_type_name,
    leaveRejectionA: leaveRejectionNotificationA?.kind,
    leaveBrowserApproval: leaveBrowserApprovalNotificationA?.leave_type_name,
    leaveBrowserRejection: leaveBrowserRejectionNotificationA?.kind,
    leaveApprovalB: leaveApprovalNotificationB?.leave_type_name,
    serviceRequestCompleted: serviceRequestCompletedNotificationA?.service_request_id,
    serviceRequestRejected: serviceRequestRejectedNotificationA?.service_request_id,
    tenantBServiceRequest: serviceRequestRejectedNotificationB?.service_request_id,
    taskReviewStatus: unifiedProjectReviewRow?.review_status,
    learningError: unifiedLearningNotifications.error?.code,
    pageTwoError: unifiedLearningNotificationsPageTwo.error?.code,
    pageTwoHasMore: unifiedLearningNotificationsPageTwo.data?.has_more,
    functionAcl: functionGrantMatrix['public.hris_get_my_notifications(uuid,integer,timestamptz,text,uuid)'],
    projectUnread: unifiedProjectNotifications.data?.unread_project_reviews,
    tenantB: unifiedTenantBNotifications.data?.notifications?.length,
    crossTenant: unifiedCrossTenantNotifications.error?.code,
    globalOnly: unifiedGlobalNotifications.error?.code, anonymousDenied: !unifiedAnonymousNotifications.ok }));
const directServiceRequestNotificationsA = await employeeA.client.from('service_request_notifications')
  .select('id,tenant_id,service_request_id,recipient_employee_id,kind').eq('tenant_id', ids.tenantA);
const directServiceRequestNotificationsForeign = await employeeA.client.from('service_request_notifications')
  .select('id').eq('tenant_id', ids.tenantB);
const directServiceRequestNotificationInsert = await employeeA.client.from('service_request_notifications').insert({
  tenant_id: ids.tenantA, service_request_id: serviceRequestId, recipient_employee_id: '55555555-5555-4555-8555-555555555555',
  kind: 'completed', created_at: new Date().toISOString(),
});
const directServiceRequestNotificationUpdate = await employeeA.client.from('service_request_notifications')
  .update({ kind: 'rejected' }).eq('service_request_id', serviceRequestId);
const directServiceRequestNotificationDelete = await employeeA.client.from('service_request_notifications')
  .delete().eq('service_request_id', serviceRequestId);
const anonDirectServiceRequestNotifications = attemptAs(null,
  'SELECT id FROM public.service_request_notifications', 'anon');
const serviceRequestNotificationIntegrity = queryAdmin(`SELECT jsonb_build_object(
  'a_notifications',(SELECT count(*)::integer FROM public.service_request_notifications WHERE tenant_id='${ids.tenantA}'::uuid),
  'a_terminal_history',(SELECT count(*)::integer FROM public.service_request_status_history WHERE tenant_id='${ids.tenantA}'::uuid AND new_status IN ('completed','rejected')),
  'b_notifications',(SELECT count(*)::integer FROM public.service_request_notifications WHERE tenant_id='${ids.tenantB}'::uuid),
  'b_terminal_history',(SELECT count(*)::integer FROM public.service_request_status_history WHERE tenant_id='${ids.tenantB}'::uuid AND new_status IN ('completed','rejected')),
  'mismatched_links',(SELECT count(*)::integer FROM public.service_request_notifications n
    JOIN public.service_requests r ON r.id=n.service_request_id
    WHERE n.tenant_id<>r.tenant_id OR n.recipient_employee_id<>r.employee_id OR n.kind<>r.status))`);
record('Service-request decision notifications are owner-readable, tenant-isolated, immutable, and linked to terminal history',
  !directServiceRequestNotificationsA.error && directServiceRequestNotificationsA.data.length >= 2
    && !directServiceRequestNotificationsForeign.error && directServiceRequestNotificationsForeign.data.length === 0
    && Boolean(directServiceRequestNotificationInsert.error)
    && Boolean(directServiceRequestNotificationUpdate.error)
    && Boolean(directServiceRequestNotificationDelete.error)
    && !anonDirectServiceRequestNotifications.ok
    && serviceRequestNotificationIntegrity.a_notifications === serviceRequestNotificationIntegrity.a_terminal_history
    && serviceRequestNotificationIntegrity.b_notifications === serviceRequestNotificationIntegrity.b_terminal_history
    && serviceRequestNotificationIntegrity.mismatched_links === 0,
  JSON.stringify({ ownerRows: directServiceRequestNotificationsA.data?.length,
    crossTenantRows: directServiceRequestNotificationsForeign.data?.length,
    insert: directServiceRequestNotificationInsert.error?.code,
    update: directServiceRequestNotificationUpdate.error?.code,
    delete: directServiceRequestNotificationDelete.error?.code,
    anonDenied: !anonDirectServiceRequestNotifications.ok, ...serviceRequestNotificationIntegrity }));
const directTravelDecisionRowsA = await employeeA.client.from('travel_request_notifications')
  .select('id,tenant_id,travel_request_id,travel_status_history_id,recipient_employee_id,kind')
  .eq('tenant_id', ids.tenantA).eq('travel_request_id', travelIds.requestA);
const directTravelDecisionRowsForeign = await employeeA.client.from('travel_request_notifications')
  .select('id,tenant_id').eq('tenant_id', ids.tenantB);
const anonDirectTravelDecisionRows = attemptAs(null,
  'SELECT id FROM public.travel_request_notifications', 'anon');
const travelDecisionNotificationIntegrity = queryAdmin(`SELECT jsonb_build_object(
  'a_notifications',(SELECT count(*)::integer FROM public.travel_request_notifications
    WHERE tenant_id='${ids.tenantA}'::uuid AND travel_request_id='${travelIds.requestA}'::uuid),
  'a_decision_history',(SELECT count(*)::integer FROM public.travel_status_history
    WHERE tenant_id='${ids.tenantA}'::uuid AND travel_request_id='${travelIds.requestA}'::uuid
      AND previous_status='submitted' AND new_status IN ('approved','rejected')),
  'b_notifications',(SELECT count(*)::integer FROM public.travel_request_notifications
    WHERE tenant_id='${ids.tenantB}'::uuid AND travel_request_id='${travelIds.requestB}'::uuid),
  'b_decision_history',(SELECT count(*)::integer FROM public.travel_status_history
    WHERE tenant_id='${ids.tenantB}'::uuid AND travel_request_id='${travelIds.requestB}'::uuid
      AND previous_status='submitted' AND new_status IN ('approved','rejected')),
  'mismatched_links',(SELECT count(*)::integer FROM public.travel_request_notifications n
    JOIN public.travel_status_history h ON h.id=n.travel_status_history_id
    JOIN public.travel_requests r ON r.id=n.travel_request_id
    WHERE n.tenant_id<>h.tenant_id OR n.tenant_id<>r.tenant_id
      OR n.travel_request_id<>h.travel_request_id OR n.recipient_employee_id<>r.employee_id
      OR n.kind<>h.new_status))`);
record('Travel decision notifications are one-per-history, employee-owned, tenant-isolated, and hidden from anonymous callers',
  !directTravelDecisionRowsA.error && directTravelDecisionRowsA.data.length === 2
    && !directTravelDecisionRowsForeign.error && directTravelDecisionRowsForeign.data.length === 0
    && !anonDirectTravelDecisionRows.ok
    && travelDecisionNotificationIntegrity.a_notifications === travelDecisionNotificationIntegrity.a_decision_history
    && travelDecisionNotificationIntegrity.a_notifications === 2
    && travelDecisionNotificationIntegrity.b_notifications === travelDecisionNotificationIntegrity.b_decision_history
    && travelDecisionNotificationIntegrity.b_notifications === 1
    && travelDecisionNotificationIntegrity.mismatched_links === 0,
  JSON.stringify({ ownRows: directTravelDecisionRowsA.data?.length,
    foreignRows: directTravelDecisionRowsForeign.data?.length,
    anonDenied: !anonDirectTravelDecisionRows.ok,
    ...travelDecisionNotificationIntegrity }));
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
      HRIS_LOCAL_ATTENDANCE_CURRENT_MONTH: currentAttendanceMonth.slice(0, 7),
      HRIS_LOCAL_ATTENDANCE_PREVIOUS_MONTH: previousAttendanceMonthStart.slice(0, 7),
      HRIS_LOCAL_ATTENDANCE_EMPTY_MONTH: emptyAttendanceMonth.slice(0, 7),
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
} catch (error) {
  employeeAttendanceBrowserError = String(error.stderr || error.message || 'local employee attendance browser run failed').slice(-1800);
  employeeAttendanceBrowserOutput = String(error.stdout || '');
}
record('Real employee dashboard month selector reads persisted Auth/Postgres attendance with retry, refresh, empty, and responsive states',
  employeeAttendanceBrowserOutput.includes('Local Auth/Postgres employee attendance journey passed: Bengali and English locale toggle/persistence, translated leave and correction form states, injected outage retry, month selection, persisted prior-month hours and history, refresh recovery, empty state, tenant-bound RPCs, and mobile/desktop layouts.'),
  employeeAttendanceBrowserError);

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
    && employeeAStatusAfterRelease === 'on_leave'
    && taskMembershipCascade.released === true && taskMembershipCascade.review_count === 2
    && Boolean(releaseRepeat.error)
    && auditCount(allocationA60.data?.id, 'project.allocation.released') === 1,
  JSON.stringify(taskMembershipCascade));

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
record('Employee upcoming holidays include the managed active entry and remain tenant-bound',
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
