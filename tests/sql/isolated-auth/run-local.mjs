// Run only against a disposable Supabase CLI stack. The local GoTrue service
// creates real synthetic Auth sessions; psql uses their JWT claims as the
// authenticated database role so RLS and SECURITY DEFINER paths are exercised.
// This harness never logs local API keys, access tokens, or synthetic passwords.
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
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

function tableRow(table, id) {
  const allowed = new Set(['leave_requests', 'attendance_records', 'attendance_corrections']);
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
const adminAuth = createClient(services.API_URL, services.SERVICE_ROLE_KEY, authOptions);
const emails = [
  'manager-a@hris.test', 'manager-b@hris.test', 'no-permission@hris.test',
  'global-only@hris.test', 'tenant-viewer@hris.test',
  'employee-a@hris.test', 'employee-b@hris.test', 'manager-a2@hris.test',
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
let createdEvidenceBucket = false;
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
for (const file of [
  path.join(here, 'fixture.sql'),
  path.join(mainRoot, 'supabase/migrations/20261011_02_hris_revoke_anon_helpers.sql'),
  path.join(mainRoot, 'supabase/migrations/20261012091930_hris_tenant_membership_role_permissions.sql'),
  path.join(mainRoot, 'supabase/staging/approval-resolution/20261012_04_hris_leave_approval_tenant_guard.sql'),
  path.join(mainRoot, 'supabase/staging/approval-resolution/20261012_05_hris_attendance_approval_tenant_and_partial_fields.sql'),
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
  tenantA: '11111111-1111-4111-8111-111111111111',
  tenantB: '22222222-2222-4222-8222-222222222222',
  leaveTypeA: '99999999-9999-4999-8999-999999999901',
  leaveTypeMissingLedger: '99999999-9999-4999-8999-999999999902',
  leaveTypeB: '99999999-9999-4999-8999-999999999903',
  leaveTypeEvidence: '99999999-9999-4999-8999-999999999904',
};

const results = [];
function record(label, ok, note = '') {
  results.push({ label, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${note ? ` — ${note}` : ''}`);
}

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
  ('public.hris_get_tenant_leave_data(uuid,date,date)'),
  ('public.hris_get_my_dashboard_data(uuid)'),
  ('public.hris_employee_submit_attendance_correction(uuid,jsonb)'),
  ('public.hris_employee_submit_leave_request(uuid,jsonb)'),
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
  && sameInstant(attendanceRow.check_in, '2026-10-12T03:30:00Z')
  && sameInstant(attendanceRow.check_out, '2026-10-12T11:00:00Z')
  && attendanceRow.work_mode === 'home' && attendanceRow.client_name === 'Existing Client'
  && auditCount(ids.attendanceCorrection, 'attendance.correction.approved') === 1);

const checkoutApproved = resolveAttendance(managerA, ids.attendanceCheckoutOnly, 'approved');
const afterCheckoutOnly = tableRow('attendance_records', ids.attendanceRecord);
record('Check-out-only attendance correction preserves check-in, mode and client fields',
  checkoutApproved.success === true
  && sameInstant(afterCheckoutOnly.check_in, '2026-10-12T03:30:00Z')
  && sameInstant(afterCheckoutOnly.check_out, '2026-10-12T12:00:00Z')
  && afterCheckoutOnly.work_mode === 'home' && afterCheckoutOnly.client_name === 'Existing Client'
  && auditCount(ids.attendanceCheckoutOnly, 'attendance.correction.approved') === 1);

const workModeApproved = resolveAttendance(managerA, ids.attendanceWorkModeOnly, 'approved');
const afterWorkModeOnly = tableRow('attendance_records', ids.attendanceRecord);
record('Work-mode-only attendance correction preserves both punches and the client',
  workModeApproved.success === true
  && sameInstant(afterWorkModeOnly.check_in, '2026-10-12T03:30:00Z')
  && sameInstant(afterWorkModeOnly.check_out, '2026-10-12T12:00:00Z')
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
const dashboardAValid = Number(dashboardA.team_members) === 5
  && dashboardA.dashboard_date === localCurrentDate
  && Number(dashboardA.attendance_today) === 4
  && Number(dashboardA.present_today) === 2
  && Number(dashboardA.absent_today) === 1
  && Number(dashboardA.wfo_today) === 2
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
  for (const userId of createdUserIds) {
    const deleted = await adminAuth.auth.admin.deleteUser(userId);
    if (deleted.error) throw deleted.error;
  }
}
