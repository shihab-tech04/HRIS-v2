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

const here = path.dirname(fileURLToPath(import.meta.url));
const mainRoot = path.resolve(here, '../../..');
const workdir = process.env.HRIS_SUPABASE_TEST_WORKDIR || '/private/tmp/synesis-local-hris-test';
const dockerContext = process.env.HRIS_DOCKER_CONTEXT || 'colima-hris-scratch';
const cliEnv = {
  ...process.env,
  SUPABASE_HOME: process.env.SUPABASE_HOME || '/private/tmp/synesis-supabase-home',
  SUPABASE_TELEMETRY_DISABLED: '1',
};

function cli(args) {
  return execFileSync('supabase', [...args, '--workdir', workdir], {
    cwd: mainRoot, env: cliEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
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
if (!services.API_URL || !services.ANON_KEY || !services.SERVICE_ROLE_KEY) {
  throw new Error('Local Supabase status did not provide the API URL and local keys.');
}
const apiUrl = new URL(services.API_URL);
const databaseUrl = new URL(services.DB_URL);
if (apiUrl.hostname !== '127.0.0.1' || apiUrl.port !== '55421'
    || databaseUrl.hostname !== '127.0.0.1' || databaseUrl.port !== '55422') {
  throw new Error('Refusing to test: this harness requires the isolated Supabase ports 55421/55422.');
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
];

// Refuse to touch Auth unless this disposable stack is demonstrably empty.
const existing = await adminAuth.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (existing.error) throw existing.error;
const authRowsBeforeFixture = Number(psqlSync('SELECT count(*) FROM auth.users;').trim());
if (existing.data.users.length !== 0 || authRowsBeforeFixture !== 0) {
  throw new Error('Refusing to test: the isolated Auth service and database must both start with zero users.');
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
let createdEvidenceBucket = false;
let createdExpenseBucket = false;
let expenseBucketSafeToClean = false;
let createdReferralBucket = false;
let referralBucketSafeToClean = false;
const password = randomBytes(24).toString('base64url');
try {
  for (const email of emails) {
    const created = await adminAuth.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    createdUserIds.push(created.data.user.id);
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
    const result = await client.auth.signInWithPassword({ email, password });
    if (result.error || !result.data.session) throw result.error || new Error('Local Auth did not create a session.');
    return { client, userId: result.data.user.id, accessToken: result.data.session.access_token };
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
for (const file of [
  path.join(here, 'fixture.sql'),
  path.join(here, 'recruitment-fixture.sql'),
  path.join(mainRoot, 'supabase/migrations/20261011_02_hris_revoke_anon_helpers.sql'),
  path.join(mainRoot, 'supabase/migrations/20261012091930_hris_tenant_membership_role_permissions.sql'),
  path.join(mainRoot, 'supabase/migrations/20261012111928_hris_tenant_shift_roster_read.sql'),
  path.join(mainRoot, 'supabase/migrations/20261012113020_hris_tenant_shift_assignment_manage.sql'),
  path.join(mainRoot, 'supabase/migrations/20261012115907_hris_employee_web_attendance_event.sql'),
  path.join(mainRoot, 'supabase/migrations/20261012183000_hris_attendance_report_team_name.sql'),
  path.join(mainRoot, 'supabase/migrations/20261012230100_hris_membership_tenant_read_guards.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013023141_hris_performance_appraisal_membership_read.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013073243_hris_tenant_employee_directory.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013124000_hris_appraisal_narrative_workflow.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013130829_hris_recruitment_pipeline_read.sql'),
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
  path.join(mainRoot, 'supabase/migrations/20261013190000_hris_learning_session_roster.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013190100_learning_session_join_access.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013143711_hris_expense_claims_employee_tenant_workflow.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013210500_hris_employee_service_request_self_service.sql'),
  path.join(mainRoot, 'supabase/staging/approval-resolution/20261012_04_hris_leave_approval_tenant_guard.sql'),
  path.join(mainRoot, 'supabase/staging/approval-resolution/20261012_05_hris_attendance_approval_tenant_and_partial_fields.sql'),
  path.join(mainRoot, 'supabase/migrations/20261013175151_employee_referral_workflow.sql'),
]) applySql(file);
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
psqlSync(`UPDATE public.leave_requests
  SET from_date='${localCurrentDate}'::date,to_date='${localCurrentDate}'::date
  WHERE id='${ids.leaveApprove}'::uuid`);

const results = [];
function record(label, ok, note = '') {
  results.push({ label, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${note ? ` — ${note}` : ''}`);
}

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
  managerApprovalRequest: '92000000-0000-4000-8000-000000000004',
  managerRejectionRequest: '92000000-0000-4000-8000-000000000005',
  capacityRequestOne: '92000000-0000-4000-8000-000000000006',
  capacityRequestTwo: '92000000-0000-4000-8000-000000000007',
};
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
    && Boolean(learningAdminCatalogCrossTenant.error?.code === '42501')
    && Boolean(ordinaryLearningProgramCreate.error?.code === '42501')
    && Boolean(employeeLearningProgramCreate.error?.code === '42501')
    && Boolean(globalOnlyLearningProgramCreate.error?.code === '42501')
    && Boolean(crossTenantLearningProgramUpdate.error?.code === 'P0002')
    && Boolean(crossTenantLearningSessionCreate.error?.code === '22023')
    && Boolean(invalidLearningSessionCreate.error?.code === '22023')
    && Boolean(directLearningProgramWrite.error?.code === '42501')
    && Boolean(directLearningSessionWrite.error?.code === '42501'),
  JSON.stringify({ catalogCount: learningAdminCatalogA.data?.length, catalogTenantBound: learningAdminCatalogTenantBound,
    crossCatalogCode: learningAdminCatalogCrossTenant.error?.code,
    ordinaryManagerCode: ordinaryLearningProgramCreate.error?.code,
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
      HRIS_LOCAL_MANAGER_PROGRAM_TITLE: browserLearningProgramTitle,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
} catch (error) {
  learningBrowserError = String(error.stderr || error.message || 'local learning browser run failed').slice(-1800);
}
record('Real local Auth-to-Postgres learning workflow passes enrollment, approval, roster retry, authorized meeting access, cancellation, refresh and responsive recovery',
  learningBrowserOutput.includes('Local Auth-to-Postgres employee request, tenant-scoped manager approval, program/session administration, responsive roster retry, authorized session join link with outage recovery, employee enrollment, cancellation, and recovery passed.'),
  learningBrowserError);
const joinLinkEnrollment = await employeeA.client.rpc('hris_employee_enroll_learning', {
  p_tenant_id: ids.tenantA, p_program_id: '90000000-0000-4000-8000-000000000001',
  p_session_id: '91000000-0000-4000-8000-000000000001',
});
const learningJoinLinksA = await employeeA.client.rpc('hris_get_my_learning_join_links', { p_tenant_id: ids.tenantA });
const learningJoinLinksForeignTenant = await employeeB.client.rpc('hris_get_my_learning_join_links', { p_tenant_id: ids.tenantA });
const anonymousLearningJoinLinks = attemptAs(null,
  `SELECT public.hris_get_my_learning_join_links('${ids.tenantA}'::uuid)`, 'anon');
const learningJoinLinkAcl = queryAdmin(`SELECT jsonb_build_object(
  'anon',has_function_privilege('anon','public.hris_get_my_learning_join_links(uuid)','EXECUTE'),
  'authenticated',has_function_privilege('authenticated','public.hris_get_my_learning_join_links(uuid)','EXECUTE'))`);
record('Only an enrolled employee receives their tenant-bound scheduled session join URL',
  !joinLinkEnrollment.error && typeof learningJoinLinksA.data?.[joinLinkEnrollment.data.id] === 'string'
    && learningJoinLinksA.data[joinLinkEnrollment.data.id] === 'https://meet.example.test/qa-learning'
    && !learningJoinLinksForeignTenant.error && Object.keys(learningJoinLinksForeignTenant.data || {}).length === 0
    && !anonymousLearningJoinLinks.ok && learningJoinLinkAcl.anon === false
    && learningJoinLinkAcl.authenticated === true,
  JSON.stringify({ enrollment: joinLinkEnrollment.error?.code || joinLinkEnrollment.data?.status,
    linksA: learningJoinLinksA.data, foreignTenant: learningJoinLinksForeignTenant.data,
    anonymous: anonymousLearningJoinLinks.ok ? 'unexpectedly accepted' : 'denied', acl: learningJoinLinkAcl }));
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
  learningBrowserOutput.includes('Local Auth-to-Postgres employee request, tenant-scoped manager approval, program/session administration, responsive roster retry, authorized session join link with outage recovery, employee enrollment, cancellation, and recovery passed.')
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
      HRIS_LOCAL_EMPLOYEE_DIRECTORY_TENANT_ID: ids.tenantA,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
} catch (error) {
  employeeDirectoryBrowserError = String(error.stderr || error.message || 'local employee-directory browser run failed').slice(-1400);
}
record('Real local Auth-to-Postgres employee directory journey passes on mobile and desktop with retry recovery',
  employeeDirectoryBrowserOutput.includes('Local Auth-to-Postgres employee directory journey passed at 375px mobile and 1280px desktop.'),
  employeeDirectoryBrowserError);

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
  ('${recruitmentIds.applicationA1}'::uuid,'${ids.tenantA}'::uuid,'${recruitmentIds.jobA1}'::uuid,'55555555-5555-4555-8555-555555555581'::uuid,'Candidate A One','private-email-a@candidate.test','private-phone-a',5,ARRAY['sql'],'private-cv-url-a','private-cover-letter-a','submitted','private-status-note-a','2026-10-12T09:00:00Z','{"answer":"private-screening-answer-a"}'),
  ('${recruitmentIds.applicationA2}'::uuid,'${ids.tenantA}'::uuid,'${recruitmentIds.jobA2}'::uuid,'55555555-5555-4555-8555-555555555582'::uuid,'Candidate A Two','private-email-a2@candidate.test','private-phone-a2',3,ARRAY['design'],'private-cv-url-a2','private-cover-letter-a2','interview_scheduled','private-status-note-a2','2026-10-12T10:00:00Z','{"answer":"private-screening-answer-a2"}'),
  ('${recruitmentIds.applicationB}'::uuid,'${ids.tenantB}'::uuid,'${recruitmentIds.jobB}'::uuid,'66666666-6666-4666-8666-666666666681'::uuid,'Candidate B Only','private-email-b@candidate.test','private-phone-b',2,ARRAY['ops'],'private-cv-url-b','private-cover-letter-b','submitted','private-status-note-b','2026-10-12T11:00:00Z','{"answer":"private-screening-answer-b"}');
INSERT INTO public.candidate_application_stage_history(id,application_id,stage,note,actor_type,actor_user_id,created_at) VALUES
  ('${recruitmentIds.historyA1}'::uuid,'${recruitmentIds.applicationA1}'::uuid,'submitted','private-reviewer-note-a','employee','55555555-5555-4555-8555-555555555501'::uuid,'2026-10-12T09:01:00Z'),
  ('${recruitmentIds.historyA1Second}'::uuid,'${recruitmentIds.applicationA1}'::uuid,'screening','candidate-visible-milestone-note-a','employee','55555555-5555-4555-8555-555555555501'::uuid,'2026-10-12T10:01:00Z'),
  ('${recruitmentIds.historyB}'::uuid,'${recruitmentIds.applicationB}'::uuid,'submitted','private-reviewer-note-b','employee','66666666-6666-4666-8666-666666666601'::uuid,'2026-10-12T11:01:00Z');`);

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
      HRIS_LOCAL_RECRUITMENT_EMAIL: emails[11],
      HRIS_LOCAL_TENANT_ID: ids.tenantA,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
} catch (error) {
  recruitmentBrowserError = String(error.stderr || error.message || 'local recruitment browser run failed').slice(-1400);
}
record('Real 375px/1280px browser reads the tenant-scoped recruitment pipeline from local Auth/Postgres',
  recruitmentBrowserOutput.includes('Local Auth-to-Postgres recruitment pipeline journey passed at 375px mobile and 1280px desktop.'),
  recruitmentBrowserError);

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
  ('public.hris_submit_my_timesheet(uuid,uuid)'),
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

const evidencePathA = `${employeeA.userId}/${ids.tenantA}/${randomBytes(10).toString('hex')}.pdf`;
const evidencePathB = `${employeeB.userId}/${ids.tenantB}/${randomBytes(10).toString('hex')}.pdf`;
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

const evidenceApproved = evidenceRequestId
  ? resolveLeave(managerA, evidenceRequestId, 'approved', 'synthetic E2E approval')
  : { success: false };
const approvedEvidenceBalance = queryAdmin(`SELECT to_jsonb(b) FROM public.employee_leave_balances b
  WHERE tenant_id='${ids.tenantA}'::uuid AND employee_id='55555555-5555-4555-8555-555555555555'
    AND leave_type_id='${ids.leaveTypeEvidence}'::uuid AND balance_year=2026`);
record('Employee request completes the manager approval journey and updates its ledger once',
  evidenceApproved.success === true && tableRow('leave_requests', evidenceRequestId).status === 'approved'
  && Number(approvedEvidenceBalance.pending_days) === 0
  && Number(approvedEvidenceBalance.used_days) === 1
  && auditCount(evidenceRequestId, 'leave.request.approved') === 1);

const employeeSummaryA = queryAs(employeeA,
  `SELECT public.hris_get_my_dashboard_data('${ids.tenantA}'::uuid)`);
const employeeSummaryB = queryAs(employeeB,
  `SELECT public.hris_get_my_dashboard_data('${ids.tenantB}'::uuid)`);
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
const timesheetDirectTableRead = queryAs(employeeA, `SELECT jsonb_build_object(
  'activities',(SELECT count(*) FROM public.timesheet_activities),
  'timesheets',(SELECT count(*) FROM public.timesheets),
  'entries',(SELECT count(*) FROM public.timesheet_entries))`);
record('Timesheet context returns each linked employee’s own tenant activities and rows while RLS denies direct table reads',
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
    && timesheetDirectTableRead.activities === 0
    && timesheetDirectTableRead.timesheets === 0
    && timesheetDirectTableRead.entries === 0);

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
  travelBrowserOutput.includes('Local Auth-to-Postgres travel workflow persisted employee draft, submission, manager return, employee recovery, resubmission, approval, and history across mobile and desktop.')
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
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
} catch (error) {
  serviceBrowserError = String(error.stderr || error.message || 'local service-request browser run failed').slice(-1800);
}
const serviceBrowserId = serviceBrowserOutput.match(/SERVICE_REQUEST_ACCEPTANCE_ID=([0-9a-f-]{36})/i)?.[1];
const browserServicePersistence = serviceBrowserId ? queryAdmin(`SELECT jsonb_build_object(
  'tenant_id',tenant_id,'employee_id',employee_id,'request_type',request_type,'reason',reason,
  'status',status,'submitted_by',submitted_by IS NOT NULL)
  FROM public.service_requests WHERE id=${sqlLiteral(serviceBrowserId)}::uuid`) : null;
record('Real employee browser service-request submission and refreshed history persist at mobile and desktop widths',
  serviceBrowserOutput.includes('Local employee service-request submission and refreshed status history persisted across mobile and desktop.')
    && browserServicePersistence?.tenant_id === ids.tenantA
    && browserServicePersistence?.employee_id === '55555555-5555-4555-8555-555555555555'
    && browserServicePersistence?.request_type === 'employment_certificate'
    && browserServicePersistence?.status === 'pending'
    && browserServicePersistence?.submitted_by === true,
  serviceBrowserError || JSON.stringify(browserServicePersistence));

psqlSync(`UPDATE public.employees SET employment_status='terminated'
  WHERE id='55555555-5555-4555-8555-555555555555';`);
const terminatedEmployeeSummary = attemptAs(employeeA,
  `SELECT public.hris_get_my_dashboard_data('${ids.tenantA}'::uuid)`);
psqlSync(`UPDATE public.employees SET employment_status='active'
  WHERE id='55555555-5555-4555-8555-555555555555';`);
record('Terminated employee immediately loses self-service attendance and leave access',
  !terminatedEmployeeSummary.ok);

const leaveApproved = resolveLeave(managerA, ids.leaveApprove, 'approved', 'isolated local acceptance');
const approvedRow = tableRow('leave_requests', ids.leaveApprove);
const leaveBalance = balance(ids.leaveTypeA, 2026);
record('Tenant A leave approval applies holiday-aware balance and audit atomically',
  leaveApproved.success === true && approvedRow.status === 'approved'
  && Number(leaveBalance.pending_days) === 4 && Number(leaveBalance.used_days) === 1
  && auditCount(ids.leaveApprove, 'leave.request.approved') === 1);

const yearApproval = resolveLeave(managerA, ids.leaveYearBoundary, 'approved');
const year2026 = balance(ids.leaveTypeA, 2026);
const year2027 = balance(ids.leaveTypeA, 2027);
record('Cross-year leave updates only the matching yearly ledgers', yearApproval.success === true
  && Number(year2026.pending_days) === 3 && Number(year2026.used_days) === 2
  && Number(year2027.pending_days) === 0 && Number(year2027.used_days) === 1);

const halfReject = resolveLeave(managerA, ids.leaveHalfDay, 'rejected', 'isolated rejection');
const halfRow = tableRow('leave_requests', ids.leaveHalfDay);
const afterHalf = balance(ids.leaveTypeA, 2026);
record('Half-day rejection releases pending days without increasing used days', halfReject.success === true
  && halfRow.status === 'rejected' && Number(afterHalf.pending_days) === 2.5
  && Number(afterHalf.used_days) === 2);

const missingLedger = attemptAs(managerA, `SELECT public.admin_resolve_leave_request(
  '${ids.leaveMissingLedger}'::uuid,'approved',NULL)::jsonb`);
const missingRequest = tableRow('leave_requests', ids.leaveMissingLedger);
const missingBalance = balance(ids.leaveTypeMissingLedger, 2026);
record('Missing second-year ledger rolls back earlier updates and audit', !missingLedger.ok
  && missingRequest.status === 'pending' && Number(missingBalance.pending_days) === 1
  && Number(missingBalance.used_days) === 0 && auditCount(ids.leaveMissingLedger, 'leave.request.approved') === 0,
  missingLedger.ok ? 'unexpected approval' : 'expected transactional rejection');

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
const reportEmployeeA = attendanceReportA.find(row => row.employee_number === 'QA-A-001');
const reportEmployeeB = attendanceReportB.find(row => row.employee_number === 'QA-B-001');
const reportCrossTenantTeam = attendanceReportA.find(row => row.employee_number === 'QA-A-002');
record('Attendance report resolves same-tenant teams and suppresses cross-tenant team references',
  reportEmployeeA?.team_name === 'QA A Team'
  && reportEmployeeB?.team_name === 'QA B Team'
  && reportCrossTenantTeam?.team_name == null,
  JSON.stringify({ tenantA: reportEmployeeA?.team_name, tenantB: reportEmployeeB?.team_name,
    mismatchedTenantReference: reportCrossTenantTeam?.team_name }));
record('reports.view-only membership can read the aggregate report but not attendance details',
  attendanceReportOnlyA.some(row => row.team_name === 'QA A Team') && !attendanceDetailsReportOnly.ok);
const leaveDataB = queryAs(managerB, `SELECT public.hris_get_tenant_leave_data('${ids.tenantB}'::uuid,NULL,NULL)`);
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
  && leaveDataB.requests.length === 2
  && leaveDataB.requests.every(request => request.tenant_id === ids.tenantB));
const dashboardAValid = Number(dashboardA.team_members) === 6
  && dashboardA.dashboard_date === localCurrentDate
  && Number(dashboardA.attendance_today) === 5
  && Number(dashboardA.present_today) === 3
  && Number(dashboardA.absent_today) === 1
  && Number(dashboardA.wfo_today) === 3
  && Number(dashboardA.wfh_today) === 1
  && Number(dashboardA.client_meeting_today) === 1
  && Number(dashboardA.on_leave_today) === 2
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

const taskMemberAllocation = await employeeA.client.rpc('hris_assign_tenant_project_allocation', {
  p_tenant_id: ids.tenantA, p_project_id: projectA.id,
  p_employee_id: '55555555-5555-4555-8555-555555555556',
  p_role_on_project: 'Collaborator', p_allocation_percentage: 25,
  p_assigned_date: localCurrentDate, p_release_date: null,
});
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
record('Only the assigned Project Manager creates a task with same-project employee allocations',
  !taskMemberAllocation.error && Boolean(adminTaskCreate.error?.code === '42501')
    && Boolean(tenantManagerTaskCreate.error?.code === '42501')
    && Boolean(superAdminTaskCreate.error?.code === '42501')
    && !projectTaskCreate.error && projectTaskCreate.data?.status === 'open');

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

const taskStart = await employeeA.client.rpc('hris_start_project_task', { p_tenant_id: ids.tenantA, p_task_id: projectTaskId });
const taskCompleteDenied = await managerA.client.rpc('hris_complete_project_task', { p_tenant_id: ids.tenantA, p_task_id: projectTaskId });
const taskCompleteBySuperAdmin = await superAdmin.client.rpc('hris_complete_project_task', { p_tenant_id: ids.tenantA, p_task_id: projectTaskId });
const taskComplete = await employeeA.client.rpc('hris_complete_project_task', { p_tenant_id: ids.tenantA, p_task_id: projectTaskId });
const completedTaskWorkspace = await employeeA.client.rpc('hris_get_project_task_workspace', {
  p_tenant_id: ids.tenantA, p_project_id: projectA.id,
});
const duplicateTaskComplete = await employeeA.client.rpc('hris_complete_project_task', { p_tenant_id: ids.tenantA, p_task_id: projectTaskId });
record('Assigned Project Manager completes operational work while two mandatory reviews remain pending',
  !taskStart.error && Boolean(taskCompleteDenied.error?.code === '42501')
    && Boolean(taskCompleteBySuperAdmin.error?.code === '42501') && !taskComplete.error
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
const followupReviewCount = queryAdmin(`SELECT jsonb_build_object('count',count(*)::integer)
  FROM public.project_task_peer_reviews WHERE tenant_id='${ids.tenantA}'::uuid AND task_id='${followupTask.data?.id}'::uuid`);
record('Assigned Project Manager can add and release task members; each release tracks overlapping reviews separately',
  !followupTask.error && Boolean(unauthorizedTaskMemberAdd.error?.code === '42501')
    && !authorizedTaskMemberAdd.error && !followupMemberRelease.error
    && followupReviewCount.count === 1);

const reviewMemberA = await employeeA.client.rpc('hris_get_my_project_peer_reviews', { p_tenant_id: ids.tenantA });
const reviewMemberB = await managerA2.client.rpc('hris_get_my_project_peer_reviews', { p_tenant_id: ids.tenantA });
const reviewTenantB = await employeeB.client.rpc('hris_get_my_project_peer_reviews', { p_tenant_id: ids.tenantB });
const reviewIdsA = reviewMemberA.data?.reviews || [];
const reviewIdsB = reviewMemberB.data?.reviews || [];
const reviewAtoB = reviewIdsA.find(row => row.reviewer_employee_id === '55555555-5555-4555-8555-555555555555'
  && row.reviewee_employee_id === '55555555-5555-4555-8555-555555555556' && row.task_id === projectTaskId);
const reviewBtoA = reviewIdsB.find(row => row.reviewer_employee_id === '55555555-5555-4555-8555-555555555556'
  && row.reviewee_employee_id === '55555555-5555-4555-8555-555555555555');
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
const staggeredTask = await employeeA.client.rpc('hris_create_project_task', {
  p_tenant_id: ids.tenantA, p_project_id: projectA.id, p_title: 'Synthetic staggered overlap task',
  p_description: 'Only task members with overlapping assignment intervals are eligible reviewers.',
  p_due_date: null, p_project_allocation_ids: [staggeredEmployeeAllocation.data?.id],
});
const addOverlappingMember = await employeeA.client.rpc('hris_assign_project_task_member', {
  p_tenant_id: ids.tenantA, p_task_id: staggeredTask.data?.id,
  p_project_allocation_id: taskMemberAllocation.data?.id,
});
const staggeredWorkspace = await employeeA.client.rpc('hris_get_project_task_workspace', {
  p_tenant_id: ids.tenantA, p_project_id: projectA.id,
});
const releasedOverlappingMember = staggeredWorkspace.data?.tasks?.find(task => task.id === staggeredTask.data?.id)
  ?.members?.find(row => row.employee_id === '55555555-5555-4555-8555-555555555556');
const releaseBeforeLateMember = await employeeA.client.rpc('hris_release_project_task_member', {
  p_tenant_id: ids.tenantA, p_task_assignment_id: releasedOverlappingMember?.id,
});
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
    OR (reviewer_employee_id='55555555-5555-4555-8555-555555555557'::uuid AND employee_id='55555555-5555-4555-8555-555555555560'::uuid)
    OR (reviewer_employee_id='55555555-5555-4555-8555-555555555560'::uuid AND employee_id='55555555-5555-4555-8555-555555555557'::uuid)),false),
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
  !staggeredEmployeeAllocation.error && !lateCollaboratorAllocation.error && !staggeredTask.error
    && !addOverlappingMember.error && !releaseBeforeLateMember.error && !addNonOverlappingMember.error
    && !staggeredCompletion.error && staggeredCompletion.data?.feedback_pending === 4
    && staggeredReviewPairs.count === 4 && staggeredReviewPairs.all_expected
    && staggeredReviewPairs.nonoverlap_pair_count === 0
    && !lateCollaboratorInbox.error
    && lateCollaboratorInbox.data.reviews.filter(row => row.task_id === staggeredTask.data?.id).length === 1
    && lateCollaboratorInbox.data.reviews.some(row => row.task_id === staggeredTask.data?.id
      && row.reviewer_employee_id === '55555555-5555-4555-8555-555555555560'
      && row.reviewee_employee_id === '55555555-5555-4555-8555-555555555557')
    && Boolean(reviewAssignedToOverlappingMember.id)
    && Boolean(nonOverlappingSubmission.error?.code === '42501'),
  JSON.stringify({ addOverlappingMember: addOverlappingMember.error?.message,
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
  'status',t.status,
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
    AND t.title=${sqlLiteral(browserTaskTitle)}), 'null'::jsonb)`);
record('Real browser UI uses isolated Auth/RPC and persists task, overlapping reviews, and Not Observed in local Postgres',
  browserIntegrationOutput.includes('Mobile 375px browser-to-local-Supabase task, review submission, and performance-history journey passed.')
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

const globalOnlyAuth = queryAs(globalOnly, `SELECT jsonb_build_object(
  'global_role',EXISTS (SELECT 1 FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role_id=ur.role_id
    WHERE ur.user_id=auth.uid() AND rp.permission_id='leave.manage'),
  'legacy_permission',public.has_permission('leave.manage'),
  'tenant_a',public.has_tenant_permission('${ids.tenantA}'::uuid,'leave.manage'),
  'tenant_b',public.has_tenant_permission('${ids.tenantB}'::uuid,'leave.manage'))`);
const globalOnlyLeaves = queryAs(globalOnly, `SELECT coalesce(jsonb_agg(tenant_id ORDER BY tenant_id),'[]'::jsonb)
  FROM (SELECT DISTINCT tenant_id FROM public.leave_requests) visible`);
record('Global admin role alone grants no tenant authorization or visibility',
  globalOnlyAuth.global_role === true && globalOnlyAuth.legacy_permission === false
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
  for (const userId of createdUserIds) {
    const deleted = await adminAuth.auth.admin.deleteUser(userId);
    if (deleted.error) throw deleted.error;
  }
}
