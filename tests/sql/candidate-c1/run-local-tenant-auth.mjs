// Candidate C1 security acceptance against a dedicated Supabase CLI stack.
// Refuses the production project, the older local Auth runtime, non-empty Auth,
// or a database that already contains a test fixture.
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const workdir = process.env.HRIS_CANDIDATE_C1_TEST_WORKDIR
  || '/private/tmp/synesis-candidate-c1-auth-20261013-1124';
const dockerContext = process.env.HRIS_DOCKER_CONTEXT || 'colima-hris-scratch';
const expectedApiPort = process.env.HRIS_CANDIDATE_C1_API_PORT || '55721';
const expectedDbPort = process.env.HRIS_CANDIDATE_C1_DB_PORT || '55722';
const env = {
  ...process.env,
  SUPABASE_HOME: process.env.SUPABASE_HOME || '/private/tmp/synesis-supabase-home',
  SUPABASE_TELEMETRY_DISABLED: '1',
  DOCKER_CONTEXT: dockerContext,
};
const tables = [
  'candidate_application_stage_history', 'job_applications', 'interviews',
  'candidate_assessments', 'candidate_document_requests', 'job_offers', 'onboarding_handoffs',
];
const fixtureTables = [
  ...tables, 'candidate_application_drafts', 'candidate_cvs', 'candidate_job_alerts',
  'candidate_notifications', 'candidate_saved_jobs', 'candidate_profiles',
  'candidate_published_jobs', 'jobs',
];
const users = [
  { email: 'candidate-a@c1.test', fullName: 'Candidate A', tenantId: '11111111-1111-4111-8111-111111111111', jobId: '10101010-1010-4010-8010-101010101010', dbJobId: '11111110-1111-4111-8111-111111111110', appId: '30303030-3030-4030-8030-303030303030', withdrawal: false },
  { email: 'candidate-b@c1.test', fullName: 'Candidate B', tenantId: '22222222-2222-4222-8222-222222222222', jobId: '20202020-2020-4020-8020-202020202020', dbJobId: '22222220-2222-4222-8222-222222222220', appId: '40404040-4040-4040-8040-404040404040', withdrawal: true },
  { email: 'candidate-inactive@c1.test', fullName: 'Inactive Candidate', tenantId: '33333333-3333-4333-8333-333333333333', jobId: '30303030-3030-4030-8030-303030303030', dbJobId: '33333330-3333-4333-8333-333333333330', appId: '50505050-5050-4050-8050-505050505050', withdrawal: false, inactive: true },
];
const privateMarkers = [
  'private staff note A', 'private panel notes A', 'private review note A', 'private verification note A',
  'private staff note B', 'private panel notes B', 'private review note B', 'private verification note B',
];
let checkCount = 0;

function run(file, args, input) {
  return execFileSync(file, args, { cwd: root, env, encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] });
}
function cli(args) { return run('supabase', [...args, '--workdir', workdir]); }
function psql(sql) {
  return run('docker', [
    '--context', dockerContext, 'exec', '-i', `supabase_db_${path.basename(workdir)}`,
    'psql', '-X', '-A', '-t', '-q', '--set=ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres',
  ], sql);
}
function parseEnv(raw) {
  const values = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2].startsWith('"') ? JSON.parse(match[2]) : match[2];
  }
  return values;
}
function assert(value, message) {
  if (!value) throw new Error(message);
  checkCount++;
}
function client(url, key) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
function sql(value) { return `'${String(value).replaceAll("'", "''")}'`; }

const configPath = path.join(workdir, 'supabase/config.toml');
const config = readFileSync(configPath, 'utf8');
const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
assert(projectId === path.basename(workdir) && projectId.startsWith('synesis-candidate-c1-auth-'), 'Refusing: workdir is not the dedicated Candidate C1 test project.');

const services = parseEnv(cli(['status', '--output', 'env']));
assert(services.API_URL && services.ANON_KEY && services.SERVICE_ROLE_KEY && services.DB_URL, 'Local Supabase status is incomplete.');
const apiUrl = new URL(services.API_URL);
const databaseUrl = new URL(services.DB_URL);
assert(apiUrl.hostname === '127.0.0.1' && apiUrl.port === expectedApiPort, 'Refusing: API URL is outside the dedicated test port.');
assert(databaseUrl.hostname === '127.0.0.1' && databaseUrl.port === expectedDbPort, 'Refusing: database URL is outside the dedicated test port.');
assert(run('docker', ['--context', dockerContext, 'context', 'show']).trim() === dockerContext, 'Refusing: isolated Docker context is unavailable.');
const runningContainers = run('docker', ['--context', dockerContext, 'ps', '--format', '{{.Names}}']).trim().split(/\r?\n/);
assert(runningContainers.includes(`supabase_db_${path.basename(workdir)}`), 'Refusing: isolated Supabase database container is not running.');

const admin = client(services.API_URL, services.SERVICE_ROLE_KEY);
const existingUsers = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
assert(!existingUsers.error && existingUsers.data.users.length === 0, 'Refusing: dedicated Auth stack must start with zero users.');
assert(psql('SELECT count(*) FROM auth.users;').trim() === '0', 'Refusing: dedicated Auth database must start with zero users.');
const existingFixtureCount = psql(`SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname = ANY(ARRAY[${fixtureTables.map(sql).join(',')}]);`).trim();
assert(existingFixtureCount === '0', 'Refusing: dedicated database already contains Candidate C1 fixture tables. Reset only this disposable test database before retrying.');
const discovery = await fetch(new URL('/auth/v1/.well-known/openid-configuration', services.API_URL));
assert(discovery.ok && (await discovery.json()).issuer === `${apiUrl.origin}/auth/v1`, 'Refusing: Auth issuer does not match the isolated API.');

for (const file of [
  path.join(here, 'tenant-fixture.sql'),
  path.join(root, 'supabase/migrations/20261012_01_hris_candidate_c1_least_privilege.sql'),
  path.join(root, 'supabase/migrations/20261013052128_hris_candidate_c1_revoke_direct_table_access.sql'),
  path.join(root, 'supabase/migrations/20261013113718_hris_candidate_context_active_profile_tenant_scope.sql'),
  path.join(root, 'supabase/migrations/20261013120355_hris_candidate_profile_rpcs_active_tenant_scope.sql'),
]) psql(readFileSync(file, 'utf8'));

const ids = users.map(() => randomUUID());
const staffId = randomUUID();
const historyIds = users.map((_, i) => i === 0 ? '51515151-5151-4151-8151-515151515151' : '53535353-5353-4353-8353-535353535353');
const interviewIds = users.map((_, i) => i === 0 ? '61616161-6161-4161-8161-616161616161' : '62626262-6262-4262-8262-626262626262');
const assessmentIds = users.map((_, i) => i === 0 ? '71717171-7171-4171-8171-717171717171' : '72727272-7272-4272-8272-727272727272');
const documentIds = users.map((_, i) => i === 0 ? '81818181-8181-4181-8181-818181818181' : '82828282-8282-4282-8282-828282828282');
const offerIds = users.map((_, i) => i === 0 ? '91919191-9191-4191-8191-919191919191' : '92929292-9292-4292-8292-929292929292');

const seed = [];
users.forEach((user, i) => {
  const profileStatus = user.inactive ? 'inactive' : 'active';
  const stage = user.withdrawal ? 'withdrawn' : 'interview';
  const statusNote = user.withdrawal ? 'candidate withdrawal note B' : 'private current staff status A';
  seed.push(`INSERT INTO public.candidate_profiles (user_id,tenant_id,email,full_name,profile_status,skills,profile_data) VALUES (${sql(ids[i])}::uuid,${sql(user.tenantId)}::uuid,${sql(user.email)},${sql(user.fullName)},${sql(profileStatus)},ARRAY['sql'],jsonb_build_object('marker',${sql(`profile-${i}`)}));`);
  seed.push(`INSERT INTO public.candidate_published_jobs (id,tenant_id,reference_number,title,department_name,location_name,status,is_published,is_active,published_at) VALUES (${sql(user.jobId)}::uuid,${sql(user.tenantId)}::uuid,${sql(`${i}-1`)},${sql(`Tenant ${i === 0 ? 'A' : i === 1 ? 'B' : 'Inactive'} Role`)},'Engineering','Dhaka','published',true,true,now());`);
  seed.push(`INSERT INTO public.jobs (id,tenant_id,reference_number,title,workplace_type,employment_type) VALUES (${sql(user.dbJobId)}::uuid,${sql(user.tenantId)}::uuid,${sql(`${i}-1`)},${sql(`Tenant ${i === 0 ? 'A' : i === 1 ? 'B' : 'Inactive'} Role` )},'Hybrid','Full-time');`);
  if (user.inactive) return;
  seed.push(`INSERT INTO public.job_applications (id,tenant_id,job_id,candidate_user_id,full_name,email,stage,status_note,application_data) VALUES (${sql(user.appId)}::uuid,${sql(user.tenantId)}::uuid,${sql(user.dbJobId)}::uuid,${sql(ids[i])}::uuid,${sql(user.fullName)},${sql(user.email)},${sql(stage)},${sql(statusNote)},'{}');`);
  const staffNote = `private staff note ${i === 0 ? 'A' : 'B'}`;
  const panelNote = `private panel notes ${i === 0 ? 'A' : 'B'}`;
  const reviewNote = `private review note ${i === 0 ? 'A' : 'B'}`;
  const verificationNote = `private verification note ${i === 0 ? 'A' : 'B'}`;
  seed.push(`INSERT INTO public.candidate_application_stage_history (id,application_id,stage,note,actor_type,actor_user_id,created_at) VALUES (${sql(historyIds[i])}::uuid,${sql(user.appId)}::uuid,'interview',${sql(staffNote)},'recruitment',${sql(staffId)}::uuid,'2026-01-01T00:00:00Z');`);
  if (i === 0) seed.push(`INSERT INTO public.candidate_application_stage_history (id,application_id,stage,note,actor_type,actor_user_id,created_at) VALUES ('52525252-5252-4252-8252-525252525252',${sql(user.appId)}::uuid,'interview','candidate-visible note A','candidate',${sql(ids[i])}::uuid,'2026-01-02T00:00:00Z');`);
  seed.push(`INSERT INTO public.interviews (id,application_id,scheduled_at,interview_type,panel_notes,status,panel_members) VALUES (${sql(interviewIds[i])}::uuid,${sql(user.appId)}::uuid,now(),'Video',${sql(panelNote)},'scheduled',ARRAY['Hiring Manager']);`);
  seed.push(`INSERT INTO public.candidate_assessments (id,application_id,title,assessment_type,instructions,deadline_date,status,review_note,reviewed_by) VALUES (${sql(assessmentIds[i])}::uuid,${sql(user.appId)}::uuid,${sql(`Assessment ${i}`)},'Technical','Complete',current_date,'submitted',${sql(reviewNote)},${sql(staffId)}::uuid);`);
  seed.push(`INSERT INTO public.candidate_document_requests (id,application_id,document_title,description,due_date,status,verification_note,verified_by) VALUES (${sql(documentIds[i])}::uuid,${sql(user.appId)}::uuid,${sql(`Document ${i}`)},'Upload',current_date,'submitted',${sql(verificationNote)},${sql(staffId)}::uuid);`);
  seed.push(`INSERT INTO public.job_offers (id,application_id,offered_title,salary_currency,status,issued_by,pay_period) VALUES (${sql(offerIds[i])}::uuid,${sql(user.appId)}::uuid,${sql(`Role ${i}`)},'BDT','pending',${sql(staffId)}::uuid,'monthly');`);
});
psql(seed.join('\n'));
psql("NOTIFY pgrst, 'reload schema'; SELECT pg_sleep(2);");

const password = randomBytes(24).toString('base64url');
const createdIds = [];
const clients = [];
try {
  for (const user of users) {
    const created = await admin.auth.admin.createUser({ email: user.email, password, email_confirm: true });
    if (created.error) throw created.error;
    createdIds.push(created.data.user.id);
    user.userId = created.data.user.id;
  }
  const matched = Number(psql(`SELECT count(*) FROM auth.users WHERE id IN (${createdIds.map(sql).join(',')}) AND email IN (${users.map(u => sql(u.email)).join(',')});`).trim());
  assert(matched === users.length, 'GoTrue-created Auth users did not map to the isolated database.');
  users.forEach((user, index) => {
    psql(`UPDATE public.candidate_profiles SET user_id=${sql(user.userId)}::uuid WHERE user_id=${sql(ids[index])}::uuid;
      UPDATE public.job_applications SET candidate_user_id=${sql(user.userId)}::uuid,full_name=${sql(user.fullName)},email=${sql(user.email)} WHERE id=${sql(user.appId)}::uuid;
      UPDATE public.candidate_application_stage_history SET actor_user_id=${sql(user.userId)}::uuid WHERE application_id=${sql(user.appId)}::uuid AND actor_type='candidate';`);
  });
  for (const user of users) {
    const signedIn = client(services.API_URL, services.ANON_KEY);
    const result = await signedIn.auth.signInWithPassword({ email: user.email, password });
    if (result.error || !result.data.session) throw result.error || new Error('Local GoTrue did not issue an Auth session.');
    clients.push(signedIn);
  }

  for (const principal of [{ client: client(services.API_URL, services.ANON_KEY), label: 'anon' }, { client: clients[0], label: 'candidate A' }, { client: clients[1], label: 'candidate B' }]) {
    for (const table of tables) {
      const targetId = users[0].appId;
      const requests = [
        principal.client.from(table).select('id'),
        principal.client.from(table).insert({ id: randomUUID() }),
        principal.client.from(table).update({ id: randomUUID() }).eq('id', targetId),
        principal.client.from(table).delete().eq('id', targetId),
      ];
      for (let index = 0; index < requests.length; index++) {
        const response = await requests[index];
        assert(response.error?.code === '42501', `${principal.label} direct operation ${index + 1} on ${table} was not denied with 42501: ${JSON.stringify(response.error)}`);
      }
    }
  }

  const contextA = await clients[0].rpc('candidate_get_recruitment_context', {});
  assert(!contextA.error && contextA.data, `Candidate A context RPC failed: ${JSON.stringify(contextA.error)}`);
  const contextB = await clients[1].rpc('candidate_get_recruitment_context', {});
  assert(!contextB.error && contextB.data, `Candidate B context RPC failed: ${JSON.stringify(contextB.error)}`);

  function verifyContext(ctx, index) {
    const user = users[index];
    const other = users[index === 0 ? 1 : 0];
    const label = index === 0 ? 'A' : 'B';
    const raw = JSON.stringify(ctx);
    assert(ctx.profile?.user_id === user.userId && ctx.profile?.tenant_id === user.tenantId, `Tenant ${label} profile binding mismatch.`);
    assert(ctx.jobs?.length === 1 && ctx.jobs[0].id === user.jobId && ctx.jobs[0].tenant_id === user.tenantId, `Tenant ${label} published jobs were not tenant-scoped.`);
    assert(ctx.applications?.length === 1 && ctx.applications[0].id === user.appId && ctx.applications[0].candidate_user_id === user.userId, `Tenant ${label} application binding mismatch.`);
    assert(!raw.includes(other.email) && !raw.includes(other.userId || ''), `Tenant ${label} context exposed the other candidate.`);
    for (const marker of privateMarkers) assert(!raw.includes(marker), `Tenant ${label} context exposed restricted staff content: ${marker}`);
    const application = ctx.applications[0];
    if (index === 0) {
      assert(!Object.hasOwn(application, 'status_note'), 'Active stage exposed staff status_note.');
      assert(application.stage_history?.length === 2 && !Object.hasOwn(application.stage_history[0], 'note') && !Object.hasOwn(application.stage_history[0], 'actor_user_id'), 'Staff history note/actor was not hidden.');
      assert(application.stage_history[1].note === 'candidate-visible note A', 'Candidate-authored history note was not retained.');
    } else {
      assert(application.status_note === 'candidate withdrawal note B', 'Candidate withdrawal note was not retained.');
      assert(application.stage_history?.length === 1 && !Object.hasOwn(application.stage_history[0], 'note') && !Object.hasOwn(application.stage_history[0], 'actor_user_id'), 'Tenant B staff history note/actor was not hidden.');
    }
    for (const [key, fields] of [
      ['interviews', ['panel_notes','created_by']],
      ['assessments', ['review_note','reviewed_by','created_by']],
      ['document_requests', ['verification_note','verified_by','created_by']],
      ['offers', ['issued_by']],
    ]) {
      assert(ctx[key]?.length === 1, `Tenant ${label} ${key} is missing.`);
      for (const field of fields) assert(!Object.hasOwn(ctx[key][0], field), `Tenant ${label} ${key} exposed ${field}.`);
    }
  }
  verifyContext(contextA.data, 0);
  verifyContext(contextB.data, 1);

  for (const [index, candidate] of [[0, clients[0]], [1, clients[1]]]) {
    const user = users[index];
    const loaded = await candidate.rpc('get_my_candidate_profile', {});
    assert(!loaded.error && loaded.data?.user_id === user.userId && loaded.data?.tenant_id === user.tenantId, `Tenant ${index === 0 ? 'A' : 'B'} profile read did not follow the authenticated active profile: ${JSON.stringify(loaded.error)}`);
  }
  const profileAUpdate = await clients[0].rpc('candidate_update_profile', { p_payload: {
    full_name: 'Candidate A Updated', headline: 'A-only headline', skills: ['sql','react'],
    tenant_id: users[1].tenantId, profile_status: 'inactive', email: 'forged@example.test',
  } });
  assert(!profileAUpdate.error && profileAUpdate.data?.full_name === 'Candidate A Updated', `Tenant A profile update failed: ${JSON.stringify(profileAUpdate.error)}`);
  assert(profileAUpdate.data.tenant_id === users[0].tenantId && profileAUpdate.data.profile_status === 'active' && profileAUpdate.data.email === users[0].email, 'Tenant A update changed a protected identity or tenant field.');
  assert(profileAUpdate.data.headline === 'A-only headline' && profileAUpdate.data.skills.includes('react'), 'Tenant A editable profile fields did not persist.');
  const profileBUpdate = await clients[1].rpc('candidate_update_profile', { p_payload: {
    full_name: 'Candidate B Updated', headline: 'B-only headline', tenant_id: users[0].tenantId,
  } });
  assert(!profileBUpdate.error && profileBUpdate.data?.full_name === 'Candidate B Updated', `Tenant B profile update failed: ${JSON.stringify(profileBUpdate.error)}`);
  assert(profileBUpdate.data.tenant_id === users[1].tenantId && profileBUpdate.data.email === users[1].email, 'Tenant B update changed its protected identity or tenant field.');
  const profileAAfterB = await clients[0].rpc('get_my_candidate_profile', {});
  assert(!profileAAfterB.error && profileAAfterB.data?.full_name === 'Candidate A Updated' && profileAAfterB.data?.headline === 'A-only headline', 'Tenant B profile update changed Tenant A profile data.');

  const inactiveRpc = await clients[2].rpc('candidate_get_recruitment_context', {});
  assert(inactiveRpc.error?.code === '42501', `Inactive candidate reached context RPC: ${JSON.stringify(inactiveRpc.error)}`);
  const inactiveProfile = await clients[2].rpc('get_my_candidate_profile', {});
  assert(!inactiveProfile.error && inactiveProfile.data === null, 'Inactive candidate profile RPC returned a profile.');
  const inactiveUpdate = await clients[2].rpc('candidate_update_profile', { p_payload: { full_name: 'Should Not Save' } });
  assert(inactiveUpdate.error?.code === '42501', `Inactive candidate profile update was not denied: ${JSON.stringify(inactiveUpdate.error)}`);
  const anonRpc = await client(services.API_URL, services.ANON_KEY).rpc('candidate_get_recruitment_context', {});
  assert(Boolean(anonRpc.error), 'Anonymous caller unexpectedly executed candidate context RPC.');
  const serverRows = await admin.from('job_applications').select('id').in('id', [users[0].appId, users[1].appId]);
  assert(!serverRows.error && serverRows.data.length === 2, `Backend role lost required table access: ${JSON.stringify(serverRows.error)}`);
} finally {
  for (const userId of createdIds) {
    const deleted = await admin.auth.admin.deleteUser(userId);
    if (deleted.error) throw deleted.error;
  }
}

const remainingUsers = Number(psql('SELECT count(*) FROM auth.users;').trim());
assert(remainingUsers === 0, `Synthetic users remain in isolated Auth: ${remainingUsers}`);
process.stdout.write(`CANDIDATE_C1_AUTH_RLS_RESULT PASS=${checkCount} FAIL=0 direct_denials=${3 * tables.length * 4} tenant_contexts=2 inactive_denial=1 users_remaining=0\n`);
