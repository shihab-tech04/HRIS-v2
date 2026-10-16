Warning: truncated output (original token count: 95876)
Total output lines: 5470

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
  return queryAs(session, `SELECT public.admin_resolve_leave_request(${sqlLiteral(id)}::uuid, ${sqlLiteral(d…91876 tokens truncated…s_permission('leave.manage'),
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
