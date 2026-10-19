// Real local Supabase Auth + PostgreSQL acceptance for the Phase 2A/2B staging RPCs.
// This runner refuses non-disposable projects and only cleans users it creates.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { createTrackedAuthUser, signInTrackedAuthUser } from '../isolated-auth/auth-user-fixture.mjs';
import { runPhase2aBrowserAcceptance } from './run-browser.mjs';
import { runPhase03OptionalModuleAuthAcceptance } from '../phase03/run-auth-api.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const workdir = path.resolve(process.env.HRIS_PHASE2A_TEST_WORKDIR || '/private/tmp/synesis-hris-phase2a-20261014');
const dockerContext = process.env.HRIS_DOCKER_CONTEXT || 'colima-hris-acceptance';
const expectedProjectId = process.env.HRIS_PHASE2A_PROJECT_ID || 'synesis-hris-phase2a-20261014';
const expectedApiPort = process.env.HRIS_PHASE2A_API_PORT || '58321';
const expectedDbPort = process.env.HRIS_PHASE2A_DB_PORT || '58322';
const allowedTempRoot = process.env.GITHUB_ACTIONS === 'true' ? '/tmp/' : '/private/tmp/';
const env = {
  ...process.env,
  SUPABASE_HOME: process.env.SUPABASE_HOME || '/private/tmp/synesis-supabase-home',
  SUPABASE_TELEMETRY_DISABLED: '1',
  DOCKER_CONTEXT: dockerContext,
};
if (!workdir.startsWith(allowedTempRoot)) throw new Error(`Refusing to run outside ${allowedTempRoot}.`);

function run(command, args, options = {}) {
  return execFileSync(command, args, { cwd: root, env, encoding: 'utf8', ...options });
}
function parseEnv(raw) {
  return Object.fromEntries(raw.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    return match ? [[match[1], match[2].startsWith('"') ? JSON.parse(match[2]) : match[2]]] : [];
  }));
}
const config = readFileSync(path.join(workdir, 'supabase/config.toml'), 'utf8');
const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
if (projectId !== expectedProjectId || !projectId.startsWith('synesis-hris-phase2a-')) {
  throw new Error('Refusing to run: Supabase project ID is not the dedicated Phase 2A test project.');
}
const services = parseEnv(run('supabase', ['status', '--output', 'env', '--workdir', workdir]));
const apiUrl = new URL(services.API_URL || '');
const dbUrl = new URL(services.DB_URL || '');
if (apiUrl.hostname !== '127.0.0.1' || apiUrl.port !== expectedApiPort
    || dbUrl.hostname !== '127.0.0.1' || dbUrl.port !== expectedDbPort) {
  throw new Error('Refusing to run: local API/database ports do not match the dedicated Phase 2A stack.');
}
if (run('docker', ['--context', dockerContext, 'context', 'show']).trim() !== dockerContext) {
  throw new Error('Refusing to run outside the isolated HRIS Docker context.');
}
const dbContainer = run('docker', [
  '--context', dockerContext, 'ps', '--filter', `name=supabase_db_${path.basename(workdir)}`, '--format', '{{.Names}}',
]).trim().split(/\r?\n/)[0];
if (!dbContainer) throw new Error('No Postgres container matched the dedicated Phase 2A test project.');
function psql(sql) {
  return run('docker', [
    '--context', dockerContext, 'exec', '-i', dbContainer, 'psql', '-X', '-A', '-t', '-q',
    '--set=ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres',
  ], { input: sql });
}
const sqlLiteral = value => `'${String(value).replaceAll("'", "''")}'`;
const admin = createClient(services.API_URL, services.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(services.API_URL, services.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const startingUsers = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (startingUsers.error) throw startingUsers.error;
if (startingUsers.data.users.length !== 0) {
  throw new Error('Refusing to run: the dedicated local Auth project is not empty. No users were inspected or removed.');
}

const stamp = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const password = `Phase2A-${randomBytes(24).toString('base64url')}`;
const users = [
  { key: 'super', email: `phase2a-super-${stamp}@synesisit.info`, confirmed: true },
  { key: 'ordinary', email: `phase2a-ordinary-${stamp}@synesisit.info`, confirmed: true },
  { key: 'firstAdmin', email: `phase2a-first-admin-${stamp}@hris.test`, confirmed: true },
  { key: 'recruiter', email: `phase2a-recruiter-${stamp}@hris.test`, confirmed: true },
  { key: 'unconfirmed', email: `phase2a-unconfirmed-${stamp}@hris.test`, confirmed: false },
];
const secondAdmin = { key: 'secondAdmin', email: `phase2b-second-admin-${stamp}@hris.test`, confirmed: true };
const createdUsers = [];
const signedIn = [];
let fixtureApplied = false;
let checks = 0;
const check = (condition, label) => {
  assert.ok(condition, label);
  checks += 1;
  process.stdout.write(`PHASE2A PASS: ${label}\n`);
};
const requireError = (result, code, label) => check(Boolean(result.error && result.error.code === code), label);
async function createUser(user) {
  const created = await createTrackedAuthUser({
    email: user.email,
    createUser: () => admin.auth.admin.createUser({
      email: user.email, password, email_confirm: user.confirmed,
    }),
    findUserId: async email => psql(
      `SELECT id FROM auth.users WHERE lower(email)=lower(${sqlLiteral(email)}) LIMIT 1;`,
    ).trim() || null,
    trackUserId: id => { if (!createdUsers.includes(id)) createdUsers.push(id); },
  });
  user.id = created.id;
}
async function signIn(user) {
  const client = createClient(services.API_URL, services.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await signInTrackedAuthUser({
    signIn: () => client.auth.signInWithPassword({ email: user.email, password }),
  });
  const session = result.session;
  signedIn.push({ client, session });
  return { ...user, client, session };
}
async function cleanup() {
  for (const { client } of signedIn) await client.auth.signOut().catch(() => {});
  if (createdUsers.length && fixtureApplied) {
    const ids = createdUsers.map(id => `'${id}'::uuid`).join(',');
    const testTenantRows = psql("SELECT id FROM public.tenants WHERE code LIKE 'P2A%' OR code LIKE 'P2B%';").trim();
    const tenantIds = testTenantRows ? testTenantRows.split(/\r?\n/) : [];
    const tenantIdSql = tenantIds.map(id => `'${id}'::uuid`).join(',');
    psql(`DELETE FROM public.tenant_memberships WHERE user_id IN (${ids})${tenantIdSql ? ` OR tenant_id IN (${tenantIdSql})` : ''};`);
    psql(`DELETE FROM public.admin_audit_logs WHERE actor_id IN (${ids}) OR target_id IN (
      SELECT id::text FROM public.tenants WHERE code LIKE 'P2A%' OR code LIKE 'P2B%'
    );`);
    psql(`DELETE FROM public.admin_users WHERE user_id IN (${ids});`);
    if (tenantIdSql) psql(`DELETE FROM public.tenants WHERE id IN (${tenantIdSql});`);
  }
  for (const userId of createdUsers) {
    const deleted = await admin.auth.admin.deleteUser(userId);
    if (deleted.error) throw deleted.error;
  }
  const usersAtEnd = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersAtEnd.error || usersAtEnd.data.users.length !== 0) {
    throw usersAtEnd.error || new Error('Phase 2A cleanup did not return local Auth to an empty state.');
  }
}

try {
  psql(readFileSync(path.join(root, 'tests/sql/phase2a/supabase-fixture.sql'), 'utf8'));
  fixtureApplied = true;
  for (const user of users) await createUser(user);
  const ids = users.map(user => `'${user.id}'::uuid`).join(',');
  const matchedUsers = Number(psql(`SELECT count(*) FROM auth.users WHERE id IN (${ids});`).trim());
  check(matchedUsers === users.length, 'GoTrue Auth identities map to the selected local PostgreSQL project');
  psql(`
    INSERT INTO public.admin_users(user_id,active,is_super_admin) VALUES
      ('${users[0].id}',true,true),('${users[1].id}',true,false);
  `);
  psql(readFileSync(path.join(root, 'supabase/staging/phase2a/first_admin_guard.staging.sql'), 'utf8'));
  psql(readFileSync(path.join(root, 'supabase/staging/phase2a/tenant_provisioning.staging.sql'), 'utf8'));
  psql(readFileSync(path.join(root, 'supabase/staging/phase2b/platform_tenant_admin_email.staging.sql'), 'utf8'));
  psql("NOTIFY pgrst, 'reload schema';");

  const superAdmin = await signIn(users[0]);
  const ordinary = await signIn(users[1]);
  const firstAdmin = await signIn(users[2]);
  const recruiter = await signIn(users[3]);
  const unconfirmed = users[4];
  await createUser(secondAdmin);

  const superCheck = await superAdmin.client.rpc('platform_hris_is_super_admin');
  const ordinaryCheck = await ordinary.client.rpc('platform_hris_is_super_admin');
  check(!superCheck.error && superCheck.data === true && !ordinaryCheck.error && ordinaryCheck.data === false,
    'Real GoTrue sessions resolve super-admin authority from the server-side admin record');

  const anonList = await anon.rpc('platform_hris_list_tenants');
  requireError(anonList, '42501', 'Anonymous RPC tenant listing is denied');
  const ordinaryList = await ordinary.client.rpc('platform_hris_list_tenants');
  requireError(ordinaryList, '42501', 'Ordinary authenticated tenant listing is denied');
  const ordinaryProvision = await ordinary.client.rpc('platform_hris_provision_tenant', {
    p_code: 'P2A_UNAUTH', p_slug: 'p2a-unauthorized', p_name: 'Unauthorized',
    p_timezone: 'Asia/Dhaka', p_default_locale: 'en', p_admin_user_id: firstAdmin.id,
  });
  requireError(ordinaryProvision, '42501', 'Ordinary authenticated tenant provisioning is denied');
  const ordinaryProvisionByEmail = await ordinary.client.rpc('platform_hris_provision_tenant_by_email', {
    p_code: 'P2B_UNAUTH', p_slug: 'p2b-unauthorized', p_name: 'Unauthorized',
    p_timezone: 'Asia/Dhaka', p_default_locale: 'en', p_admin_email: secondAdmin.email,
  });
  requireError(ordinaryProvisionByEmail, '42501', 'Ordinary authenticated email-based tenant provisioning is denied');
  const directTenantRead = await ordinary.client.from('tenants').select('id');
  check(!directTenantRead.error && directTenantRead.data.length === 0,
    'Direct tenant reads are filtered by RLS for ordinary authenticated users');

  const seedTenant = await admin.from('tenants').select('id,name').eq('slug', 'synesis-it').single();
  assert.ifError(seedTenant.error);
  const ordinaryBootstrap = await ordinary.client.from('tenant_memberships').insert({
    tenant_id: seedTenant.data.id, user_id: ordinary.id, role: 'hr_admin', status: 'active',
  });
  requireError(ordinaryBootstrap, '42501', 'A domain email cannot self-enroll as first tenant admin without super-admin authority');
  const superBootstrap = await superAdmin.client.from('tenant_memberships').insert({
    tenant_id: seedTenant.data.id, user_id: superAdmin.id, role: 'hr_admin', status: 'active',
  });
  check(!superBootstrap.error, 'The authorized platform super-admin retains the guarded first-admin flow');

  psql(readFileSync(path.join(root, 'tests/sql/phase03/auth_module_fixture.sql'), 'utf8'));
  psql(readFileSync(path.join(root, 'supabase/staging/phase03/tenant_optional_modules.staging.sql'), 'utf8'));
  psql("NOTIFY pgrst, 'reload schema';");
  await runPhase03OptionalModuleAuthAcceptance({
    admin, superAdmin, ordinary, tenantId: seedTenant.data.id, check,
  });

  const listedBefore = await superAdmin.client.rpc('platform_hris_list_tenants');
  check(!listedBefore.error && listedBefore.data.length === 1 && listedBefore.data[0].slug === 'synesis-it',
    'Super-admin tenant list returns only server-authorized tenant metadata');
  const provisioned = await superAdmin.client.rpc('platform_hris_provision_tenant', {
    p_code: ' p2a_one ', p_slug: 'P2A-One', p_name: ' P2A Synthetic One ',
    p_timezone: 'Asia/Dhaka', p_default_locale: 'en', p_admin_user_id: firstAdmin.id,
  });
  check(!provisioned.error && typeof provisioned.data === 'string', 'Super-admin provisions a tenant from normalized configuration');
  const tenantId = provisioned.data;
  const readAfterProvision = await admin.from('tenants').select('id,code,slug,name,is_active,timezone,default_locale').eq('id', tenantId).single();
  check(!readAfterProvision.error && readAfterProvision.data.code === 'P2A_ONE'
    && readAfterProvision.data.slug === 'p2a-one' && readAfterProvision.data.name === 'P2A Synthetic One'
    && readAfterProvision.data.is_active === false && readAfterProvision.data.default_locale === 'en',
  'Tenant and inactive-pending-certification state persist');
  const membership = await admin.from('tenant_memberships').select('role,status').eq('tenant_id', tenantId).eq('user_id', firstAdmin.id).single();
  check(!membership.error && membership.data.role === 'hr_admin' && membership.data.status === 'active',
    'Existing confirmed account receives the initial tenant-admin membership');
  const provisionAudit = await admin.from('admin_audit_logs').select('actor_id,action,target_id').eq('target_id', tenantId).eq('action', 'PLATFORM_TENANT_PROVISIONED').single();
  check(!provisionAudit.error && provisionAudit.data.actor_id === superAdmin.id, 'Provisioning audit records the actual super-admin actor');

  const provisionedByEmail = await superAdmin.client.rpc('platform_hris_provision_tenant_by_email', {
    p_code: ' p2b_one ', p_slug: 'P2B-One', p_name: ' P2B Email Tenant ',
    p_timezone: 'Asia/Dhaka', p_default_locale: 'bn', p_admin_email: secondAdmin.email.toUpperCase(),
  });
  check(!provisionedByEmail.error && typeof provisionedByEmail.data === 'string',
    'Super Admin provisions a tenant by case-normalized confirmed email');
  const emailTenantId = provisionedByEmail.data;
  const emailTenant = await admin.from('tenants').select('code,slug,name,is_active,default_locale')
    .eq('id', emailTenantId).single();
  check(!emailTenant.error && emailTenant.data.code === 'P2B_ONE' && emailTenant.data.slug === 'p2b-one'
    && emailTenant.data.name === 'P2B Email Tenant' && emailTenant.data.is_active === false
    && emailTenant.data.default_locale === 'bn', 'Email-created tenant persists normalized fields and remains inactive');
  const emailMembership = await admin.from('tenant_memberships').select('role,status')
    .eq('tenant_id', emailTenantId).eq('user_id', secondAdmin.id).single();
  check(!emailMembership.error && emailMembership.data.role === 'hr_admin' && emailMembership.data.status === 'active',
    'Confirmed email resolves to the expected initial hr_admin membership');
  const emailProvisionAudit = await admin.from('admin_audit_logs').select('actor_id,action')
    .eq('target_id', emailTenantId).eq('action', 'PLATFORM_TENANT_PROVISIONED').single();
  check(!emailProvisionAudit.error && emailProvisionAudit.data.actor_id === superAdmin.id,
    'Email-based provisioning preserves authenticated actor audit history');
  const malformedEmailProvision = await superAdmin.client.rpc('platform_hris_provision_tenant_by_email', {
    p_code: 'P2B_BAD', p_slug: 'p2b-malformed-email', p_name: 'Malformed Email',
    p_timezone: 'Asia/Dhaka', p_default_locale: 'en', p_admin_email: 'not-an-email',
  });
  requireError(malformedEmailProvision, '22023', 'Malformed administrator email is rejected by the backend');
  const unconfirmedEmailProvision = await superAdmin.client.rpc('platform_hris_provision_tenant_by_email', {
    p_code: 'P2B_UNCONFIRMED', p_slug: 'p2b-unconfirmed-email', p_name: 'Unconfirmed Email',
    p_timezone: 'Asia/Dhaka', p_default_locale: 'en', p_admin_email: unconfirmed.email,
  });
  requireError(unconfirmedEmailProvision, '22023', 'Unconfirmed Auth email cannot provision a tenant');
  const missingEmailProvision = await superAdmin.client.rpc('platform_hris_provision_tenant_by_email', {
    p_code: 'P2B_MISSING', p_slug: 'p2b-missing-email', p_name: 'Missing Email',
    p_timezone: 'Asia/Dhaka', p_default_locale: 'en', p_admin_email: `missing-${stamp}@hris.test`,
  });
  requireError(missingEmailProvision, '22023', 'Unknown Auth email cannot provision a tenant');
  const rejectedEmailRows = await admin.from('tenants').select('id').in('code', ['P2B_BAD', 'P2B_UNCONFIRMED', 'P2B_MISSING']);
  check(!rejectedEmailRows.error && rejectedEmailRows.data.length === 0,
    'Rejected email-based provisioning leaves no partial tenant records');

  const duplicateCode = await superAdmin.client.rpc('platform_hris_provision_tenant', {
    p_code: 'P2A_ONE', p_slug: 'p2a-duplicate-code', p_name: 'Duplicate Code',
    p_timezone: 'Asia/Dhaka', p_default_locale: 'en', p_admin_user_id: firstAdmin.id,
  });
  requireError(duplicateCode, '23505', 'Duplicate tenant code is rejected');
  const duplicateSlug = await superAdmin.client.rpc('platform_hris_provision_tenant', {
    p_code: 'P2A_TWO', p_slug: 'p2a-one', p_name: 'Duplicate Slug',
    p_timezone: 'Asia/Dhaka', p_default_locale: 'en', p_admin_user_id: firstAdmin.id,
  });
  requireError(duplicateSlug, '23505', 'Duplicate tenant slug is rejected');
  const invalidTimezone = await superAdmin.client.rpc('platform_hris_provision_tenant', {
    p_code: 'P2A_TIME', p_slug: 'p2a-invalid-timezone', p_name: 'Invalid Timezone',
    p_timezone: 'Mars/Martian', p_default_locale: 'en', p_admin_user_id: firstAdmin.id,
  });
  requireError(invalidTimezone, '22023', 'Invalid timezone is rejected');
  const invalidLocale = await superAdmin.client.rpc('platform_hris_provision_tenant', {
    p_code: 'P2A_LOCALE', p_slug: 'p2a-invalid-locale', p_name: 'Invalid Locale',
    p_timezone: 'Asia/Dhaka', p_default_locale: 'fr', p_admin_user_id: firstAdmin.id,
  });
  requireError(invalidLocale, '22023', 'Unsupported default locale is rejected');
  const unconfirmedAdmin = await superAdmin.client.rpc('platform_hris_provision_tenant', {
    p_code: 'P2A_CONFIRM', p_slug: 'p2a-unconfirmed-admin', p_name: 'Unconfirmed Admin',
    p_timezone: 'Asia/Dhaka', p_default_locale: 'en', p_admin_user_id: unconfirmed.id,
  });
  requireError(unconfirmedAdmin, '22023', 'Unconfirmed Auth account cannot become the initial administrator');
  const invalidRows = await admin.from('tenants').select('id').in('slug', [
    'p2a-duplicate-code', 'p2a-one', 'p2a-invalid-timezone', 'p2a-invalid-locale', 'p2a-unconfirmed-admin',
  ]);
  check(!invalidRows.error && invalidRows.data.length === 1 && invalidRows.data[0].id === tenantId,
    'Rejected provisioning attempts leave no partial tenant records');

  const updated = await superAdmin.client.rpc('platform_hris_update_tenant_metadata', {
    p_tenant_id: tenantId, p_name: 'P2A Updated Tenant', p_timezone: 'Asia/Tokyo', p_default_locale: 'bn',
  });
  check(!updated.error, 'Super-admin metadata update succeeds');
  const metadataReadback = await admin.from('tenants').select('name,timezone,default_locale,is_active').eq('id', tenantId).single();
  check(!metadataReadback.error && metadataReadback.data.name === 'P2A Updated Tenant'
    && metadataReadback.data.timezone === 'Asia/Tokyo' && metadataReadback.data.default_locale === 'bn'
    && metadataReadback.data.is_active === false, 'Metadata persists without activating the tenant');

  const setRecruiter = await admin.from('tenant_memberships').insert({
    tenant_id: tenantId, user_id: recruiter.id, role: 'hr_recruiter', status: 'active',
  });
  check(!setRecruiter.error, 'Recruiter fixture is prepared through service-role-only test setup');
  const convertRecruiter = await superAdmin.client.rpc('platform_hris_set_tenant_admin', {
    p_tenant_id: tenantId, p_user_id: recruiter.id, p_enabled: true,
  });
  requireError(convertRecruiter, '23514', 'Administrator assignment cannot overwrite a recruiter membership');
  const convertRecruiterByEmail = await superAdmin.client.rpc('platform_hris_set_tenant_admin_by_email', {
    p_tenant_id: tenantId, p_admin_email: recruiter.email, p_enabled: true,
  });
  requireError(convertRecruiterByEmail, '23514', 'Email-based administrator assignment cannot overwrite a recruiter membership');
  const recruiterReadback = await admin.from('tenant_memberships').select('role,status').eq('tenant_id', tenantId).eq('user_id', recruiter.id).single();
  check(!recruiterReadback.error && recruiterReadback.data.role === 'hr_recruiter' && recruiterReadback.data.status === 'active',
    'Denied admin assignment preserves the existing recruiter role');

  const ordinaryAdminAssign = await ordinary.client.rpc('platform_hris_set_tenant_admin', {
    p_tenant_id: tenantId, p_user_id: firstAdmin.id, p_enabled: true,
  });
  requireError(ordinaryAdminAssign, '42501', 'Ordinary authenticated user cannot assign tenant administrators');
  const ordinaryAdminAssignByEmail = await ordinary.client.rpc('platform_hris_set_tenant_admin_by_email', {
    p_tenant_id: tenantId, p_admin_email: secondAdmin.email, p_enabled: true,
  });
  requireError(ordinaryAdminAssignByEmail, '42501', 'Ordinary authenticated user cannot assign tenant administrators by email');
  const addConfirmedAdmin = await superAdmin.client.rpc('platform_hris_set_tenant_admin', {
    p_tenant_id: tenantId, p_user_id: unconfirmed.id, p_enabled: true,
  });
  requireError(addConfirmedAdmin, '22023', 'Unconfirmed Auth account cannot become a tenant administrator');
  const secondAdminEnabled = await superAdmin.client.rpc('platform_hris_set_tenant_admin', {
    p_tenant_id: tenantId, p_user_id: secondAdmin.id, p_enabled: true,
  });
  check(!secondAdminEnabled.error, 'Super-admin can add a second confirmed tenant administrator');
  const secondAdminDisabled = await superAdmin.client.rpc('platform_hris_set_tenant_admin', {
    p_tenant_id: tenantId, p_user_id: secondAdmin.id, p_enabled: false,
  });
  check(!secondAdminDisabled.error, 'Super-admin can revoke an additional tenant administrator');
  const secondAdminEnabledByEmail = await superAdmin.client.rpc('platform_hris_set_tenant_admin_by_email', {
    p_tenant_id: tenantId, p_admin_email: secondAdmin.email.toUpperCase(), p_enabled: true,
  });
  check(!secondAdminEnabledByEmail.error, 'Super-admin can assign a confirmed administrator by normalized email');
  const emailAssignmentReadback = await admin.from('tenant_memberships').select('role,status')
    .eq('tenant_id', tenantId).eq('user_id', secondAdmin.id).single();
  check(!emailAssignmentReadback.error && emailAssignmentReadback.data.role === 'hr_admin'
    && emailAssignmentReadback.data.status === 'active', 'Email assignment persists the expected active admin role');
  const secondAdminDisabledByEmail = await superAdmin.client.rpc('platform_hris_set_tenant_admin_by_email', {
    p_tenant_id: tenantId, p_admin_email: secondAdmin.email, p_enabled: false,
  });
  check(!secondAdminDisabledByEmail.error, 'Super-admin can revoke an additional administrator by email');
  const emailRevocationReadback = await admin.from('tenant_memberships').select('role,status')
    .eq('tenant_id', tenantId).eq('user_id', secondAdmin.id).single();
  check(!emailRevocationReadback.error && emailRevocationReadback.data.role === 'hr_admin'
    && emailRevocationReadback.data.status === 'inactive', 'Email revocation persists without changing the membership role');
  const removeLastAdminByEmail = await superAdmin.client.rpc('platform_hris_set_tenant_admin_by_email', {
    p_tenant_id: tenantId, p_admin_email: firstAdmin.email, p_enabled: false,
  });
  requireError(removeLastAdminByEmail, '23514', 'Email revocation cannot remove the last active tenant administrator');
  const removeLastAdmin = await superAdmin.client.rpc('platform_hris_set_tenant_admin', {
    p_tenant_id: tenantId, p_user_id: firstAdmin.id, p_enabled: false,
  });
  requireError(removeLastAdmin, '23514', 'The last active tenant administrator cannot be revoked');
  const adminAudit = await admin.from('admin_audit_logs').select('action,actor_id').eq('target_id', tenantId)
    .in('action', ['PLATFORM_TENANT_ADMIN_ASSIGNED','PLATFORM_TENANT_ADMIN_REVOKED']);
  check(!adminAudit.error && adminAudit.data.length === 4 && adminAudit.data.every(row => row.actor_id === superAdmin.id),
    'Administrator assignment and revocation are audited with the authenticated actor');

  const staleToken = superAdmin.session.access_token;
  const signedOut = await superAdmin.client.auth.signOut();
  assert.ifError(signedOut.error);
  const staleClient = createClient(services.API_URL, services.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${staleToken}` } },
  });
  const revokedAttempt = await staleClient.rpc('platform_hris_list_tenants');
  requireError(revokedAttempt, '42501', 'Revoked Auth session cannot continue platform tenant administration');

  await runPhase2aBrowserAcceptance({
    root,
    apiUrl: services.API_URL,
    anonKey: services.ANON_KEY,
    password,
    superAdmin: users[0],
    moduleClient: superAdmin.client,
    moduleTenantId: seedTenant.data.id,
    moduleTenantName: seedTenant.data.name,
    ordinary: users[1],
    firstAdmin: users[2],
    secondAdmin,
    admin,
    check: label => check(true, `Browser: ${label}`),
  });

  process.stdout.write(`PHASE2A_2B_LOCAL_AUTH_RLS PASS=${checks} FAIL=0\n`);
} catch (error) {
  console.error('PHASE2A_LOCAL_AUTH_RLS ERROR:', error instanceof Error ? error.stack : error);
  throw error;
} finally {
  await cleanup();
}
