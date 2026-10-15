// Focused Phase 05 acceptance: real local Auth, tenant RPC/RLS checks, and the
// existing mobile/desktop browser journey. It accepts an empty disposable
// Supabase CLI workdir or a recognized synthetic fixture left by this runner;
// it never resets a database or touches a remote project.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { createTrackedAuthUser, deleteTrackedAuthUser, signInTrackedAuthUser } from './auth-user-fixture.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const workdir = path.resolve(process.env.HRIS_SUPABASE_TEST_WORKDIR || '');
const dockerContext = process.env.HRIS_DOCKER_CONTEXT || 'colima-hris-acceptance';
const dockerHostOverride = process.env.HRIS_DOCKER_HOST_OVERRIDE;
const colimaProfile = dockerContext.startsWith('colima-') ? dockerContext.slice('colima-'.length) : dockerContext;
const expectedApiPort = process.env.HRIS_SUPABASE_API_PORT || '59621';
const expectedDbPort = process.env.HRIS_SUPABASE_DB_PORT || '59622';
if (!workdir.startsWith('/private/tmp/synesis-hris-contact-')) {
  throw new Error('Refusing to run: use the explicitly disposable /private/tmp HRIS contact test workdir.');
}

if (dockerHostOverride) {
  const override = new URL(dockerHostOverride);
  if (override.protocol !== 'tcp:' || override.hostname !== '127.0.0.1'
      || !override.port || Number(override.port) < 1024 || Number(override.port) > 65535) {
    throw new Error('Refusing a non-loopback Docker host override for the disposable contact test.');
  }
}
const dockerEndpoint = dockerHostOverride || execFileSync('docker', [
  'context', 'inspect', dockerContext, '--format', '{{.Endpoints.docker.Host}}',
], { encoding: 'utf8' }).trim();
const cliEnv = {
  ...process.env,
  DOCKER_HOST: dockerEndpoint,
  SUPABASE_HOME: process.env.SUPABASE_HOME || '/private/tmp/synesis-supabase-home',
  SUPABASE_TELEMETRY_DISABLED: '1',
};
if (dockerHostOverride) delete cliEnv.DOCKER_CONTEXT;
else cliEnv.DOCKER_CONTEXT = dockerContext;
const dockerArgs = (...args) => [
  ...(dockerHostOverride ? ['--host', dockerEndpoint] : ['--context', dockerContext]),
  ...args,
];
function runDocker(args, options = {}) {
  if (dockerHostOverride) {
    return execFileSync('colima', [
      'ssh', '--profile', colimaProfile, '--', 'docker', ...args,
    ], { env: cliEnv, ...options });
  }
  return execFileSync('docker', dockerArgs(...args), { env: cliEnv, ...options });
}
const statusText = execFileSync('supabase', ['status', '--output', 'env', '--workdir', workdir], {
  cwd: repo, env: cliEnv, encoding: 'utf8',
});
function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const value = match[2].trim();
    values[match[1]] = value.startsWith('"') ? JSON.parse(value) : value;
  }
  return values;
}
const services = parseEnv(statusText);
if (!services.API_URL || !services.ANON_KEY || !services.SERVICE_ROLE_KEY || !services.DB_URL) {
  throw new Error('The local Supabase CLI did not return the expected disposable service settings.');
}
if (process.env.HRIS_SUPABASE_API_URL_OVERRIDE) {
  const override = new URL(process.env.HRIS_SUPABASE_API_URL_OVERRIDE);
  if (override.protocol !== 'http:' || override.hostname !== '127.0.0.1') {
    throw new Error('Refusing a non-loopback API override for the disposable contact test.');
  }
  services.API_URL = override.origin;
}
const apiUrl = new URL(services.API_URL);
const dbUrl = new URL(services.DB_URL);
if (apiUrl.hostname !== '127.0.0.1' || apiUrl.port !== expectedApiPort
    || dbUrl.hostname !== '127.0.0.1' || dbUrl.port !== expectedDbPort) {
  throw new Error(`Refusing to run: expected only local ports ${expectedApiPort}/${expectedDbPort}.`);
}

const dbContainer = runDocker([
  'ps', '--filter', `name=supabase_db_${path.basename(workdir)}`, '--format', '{{.Names}}',
], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
if (!dbContainer) throw new Error('No Postgres container matched the disposable workdir.');
function psql(sql) {
  return runDocker([
    'exec', '-i', dbContainer, 'psql', '-X', '-A', '-t', '-q',
    '--set=ON_ERROR_STOP=1', '--username', 'postgres', '--dbname', 'postgres',
  ], { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}
function sqlLiteral(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function jsonQuery(sql) {
  const output = psql(sql);
  try { return JSON.parse(output.split(/\r?\n/).at(-1)); }
  catch (error) {
    throw new Error(`Disposable Postgres JSON query returned invalid output (${output.length} characters): ${error.message}`);
  }
}
function sqlOutcomeAsUser(userId, expression) {
  const claims = JSON.stringify({ sub: userId, role: 'authenticated' });
  const output = psql(`BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',${sqlLiteral(claims)},true);
SELECT set_config('request.jwt.claim.sub',${sqlLiteral(userId)},true);
DO $outcome$
DECLARE v_code text;
BEGIN
  BEGIN
    PERFORM ${expression};
    v_code:='allowed';
  EXCEPTION WHEN OTHERS THEN
    v_code:=SQLSTATE;
  END;
  PERFORM set_config('hris.test_outcome',v_code,true);
END
$outcome$;
SELECT current_setting('hris.test_outcome');
COMMIT;`);
  return output.split(/\r?\n/).at(-1);
}

const authOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(services.API_URL, services.SERVICE_ROLE_KEY, authOptions);
const baseline = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (baseline.error) throw baseline.error;
const counts = jsonQuery(`SELECT jsonb_build_object(
  'users',(SELECT count(*) FROM auth.users),
  'tables',(SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname='public' AND tablename <> 'schema_migrations'),
  'buckets',(SELECT count(*) FROM storage.buckets),
  'objects',(SELECT count(*) FROM storage.objects))`);
if (baseline.data.users.length || counts.users !== 0 || counts.buckets !== 0 || counts.objects !== 0) {
  throw new Error(`Refusing to seed a local workdir with Auth users or Storage data: ${JSON.stringify(counts)}.`);
}
const emptyDatabase = counts.tables === 0;
if (!emptyDatabase) {
  const fixture = jsonQuery(`SELECT jsonb_build_object(
    'tenant_count',(SELECT count(*) FROM public.tenants),
    'tenant_ids',(SELECT array_agg(id::text ORDER BY id) FROM public.tenants),
    'employee_count',(SELECT count(*) FROM public.employees),
    'synthetic_employees',(SELECT COALESCE(bool_and(full_name LIKE 'Synthetic %' AND employee_number LIKE 'QA-%'),false) FROM public.employees),
    'membership_count',(SELECT count(*) FROM public.tenant_memberships),
    'directory_rpc',to_regprocedure('public.hris_get_tenant_employee_directory(uuid,text,uuid,text,integer,integer)') IS NOT NULL,
    'contact_rpc',to_regprocedure('public.hris_update_tenant_employee_contact_details(uuid,uuid,jsonb)') IS NOT NULL)`);
  if (counts.tables !== 47 || fixture.tenant_count !== 2
      || JSON.stringify(fixture.tenant_ids) !== JSON.stringify([
        '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
      ]) || fixture.employee_count !== 7 || !fixture.synthetic_employees
      || ![3, 10].includes(fixture.membership_count) || !fixture.directory_rpc || !fixture.contact_rpc) {
    throw new Error(`Refusing to reuse a non-empty, unrecognized local fixture: ${JSON.stringify({ counts, fixture })}.`);
  }
  console.log('Using the verified synthetic fixture and relinking disposable test identities; no live tenant data is present.');
}

const emails = [
  'manager-a@hris.test', 'manager-b@hris.test', 'no-permission@hris.test',
  'global-only@hris.test', 'employee-a@hris.test', 'employee-b@hris.test',
  'employee-directory-a@hris.test',
];
const password = randomBytes(24).toString('base64url');
const createdUserIds = [];
const results = [];
let fixtureReady = false;
function record(name, passed, detail = '') {
  results.push({ name, passed: Boolean(passed) });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

try {
  for (const email of emails) {
    await createTrackedAuthUser({
      email,
      createUser: () => admin.auth.admin.createUser({ email, password, email_confirm: true }),
      findUserId: async (targetEmail) => psql(
        `SELECT id FROM auth.users WHERE lower(email)=lower(${sqlLiteral(targetEmail)}) LIMIT 1;`,
      ) || null,
      trackUserId: (id) => { if (!createdUserIds.includes(id)) createdUserIds.push(id); },
    });
  }

  if (emptyDatabase) {
    psql(readFileSync(path.join(here, 'fixture.sql'), 'utf8'));
    for (const migration of [
      '20261012091930_hris_tenant_membership_role_permissions.sql',
      '20261013073243_hris_tenant_employee_directory.sql',
      '20261014171952_employee_contact_details_editing.sql',
    ]) psql(readFileSync(path.join(repo, 'supabase/migrations', migration), 'utf8'));
  } else {
    psql(`DELETE FROM public.tenant_memberships;
DELETE FROM public.user_roles;
DELETE FROM public.admin_users;
INSERT INTO public.admin_users(user_id,display_name,active,is_super_admin)
  SELECT id,email,true,false FROM auth.users
  WHERE email IN ('manager-a@hris.test','manager-b@hris.test','global-only@hris.test');
INSERT INTO public.user_roles(user_id,role_id)
  SELECT id,'qa_global_manager' FROM auth.users
  WHERE email IN ('manager-a@hris.test','manager-b@hris.test','global-only@hris.test');
INSERT INTO public.tenant_memberships(tenant_id,user_id,role,status)
  SELECT '11111111-1111-4111-8111-111111111111',id,'qa_tenant_admin_a','active'
  FROM auth.users WHERE email='manager-a@hris.test';
INSERT INTO public.tenant_memberships(tenant_id,user_id,role,status)
  SELECT '22222222-2222-4222-8222-222222222222',id,'qa_tenant_manager_b','active'
  FROM auth.users WHERE email='manager-b@hris.test';
INSERT INTO public.tenant_memberships(tenant_id,user_id,role,status)
  SELECT '11111111-1111-4111-8111-111111111111',id,'qa_tenant_employee_viewer_a','active'
  FROM auth.users WHERE email='employee-directory-a@hris.test';
UPDATE public.employees SET user_id=(SELECT id FROM auth.users WHERE email='employee-a@hris.test')
  WHERE id='55555555-5555-4555-8555-555555555555'::uuid;
UPDATE public.employees SET user_id=(SELECT id FROM auth.users WHERE email='employee-b@hris.test')
  WHERE id='66666666-6666-4666-8666-666666666666'::uuid;`);
  }
  fixtureReady = true;
  psql("NOTIFY pgrst, 'reload schema';");
  psql(`UPDATE public.employees SET official_email='employee-a@hris.test',personal_email='personal-a@hris.test',
    phone='+880 1700 000001',official_phone='+880 2 5550001',address='QA A home address',
    mailing_address='QA A mailing address',emergency_contact_name='QA A emergency contact',
    emergency_contact_phone='+880 1700 000101',emergency_contact_relation='Parent'
    WHERE id='55555555-5555-4555-8555-555555555555'::uuid;
    DELETE FROM public.admin_audit_logs WHERE target_id='55555555-5555-4555-8555-555555555555'
      AND action='employee.contact_details_updated';`);
  await new Promise(resolve => setTimeout(resolve, 500));

  async function signIn(email) {
    const client = createClient(services.API_URL, services.ANON_KEY, authOptions);
    const result = await signInTrackedAuthUser({
      signIn: () => client.auth.signInWithPassword({ email, password }),
    });
    return { client, userId: result.user.id, session: result.session };
  }
  const managerA = await signIn('manager-a@hris.test');
  const managerB = await signIn('manager-b@hris.test');
  const directoryViewer = await signIn('employee-directory-a@hris.test');
  const anonymous = createClient(services.API_URL, services.ANON_KEY, authOptions);
  const tenantA = '11111111-1111-4111-8111-111111111111';
  const tenantB = '22222222-2222-4222-8222-222222222222';
  const employeeA = '55555555-5555-4555-8555-555555555555';
  const employeeB = '66666666-6666-4666-8666-666666666666';
  const userId = (email) => psql(`SELECT id FROM auth.users WHERE email=${sqlLiteral(email)};`);
  const noPermissionId = userId('no-permission@hris.test');
  const globalOnlyId = userId('global-only@hris.test');
  const employeeUserId = userId('employee-a@hris.test');
  const directoryViewerId = userId('employee-directory-a@hris.test');
  const readArgs = { p_tenant_id: tenantA, p_employee_id: employeeA };
  const managerRead = await managerA.client.rpc('hris_get_tenant_employee_contact_details', readArgs);
  const managerBRead = await managerB.client.rpc('hris_get_tenant_employee_contact_details', {
    p_tenant_id: tenantB, p_employee_id: employeeB,
  });
  const readDeniedCodes = [directoryViewerId, noPermissionId, globalOnlyId, employeeUserId].map(id =>
    sqlOutcomeAsUser(id, `public.hris_get_tenant_employee_contact_details(${sqlLiteral(tenantA)}::uuid,${sqlLiteral(employeeA)}::uuid)`));
  const crossTenantRead = await managerA.client.rpc('hris_get_tenant_employee_contact_details', {
    p_tenant_id: tenantB, p_employee_id: employeeB,
  });
  const anonymousRead = await anonymous.rpc('hris_get_tenant_employee_contact_details', readArgs);
  record('Active tenant employees.manage membership alone reads contact data; other roles, anonymous, and cross-tenant requests are denied',
    !managerRead.error && managerRead.data?.official_email === 'employee-a@hris.test'
      && !managerBRead.error && managerBRead.data?.official_email === 'employee-b@hris.test'
      && readDeniedCodes.every(code => code === '42501')
      && crossTenantRead.error?.code === '42501' && Boolean(anonymousRead.error),
    JSON.stringify({ manager: managerRead.error?.code || managerRead.data?.official_email || 'allowed',
      managerError: managerRead.error ? { code: managerRead.error.code, message: managerRead.error.message } : null,
      managerDataKeys: managerRead.data && typeof managerRead.data === 'object' ? Object.keys(managerRead.data) : [],
      managerB: managerBRead.error?.code || managerBRead.data?.official_email || 'allowed',
      denied: readDeniedCodes, crossTenant: crossTenantRead.error?.code, anonymousDenied: Boolean(anonymousRead.error) }));

  const updatePayload = {
    official_email: 'employee-a-updated@hris.test', personal_email: 'employee-a-new@hris.test',
    phone: '+880 1700 000002', official_phone: '+880 2 5550002', address: 'QA A updated home address',
    mailing_address: 'QA A updated mailing address', emergency_contact_name: 'QA A updated contact',
    emergency_contact_phone: '+880 1700 000102', emergency_contact_relation: 'Sibling',
  };
  const protectedBefore = jsonQuery(`SELECT to_jsonb(e)-ARRAY[
    'official_email','personal_email','phone','official_phone','address','mailing_address',
    'emergency_contact_name','emergency_contact_phone','emergency_contact_relation','updated_at'
  ] FROM public.employees e WHERE e.id=${sqlLiteral(employeeA)}::uuid`);
  const invalidFieldAttempts = [];
  const tryInvalidField = () => managerA.client.rpc('hris_update_tenant_employee_contact_details', {
    ...readArgs, p_contact_details: { ...updatePayload, employment_status: 'terminated' },
  });
  let invalidField = await tryInvalidField();
  invalidFieldAttempts.push(invalidField.error?.code || 'allowed');
  if (invalidField.error?.code === '57014') {
    invalidField = await tryInvalidField();
    invalidFieldAttempts.push(invalidField.error?.code || 'allowed');
  }
  const invalidEmail = await managerA.client.rpc('hris_update_tenant_employee_contact_details', {
    ...readArgs, p_contact_details: { ...updatePayload, official_email: 'not-an-email' },
  });
  const longAddress = await managerA.client.rpc('hris_update_tenant_employee_contact_details', {
    ...readArgs, p_contact_details: { ...updatePayload, address: 'x'.repeat(501) },
  });
  const duplicateEmail = await managerA.client.rpc('hris_update_tenant_employee_contact_details', {
    ...readArgs, p_contact_details: { ...updatePayload, official_email: 'employee-a-absent@hris.test' },
  });
  const contactUpdateJson = sqlLiteral(JSON.stringify(updatePayload));
  const deniedWriteCodes = [directoryViewerId, noPermissionId, globalOnlyId, employeeUserId].map(id =>
    sqlOutcomeAsUser(id, `public.hris_update_tenant_employee_contact_details(${sqlLiteral(tenantA)}::uuid,${sqlLiteral(employeeA)}::uuid,${contactUpdateJson}::jsonb)`));
  const crossTenantWrite = await managerA.client.rpc('hris_update_tenant_employee_contact_details', {
    p_tenant_id: tenantB, p_employee_id: employeeB, p_contact_details: updatePayload,
  });
  const anonymousWrite = await anonymous.rpc('hris_update_tenant_employee_contact_details', {
    ...readArgs, p_contact_details: updatePayload,
  });
  const directWrite = await managerA.client.from('employees')
    .update({ employment_status: 'terminated' }).eq('id', employeeA).select('id');
  const saved = await managerA.client.rpc('hris_update_tenant_employee_contact_details', {
    ...readArgs, p_contact_details: updatePayload,
  });
  const protectedAfter = jsonQuery(`SELECT to_jsonb(e)-ARRAY[
    'official_email','personal_email','phone','official_phone','address','mailing_address',
    'emergency_contact_name','emergency_contact_phone','emergency_contact_relation','updated_at'
  ] FROM public.employees e WHERE e.id=${sqlLiteral(employeeA)}::uuid`);
  const audit = jsonQuery(`SELECT jsonb_build_object('count',count(*),'details',max(details::text))
    FROM public.admin_audit_logs WHERE target_type='employees' AND target_id=${sqlLiteral(employeeA)}
      AND action='employee.contact_details_updated'`);
  const protectedFieldsUnchanged = JSON.stringify(protectedBefore) === JSON.stringify(protectedAfter);
  const auditIsFieldOnly = audit.count === 1 && audit.details.includes('official_email')
    && audit.details.includes('emergency_contact_phone') && !audit.details.includes(updatePayload.official_email);
  const expectedValidation = invalidField.error?.code === '22023' && invalidEmail.error?.code === '22023'
    && longAddress.error?.code === '22023' && duplicateEmail.error?.code === '23505';
  const directWriteDenied = Boolean(directWrite.error)
    || (Array.isArray(directWrite.data) && directWrite.data.length === 0);
  const expectedDenials = deniedWriteCodes.every(code => code === '42501')
    && crossTenantWrite.error?.code === '42501' && Boolean(anonymousWrite.error) && directWriteDenied;
  const saveSucceeded = !saved.error && saved.data?.official_email === updatePayload.official_email;
  record('Backend allows contact-only saves, rejects lifecycle/org fields and invalid/duplicate values, denies direct writes, and audits changed field names',
    expectedValidation && expectedDenials && saveSucceeded && protectedFieldsUnchanged && auditIsFieldOnly,
    JSON.stringify({ invalidField: invalidField.error?.code, invalidEmail: invalidEmail.error?.code,
      invalidFieldAttempts,
      longAddress: longAddress.error?.code, duplicateEmail: duplicateEmail.error?.code,
      unauthorizedWrites: deniedWriteCodes, crossTenantWrite: crossTenantWrite.error?.code,
      anonymousWriteDenied: Boolean(anonymousWrite.error), directWrite: directWrite.error?.code || `rows=${directWrite.data?.length}`,
      save: saved.error?.code || 'saved', auditCount: audit.count,
      protectedFieldsUnchanged, auditIsFieldOnly, expectedValidation, expectedDenials, saveSucceeded,
      protectedBefore, protectedAfter, auditDetails: audit.details }));

  psql(`UPDATE public.employees SET official_email='employee-a@hris.test',personal_email='personal-a@hris.test',
    phone='+880 1700 000001',official_phone='+880 2 5550001',address='QA A home address',
    mailing_address='QA A mailing address',emergency_contact_name='QA A emergency contact',
    emergency_contact_phone='+880 1700 000101',emergency_contact_relation='Parent'
    WHERE id=${sqlLiteral(employeeA)}::uuid;
    DELETE FROM public.admin_audit_logs WHERE target_id=${sqlLiteral(employeeA)}
      AND action='employee.contact_details_updated';`);

  psql(`UPDATE public.tenant_memberships SET status='inactive'
    WHERE tenant_id=${sqlLiteral(tenantA)}::uuid AND user_id=${sqlLiteral(managerA.userId)}::uuid`);
  let inactiveMembership;
  try {
    inactiveMembership = await managerA.client.rpc('hris_get_tenant_employee_contact_details', readArgs);
  } finally {
    psql(`UPDATE public.tenant_memberships SET status='active'
      WHERE tenant_id=${sqlLiteral(tenantA)}::uuid AND user_id=${sqlLiteral(managerA.userId)}::uuid`);
  }
  psql(`UPDATE public.tenants SET is_active=false WHERE id=${sqlLiteral(tenantA)}::uuid`);
  let inactiveTenantRead;
  let inactiveTenantWrite;
  try {
    inactiveTenantRead = await managerA.client.rpc('hris_get_tenant_employee_contact_details', readArgs);
    inactiveTenantWrite = await managerA.client.rpc('hris_update_tenant_employee_contact_details', {
      ...readArgs, p_contact_details: updatePayload,
    });
  } finally {
    psql(`UPDATE public.tenants SET is_active=true WHERE id=${sqlLiteral(tenantA)}::uuid`);
  }
  record('Inactive membership and inactive tenant deny both contact reads and writes',
    inactiveMembership.error?.code === '42501' && inactiveTenantRead.error?.code === '42501'
      && inactiveTenantWrite.error?.code === '42501',
    JSON.stringify({ membership: inactiveMembership.error?.code, tenantRead: inactiveTenantRead.error?.code,
      tenantWrite: inactiveTenantWrite.error?.code }));

  let browserOutput = '';
  let browserError = '';
  try {
    browserOutput = execFileSync('node', [path.join(here, 'run-employee-directory-browser.mjs')], {
      cwd: repo,
      env: {
        ...process.env,
        HRIS_LOCAL_SUPABASE_URL: services.API_URL,
        HRIS_LOCAL_SUPABASE_ANON_KEY: services.ANON_KEY,
        HRIS_LOCAL_TEST_PASSWORD: password,
        HRIS_LOCAL_EMPLOYEE_DIRECTORY_EMAIL: 'employee-directory-a@hris.test',
        HRIS_LOCAL_EMPLOYEE_DIRECTORY_MANAGER_EMAIL: 'manager-a@hris.test',
        HRIS_LOCAL_EMPLOYEE_DIRECTORY_TENANT_ID: tenantA,
      },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    const detail = String(error?.stderr || error?.message || 'Browser journey failed.').trim();
    const journeyFailure = detail.match(/Error: Employee directory sign-in did not reach workspace:[^\r\n]*/);
    browserError = journeyFailure?.[0] || `${detail.slice(0, 500)} … ${detail.slice(-350)}`.slice(0, 900);
  }
  const afterBrowser = jsonQuery(`SELECT jsonb_build_object('official_email',official_email,'phone',phone,
    'address',address,'team_id',team_id,'department_id',department_id,'designation_id',designation_id,
    'joining_date',joining_date,'employment_status',employment_status)
    FROM public.employees WHERE id=${sqlLiteral(employeeA)}::uuid`);
  record('Real Auth-to-Postgres directory/contact journey passes EN/BN, mobile/desktop, retry, save/cancel, and refresh recovery',
    browserOutput.includes('Local Auth-to-Postgres employee directory and contact-editing journey passed')
      && afterBrowser.official_email === 'employee-a-updated@hris.test'
      && afterBrowser.address === 'QA A updated home address'
      && afterBrowser.team_id === 'dddddddd-0000-4000-8000-000000000001'
      && afterBrowser.department_id === 'eeeeeeee-0000-4000-8000-000000000001'
      && afterBrowser.designation_id === 'ffffffff-0000-4000-8000-000000000001'
      && afterBrowser.joining_date === '2026-01-01' && afterBrowser.employment_status === 'active'
      && !browserError,
    browserError || browserOutput.split('\n').at(-1));
} catch (error) {
  record('Focused Phase 05 acceptance setup and backend execution completes', false,
    `${error?.name || 'Error'}: ${String(error?.message || error).split('\n')[0].slice(0, 240)}`);
} finally {
  if (fixtureReady) {
    try {
      psql(`UPDATE public.employees SET official_email='employee-a@hris.test',personal_email='personal-a@hris.test',
        phone='+880 1700 000001',official_phone='+880 2 5550001',address='QA A home address',
        mailing_address='QA A mailing address',emergency_contact_name='QA A emergency contact',
        emergency_contact_phone='+880 1700 000101',emergency_contact_relation='Parent'
        WHERE id='55555555-5555-4555-8555-555555555555'::uuid;
        DELETE FROM public.admin_audit_logs WHERE target_id='55555555-5555-4555-8555-555555555555'
          AND action='employee.contact_details_updated';`);
    } catch (error) {
      record('Synthetic contact fixture and audit history reset', false,
        `${error?.name || 'Error'}: ${String(error?.message || error).split('\n')[0].slice(0, 240)}`);
    }
  }
  const cleanupFailures = [];
  for (const userId of createdUserIds) {
    try {
      await deleteTrackedAuthUser({
        userId,
        deleteUser: () => admin.auth.admin.deleteUser(userId),
        userStillExists: async id => psql(`SELECT EXISTS(SELECT 1 FROM auth.users WHERE id=${sqlLiteral(id)}::uuid);`) === 't',
      });
    } catch (error) {
      cleanupFailures.push(`${error?.status || error?.code || error?.name || 'error'}`);
    }
  }
  record('Tracked synthetic Auth identities are deleted', cleanupFailures.length === 0,
    cleanupFailures.length ? `${cleanupFailures.length} of ${createdUserIds.length} deletions failed` : `deleted=${createdUserIds.length}`);
}

try {
  const remainingUsers = Number(psql('SELECT count(*) FROM auth.users;'));
  record('All synthetic Auth identities are removed from the disposable test project', remainingUsers === 0,
    `remaining=${remainingUsers}`);
} catch (error) {
  record('All synthetic Auth identities are removed from the disposable test project', false,
    `cleanup verification unavailable: ${error?.name || 'Error'}`);
}
const failed = results.filter(result => !result.passed);
console.log(`\nPhase 05 isolated acceptance: ${results.length - failed.length}/${results.length} passed; ${failed.length} failed.`);
if (failed.length) process.exitCode = 1;
