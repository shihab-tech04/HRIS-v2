// Synthetic release acceptance that runs only after the disposable Main
// Auth/Postgres suite. It applies the forward ports and tests real local
// GoTrue sessions, candidate-owned Storage, and tenant-scoped HR RPCs.
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const workdir = path.resolve(process.env.HRIS_SUPABASE_TEST_WORKDIR || '/tmp/synesis-local-hris-test');
const allowedWorkdirs = new Set([
  path.resolve('/tmp/synesis-local-hris-test'),
  path.resolve('/private/tmp/synesis-local-hris-test'),
]);
if (!allowedWorkdirs.has(workdir)) {
  throw new Error('Refusing release RPC acceptance outside the dedicated disposable HRIS workdir.');
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

const services = parseEnv(execFileSync('supabase', ['status', '--output', 'env', '--workdir', workdir], {
  cwd: root, encoding: 'utf8',
}));
if (!services.API_URL || !services.ANON_KEY || !services.SERVICE_ROLE_KEY) {
  throw new Error('Disposable Supabase status did not provide local API keys.');
}
const apiUrl = new URL(services.API_URL);
if (apiUrl.protocol !== 'http:' || apiUrl.hostname !== '127.0.0.1'
    || apiUrl.port !== (process.env.HRIS_SUPABASE_API_PORT || '55421')) {
  throw new Error('Refusing release RPC acceptance unless the Supabase API is the configured loopback port.');
}
const dockerContext = process.env.HRIS_DOCKER_CONTEXT || 'default';
const container = execFileSync('docker', [
  '--context', dockerContext, 'ps', '--filter',
  'name=supabase_db_' + path.basename(workdir), '--format', '{{.Names}}',
], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
if (container !== 'supabase_db_' + path.basename(workdir)) {
  throw new Error('Refusing release RPC acceptance without the matching disposable Postgres container.');
}

function psql(sql) {
  return execFileSync('docker', [
    '--context', dockerContext, 'exec', '-i', container, 'psql',
    '-X', '-A', '-t', '-q', '--set=ON_ERROR_STOP=1', '--username', 'postgres', '--dbname', 'postgres',
  ], { input: sql, encoding: 'utf8' }).trim();
}
const postgresVersion = psql('SHOW server_version_num;');
if (!postgresVersion.startsWith('17')) {
  throw new Error('Refusing release RPC acceptance: the disposable database must be PostgreSQL 17.');
}
console.log('PASS isolated acceptance is running on PostgreSQL ' + postgresVersion);
function sqlLiteral(value) {
  return "'" + String(value).replaceAll("'", "''") + "'";
}
function applySql(file) {
  return psql(readFileSync(path.join(root, file), 'utf8'));
}

const authOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(services.API_URL, services.SERVICE_ROLE_KEY, authOptions);
const anon = createClient(services.API_URL, services.ANON_KEY, authOptions);
const existingUsers = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (existingUsers.error) throw existingUsers.error;
if (existingUsers.data.users.length !== 0 || Number(psql('SELECT count(*) FROM auth.users;')) !== 0) {
  throw new Error('Refusing release RPC acceptance: the prior disposable Auth suite did not clean its synthetic users.');
}

const createdUserIds = [];
const uploadedPaths = [];
const invitationIds = [];
const invitationTenantIds = [];
const employeeInvitationIds = [];
const employeeIds = [];
const screeningJobIds = [];
const screeningApplicationIds = [];
const screeningCvIds = [];
let createdBucket = false;
let directEmployeeEmail = null;
const password = randomBytes(24).toString('base64url');
const tenantA = '11111111-1111-4111-8111-111111111111';
const tenantB = '22222222-2222-4222-8222-222222222222';
const tenantADepartment = 'eeeeeeee-0000-4000-8000-000000000001';
const tenantBDepartment = 'eeeeeeee-0000-4000-8000-000000000002';
const tenantADesignation = 'ffffffff-0000-4000-8000-000000000001';
const tenantBDesignation = 'ffffffff-0000-4000-8000-000000000002';
const jobId = 'a4444444-4444-4444-8444-444444444444';
const applicationId = 'c4444444-4444-4444-8444-444444444444';
const results = [];
function record(label, ok, details = '') {
  results.push({ label, ok });
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (details ? ' — ' + details : ''));
}

try {
  psql("ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS profile_data jsonb NOT NULL DEFAULT '{}'::jsonb;\n"
    + "ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();");
  psql("GRANT SELECT ON public.candidate_profiles TO authenticated;\n"
    + "DROP POLICY IF EXISTS candidate_profiles_read_own ON public.candidate_profiles;\n"
    + "CREATE POLICY candidate_profiles_read_own ON public.candidate_profiles FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));\n"
    + "DROP POLICY IF EXISTS candidate_documents_own_insert ON storage.objects;\n"
    + "CREATE POLICY candidate_documents_own_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='candidate-documents' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text AND EXISTS (SELECT 1 FROM public.candidate_profiles c WHERE c.user_id=(SELECT auth.uid()) AND c.profile_status='active'));\n"
    + "DROP POLICY IF EXISTS candidate_documents_own_update ON storage.objects;\n"
    + "CREATE POLICY candidate_documents_own_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id='candidate-documents' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text) WITH CHECK (bucket_id='candidate-documents' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text);\n"
    + "DROP POLICY IF EXISTS candidate_documents_own_delete ON storage.objects;\n"
    + "CREATE POLICY candidate_documents_own_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id='candidate-documents' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text);");

  // run-local.mjs installs the canonical 20261016033936 project-timesheet SQL.
  // Its 20261024190002 replay has the same CREATE FUNCTION signature, so avoid
  // applying that Projects replay twice on this shared disposable database.
  // Any hosted Projects activation remains governed by release controller #91.
  const hasCanonicalProjectTimesheet = psql(
    "SELECT to_regprocedure('public.hris_get_my_project_timesheet_reviews(uuid)') IS NOT NULL AND " +
    "to_regprocedure('public.hris_save_my_timesheet(uuid,uuid,text,date,date,jsonb,integer)') IS NOT NULL"
  );
  if (hasCanonicalProjectTimesheet !== 't') {
    applySql('supabase/migrations/20261024190002_hris_project_timesheet_review_forward_port.sql');
  }
  applySql('supabase/migrations/20261024191001_hris_candidate_application_document_forward_port.sql');
  applySql('supabase/migrations/20261024200001_hris_preboarding_missing_rpcs_forward_port.sql');
  applySql('supabase/migrations/20261024210001_hris_recruitment_pipeline_forward_port.sql');
  applySql('supabase/migrations/20261024230001_hris_candidate_hiring_rpc_forward_port.sql');
  applySql('supabase/migrations/20261024231001_hris_attendance_shift_rpc_forward_port.sql');
  applySql('supabase/migrations/20261024232001_hris_employee_payroll_learning_rpc_forward_port.sql');
  applySql('supabase/staging/phase2a/tenant_provisioning.staging.sql');
  applySql('supabase/staging/phase2b/platform_tenant_admin_email.staging.sql');
  // The hosted replacement already has this minimum scoped role/grant. Seed
  // the same authorization prerequisite in this isolated database only; the
  // disposable stack intentionally does not copy hosted RBAC rows.
  psql("INSERT INTO public.roles(id,name,active) "
    + "VALUES('hr_admin','Tenant HR administrator',true) "
    + "ON CONFLICT (id) DO NOTHING;"
    + "INSERT INTO public.role_permissions(role_id,permission_id) "
    + "SELECT 'hr_admin','organization.manage' WHERE NOT EXISTS ("
    + "SELECT 1 FROM public.role_permissions WHERE role_id='hr_admin' "
    + "AND permission_id='organization.manage');");
  applySql('supabase/migrations/20261024220001_platform_tenant_invitations.sql');
  applySql('supabase/migrations/20261026000100_platform_tenant_security_certification.sql');
  psql("ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS application_deadline date;"
    + "ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS required_documents text[] NOT NULL DEFAULT '{}';"
    + "ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS screening_questions jsonb NOT NULL DEFAULT '[]'::jsonb;"
    + "ALTER TABLE public.job_applications ALTER COLUMN stage SET DEFAULT 'submitted';"
    + "ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS full_name text;"
    + "ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS email text;"
    + "ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS phone text;"
    + "ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS years_experience numeric;"
    + "ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS skills text[] NOT NULL DEFAULT '{}';"
    + "CREATE TABLE IF NOT EXISTS public.candidate_cvs(id uuid PRIMARY KEY,candidate_user_id uuid NOT NULL,document_url text);"
    + "CREATE TABLE IF NOT EXISTS public.candidate_application_drafts(candidate_user_id uuid NOT NULL,job_id uuid NOT NULL,PRIMARY KEY(candidate_user_id,job_id));");
  applySql('supabase/migrations/20261026060231_hris_employee_invitation.sql');
  applySql('supabase/migrations/20261026060240_candidate_screening_answer_validation.sql');
  applySql('supabase/migrations/20261027090000_hris_requisition_pending_status_guard.sql');
  psql("NOTIFY pgrst, 'reload schema';");
  await new Promise(resolve => setTimeout(resolve, 500));

  const hostedRpcSignatures = [
    'public.candidate_add_application_document(text,text,text,text)',
    'public.candidate_get_my_preboarding_handoff(uuid)',
    'public.candidate_save_my_preboarding_step(uuid,text,jsonb)',
    'public.hris_get_candidate_preboarding_queue(uuid)',
    'public.hris_get_recruitment_pipeline(uuid,text,text,integer,integer)',
    'public.hris_activate_candidate_employee(uuid,uuid,text,date,boolean)',
    'public.hris_assign_candidate_assessment(uuid,uuid,text,text,text,date)',
    'public.hris_get_candidate_assessments(uuid)',
    'public.hris_review_candidate_assessment(uuid,uuid,text)',
    'public.hris_schedule_candidate_interview(uuid,uuid,text,text,timestamp without time zone,integer,text,text[],text)',
    'public.hris_complete_candidate_interview(uuid,uuid)',
    'public.hris_get_candidate_interview_responses(uuid)',
    'public.hris_save_candidate_interview_panel_notes(uuid,uuid,text)',
    'public.hris_issue_candidate_offer(uuid,uuid,numeric,text,text,date,date,text)',
    'public.hris_update_candidate_application_stage(uuid,uuid,text)',
    'public.hris_get_tenant_shift_roster_data(uuid,date,date,text)',
    'public.hris_get_tenant_shift_roster_options(uuid)',
    'public.hris_assign_tenant_employee_shift(uuid,uuid,uuid,date)',
    'public.hris_employee_record_attendance_event(uuid,text)',
    'public.hris_get_my_attendance_period(uuid,date)',
    'public.hris_get_my_project_timesheet_reviews(uuid)',
    'public.hris_get_my_timesheet_context(uuid)',
    'public.hris_resolve_project_timesheet(uuid,uuid,uuid,integer,text,text)',
    'public.hris_resubmit_rejected_project_timesheet(uuid,uuid,uuid,integer,jsonb)',
    'public.hris_save_my_timesheet(uuid,uuid,text,date,date,jsonb)',
    'public.hris_save_my_timesheet(uuid,uuid,text,date,date,jsonb,integer)',
    'public.hris_submit_my_timesheet(uuid,uuid)',
    'public.employee_get_my_employment_info_v1(uuid)',
    'public.hris_get_employee_referral_workspace(uuid)',
    'public.hris_submit_employee_referral(uuid,jsonb)',
    'public.hris_mark_employee_referral_in_review(uuid,uuid,text)',
    'public.hris_get_tenant_payroll_register(uuid,uuid,text,text,integer,integer)',
    'public.hris_get_tenant_dashboard_team_report(uuid,date)',
    'public.hris_get_tenant_dashboard_team_details(uuid,uuid,boolean,date)',
    'public.hris_save_learning_session(uuid,uuid,uuid,text,timestamptz,timestamptz,text,text,integer,timestamptz)',
    'public.hris_get_learning_session_roster(uuid,uuid)',
    'public.hris_create_employee_invitation(uuid,uuid,text,text,text,date)',
    'public.hris_reissue_employee_invitation(uuid,uuid,uuid)',
    'public.hris_resume_employee_invitation(uuid,uuid)',
    'public.hris_accept_employee_invitation(uuid)',
    'public.candidate_apply_to_job(uuid,jsonb)',
    'public.admin_save_requisition(uuid,jsonb)',
    'public.admin_resolve_requisition(uuid,text,text)',
  ];
  const signatureSql = hostedRpcSignatures.map(sqlLiteral).join(',');
  const contractSql = "SELECT jsonb_build_object("
    + "'missing_signatures',COALESCE((SELECT jsonb_agg(r.signature ORDER BY r.signature) FROM unnest(ARRAY[" + signatureSql + "]::text[]) AS r(signature) WHERE to_regprocedure(r.signature) IS NULL),'[]'::jsonb),"
    + "'anonymous_execute',COALESCE((SELECT jsonb_agg(r.signature ORDER BY r.signature) FROM unnest(ARRAY[" + signatureSql + "]::text[]) AS r(signature) WHERE to_regprocedure(r.signature) IS NOT NULL AND has_function_privilege('anon',r.signature,'EXECUTE')),'[]'::jsonb),"
    + "'authenticated_missing',COALESCE((SELECT jsonb_agg(r.signature ORDER BY r.signature) FROM unnest(ARRAY[" + signatureSql + "]::text[]) AS r(signature) WHERE to_regprocedure(r.signature) IS NOT NULL AND NOT has_function_privilege('authenticated',r.signature,'EXECUTE')),'[]'::jsonb),"
    + "'private_roster',to_regprocedure('private.hris_get_learning_session_roster(uuid,uuid)') IS NOT NULL AND has_function_privilege('authenticated','private.hris_get_learning_session_roster(uuid,uuid)','EXECUTE') AND NOT has_function_privilege('anon','private.hris_get_learning_session_roster(uuid,uuid)','EXECUTE'),"
    + "'invite_create',to_regprocedure('public.platform_hris_create_tenant_invitation(text,text,text,text,text,text)') IS NOT NULL,"
    + "'invite_accept',to_regprocedure('public.platform_hris_accept_tenant_invitation(uuid)') IS NOT NULL,"
    + "'invite_service_only',NOT has_function_privilege('authenticated','public.platform_hris_mark_tenant_invitation_sent(uuid,uuid)','EXECUTE')"
    + " AND NOT has_function_privilege('anon','public.platform_hris_mark_tenant_invitation_sent(uuid,uuid)','EXECUTE')"
    + " AND has_function_privilege('service_role','public.platform_hris_mark_tenant_invitation_sent(uuid,uuid)','EXECUTE'),"
    + "'invite_private_table',NOT has_table_privilege('authenticated','private.platform_tenant_invitations','SELECT')"
    + " AND NOT has_table_privilege('anon','private.platform_tenant_invitations','SELECT'),"
    + "'employee_invite_service_only',NOT has_function_privilege('authenticated','public.hris_recover_employee_invitation_auth_user_id(uuid)','EXECUTE')"
    + " AND NOT has_function_privilege('anon','public.hris_recover_employee_invitation_auth_user_id(uuid)','EXECUTE')"
    + " AND has_function_privilege('service_role','public.hris_recover_employee_invitation_auth_user_id(uuid)','EXECUTE')"
    + " AND NOT has_function_privilege('authenticated','public.hris_resolve_employee_invitation_auth_user_id(uuid)','EXECUTE')"
    + " AND NOT has_function_privilege('anon','public.hris_resolve_employee_invitation_auth_user_id(uuid)','EXECUTE')"
    + " AND has_function_privilege('service_role','public.hris_resolve_employee_invitation_auth_user_id(uuid)','EXECUTE')"
    + " AND NOT has_function_privilege('authenticated','public.hris_mark_employee_invitation_sent(uuid,uuid)','EXECUTE')"
    + " AND NOT has_function_privilege('authenticated','public.hris_mark_employee_invitation_failed(uuid)','EXECUTE'),"
    + "'employee_resume_acl',has_function_privilege('authenticated','public.hris_resume_employee_invitation(uuid,uuid)','EXECUTE')"
    + " AND NOT has_function_privilege('anon','public.hris_resume_employee_invitation(uuid,uuid)','EXECUTE'),"
    + "'certification_list',to_regprocedure('public.platform_hris_list_tenant_certifications()') IS NOT NULL,"
    + "'certification_write',to_regprocedure('public.platform_hris_certify_and_activate_tenant(uuid,boolean,text)') IS NOT NULL"
    + " AND has_function_privilege('authenticated','public.platform_hris_certify_and_activate_tenant(uuid,boolean,text)','EXECUTE')"
    + " AND NOT has_function_privilege('anon','public.platform_hris_certify_and_activate_tenant(uuid,boolean,text)','EXECUTE'),"
    + "'certification_private',NOT has_table_privilege('authenticated','private.platform_tenant_security_certifications','SELECT')"
    + " AND NOT has_table_privilege('anon','private.platform_tenant_security_certifications','SELECT'),"
    + "'certification_guard',EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname='platform_tenant_activation_requires_certification' AND NOT tgisinternal),"
    + "'employee_invite_private_table',NOT has_table_privilege('authenticated','private.hris_employee_invitations','SELECT')"
    + " AND NOT has_table_privilege('anon','private.hris_employee_invitations','SELECT'),"
    + "'employee_invite_service_only',to_regprocedure('public.hris_recover_employee_invitation_auth_user_id(uuid)') IS NOT NULL"
    + " AND NOT has_function_privilege('authenticated','public.hris_recover_employee_invitation_auth_user_id(uuid)','EXECUTE')"
    + " AND NOT has_function_privilege('anon','public.hris_recover_employee_invitation_auth_user_id(uuid)','EXECUTE')"
    + " AND has_function_privilege('service_role','public.hris_recover_employee_invitation_auth_user_id(uuid)','EXECUTE')"
    + " AND to_regprocedure('public.hris_mark_employee_invitation_sent(uuid,uuid)') IS NOT NULL"
    + " AND to_regprocedure('public.hris_mark_employee_invitation_failed(uuid)') IS NOT NULL"
    + " AND NOT has_function_privilege('authenticated','public.hris_mark_employee_invitation_sent(uuid,uuid)','EXECUTE')"
    + " AND NOT has_function_privilege('anon','public.hris_mark_employee_invitation_sent(uuid,uuid)','EXECUTE')"
    + " AND has_function_privilege('service_role','public.hris_mark_employee_invitation_sent(uuid,uuid)','EXECUTE')"
    + " AND NOT has_function_privilege('authenticated','public.hris_mark_employee_invitation_failed(uuid)','EXECUTE')"
    + " AND NOT has_function_privilege('anon','public.hris_mark_employee_invitation_failed(uuid)','EXECUTE')"
    + " AND has_function_privilege('service_role','public.hris_mark_employee_invitation_failed(uuid)','EXECUTE'),"
    + "'employee_role', (SELECT count(*)=1 FROM public.roles WHERE active IS TRUE AND lower(btrim(name))='employee'),"
    + "'screening_rpc',to_regprocedure('public.candidate_apply_to_job(uuid,jsonb)') IS NOT NULL"
    + " AND has_function_privilege('authenticated','public.candidate_apply_to_job(uuid,jsonb)','EXECUTE')"
    + " AND NOT has_function_privilege('anon','public.candidate_apply_to_job(uuid,jsonb)','EXECUTE'),"
    + "'requisition_rpc_security',COALESCE((SELECT bool_and(p.prosecdef AND p.proconfig @> ARRAY['search_path=pg_catalog, public, auth']::text[]) FROM pg_catalog.pg_proc p WHERE p.oid IN (to_regprocedure('public.admin_save_requisition(uuid,jsonb)'),to_regprocedure('public.admin_resolve_requisition(uuid,text,text)'))),false),"
    + "'requisition_rpc_signature_parity',COALESCE((SELECT p.proargnames=ARRAY['p_id','p_payload']::text[] AND p.pronargs=2 AND p.pronargdefaults=0 AND p.prorettype='uuid'::regtype FROM pg_catalog.pg_proc p WHERE p.oid=to_regprocedure('public.admin_save_requisition(uuid,jsonb)')),false)"
    + " AND COALESCE((SELECT p.proargnames=ARRAY['p_id','p_decision','p_note']::text[] AND p.pronargs=3 AND p.pronargdefaults=1 AND p.prorettype='jsonb'::regtype FROM pg_catalog.pg_proc p WHERE p.oid=to_regprocedure('public.admin_resolve_requisition(uuid,text,text)')),false),"
    + "'requisition_rpc_acl',has_function_privilege('authenticated','public.admin_save_requisition(uuid,jsonb)','EXECUTE')"
    + " AND NOT has_function_privilege('anon','public.admin_save_requisition(uuid,jsonb)','EXECUTE')"
    + " AND has_function_privilege('service_role','public.admin_save_requisition(uuid,jsonb)','EXECUTE')"
    + " AND has_function_privilege('authenticated','public.admin_resolve_requisition(uuid,text,text)','EXECUTE')"
    + " AND NOT has_function_privilege('anon','public.admin_resolve_requisition(uuid,text,text)','EXECUTE')"
    + " AND has_function_privilege('service_role','public.admin_resolve_requisition(uuid,text,text)','EXECUTE'),"
    + "'requisition_table_write_denied',NOT has_table_privilege('authenticated','public.manpower_requisitions','INSERT')"
    + " AND NOT has_table_privilege('authenticated','public.manpower_requisitions','UPDATE')"
    + " AND NOT has_table_privilege('anon','public.manpower_requisitions','INSERT')"
    + " AND NOT has_table_privilege('anon','public.manpower_requisitions','UPDATE'))::text;";
  const contractState = JSON.parse(psql(contractSql));
  const rpcContractsPass = hostedRpcSignatures.length === 43
    && contractState.missing_signatures.length === 0
    && contractState.anonymous_execute.length === 0
    && contractState.authenticated_missing.length === 0
    && contractState.private_roster === true;
  record('All 43 client-executable public RPC signatures have authenticated execution and anonymous access is denied',
    rpcContractsPass, JSON.stringify(contractState));
  if (!rpcContractsPass || Object.entries(contractState).some(([key, value]) => key !== 'missing_signatures'
    && key !== 'anonymous_execute' && key !== 'authenticated_missing' && value !== true)) {
    throw new Error('Forward-port signature or anonymous grant postconditions failed.');
  }

  const bucket = await admin.storage.getBucket('candidate-documents');
  if (bucket.error && String(bucket.error.statusCode) === '404') {
    const created = await admin.storage.createBucket('candidate-documents', {
      public: false, fileSizeLimit: 10485760, allowedMimeTypes: ['application/pdf'],
    });
    if (created.error) throw created.error;
    createdBucket = true;
  } else if (bucket.error) {
    throw bucket.error;
  } else if (bucket.data.public) {
    throw new Error('Refusing release RPC acceptance: candidate-documents must stay private.');
  }

  const suffix = randomUUID();
  const emails = {
    candidateA: 'release-candidate-a-' + suffix + '@hris.test',
    candidateB: 'release-candidate-b-' + suffix + '@hris.test',
    recruiterA: 'release-recruiter-a-' + suffix + '@hris.test',
    recruiterB: 'release-recruiter-b-' + suffix + '@hris.test',
    superAdmin: 'release-super-admin-' + suffix + '@hris.test',
    securityCertifier: 'release-security-certifier-' + suffix + '@hris.test',
    employeeManager: 'release-employee-manager-' + suffix + '@hris.test',
  };
  const users = {};
  for (const key of Object.keys(emails)) {
    const createOptions = { email: emails[key], password, email_confirm: true };
    if (key === 'securityCertifier') {
      createOptions.app_metadata = { hris_tenant_security_certifier: true };
    }
    const created = await admin.auth.admin.createUser(createOptions);
    if (created.error || !created.data.user?.id) throw created.error || new Error('Local Auth did not create a synthetic user.');
    users[key] = created.data.user;
    createdUserIds.push(created.data.user.id);
  }
  const clients = {};
  for (const key of Object.keys(emails)) {
    const client = createClient(services.API_URL, services.ANON_KEY, authOptions);
    const signedIn = await client.auth.signInWithPassword({ email: emails[key], password });
    if (signedIn.error || !signedIn.data.user) throw signedIn.error || new Error('Local Auth did not issue a session.');
    clients[key] = client;
  }

  psql("INSERT INTO public.admin_users(user_id,display_name,active,is_super_admin) VALUES "
    + "(" + sqlLiteral(users.recruiterA.id) + "::uuid,'Synthetic release recruiter A',true,false),"
    + "(" + sqlLiteral(users.recruiterB.id) + "::uuid,'Synthetic release recruiter B',true,false),"
    + "(" + sqlLiteral(users.superAdmin.id) + "::uuid,'Synthetic release platform Super Admin',true,true),"
    + "(" + sqlLiteral(users.securityCertifier.id) + "::uuid,'Synthetic release security certifier',true,true);"
    + "INSERT INTO public.tenant_memberships(tenant_id,user_id,role,status) VALUES "
    + "(" + sqlLiteral(tenantA) + "::uuid," + sqlLiteral(users.recruiterA.id) + "::uuid,'qa_tenant_recruitment_manager_a','active'),"
    + "(" + sqlLiteral(tenantB) + "::uuid," + sqlLiteral(users.recruiterB.id) + "::uuid,'qa_tenant_manager_b','active'),"
    + "(" + sqlLiteral(tenantA) + "::uuid," + sqlLiteral(users.employeeManager.id) + "::uuid,'hr_admin','active');"
    + "INSERT INTO public.user_roles(user_id,role_id) VALUES (" + sqlLiteral(users.recruiterA.id) + "::uuid,'qa_tenant_recruitment_manager_a') ON CONFLICT (user_id) DO UPDATE SET role_id=EXCLUDED.role_id;"
    + "INSERT INTO public.candidate_profiles(user_id,tenant_id,profile_status,profile_data,full_name,email,phone,years_experience,skills) VALUES "
    + "(" + sqlLiteral(users.candidateA.id) + "::uuid," + sqlLiteral(tenantA) + "::uuid,'active','{}'::jsonb,'Synthetic Release Candidate'," + sqlLiteral(emails.candidateA) + ",'555-0101',4,ARRAY['sql']),"
    + "(" + sqlLiteral(users.candidateB.id) + "::uuid," + sqlLiteral(tenantB) + "::uuid,'active','{}'::jsonb,'Synthetic Candidate B'," + sqlLiteral(emails.candidateB) + ",'555-0102',2,ARRAY['design']);"
    + "INSERT INTO public.jobs(id,tenant_id,reference_number,title,status,is_published,is_active) VALUES "
    + "(" + sqlLiteral(jobId) + "::uuid," + sqlLiteral(tenantA) + "::uuid,'QA-RELEASE-1','Synthetic HRIS Release Role','published',true,true);"
    + "INSERT INTO public.job_applications(id,tenant_id,job_id,candidate_user_id,full_name,email,stage,applied_at) VALUES "
    + "(" + sqlLiteral(applicationId) + "::uuid," + sqlLiteral(tenantA) + "::uuid," + sqlLiteral(jobId) + "::uuid,"
    + sqlLiteral(users.candidateA.id) + "::uuid,'Synthetic Release Candidate'," + sqlLiteral(emails.candidateA) + ",'submitted',now());");

  const requisitionCreate = await clients.recruiterA.rpc('admin_save_requisition', {
    p_id: null,
    p_payload: { title: 'Synthetic pending-only requisition', status: 'approved',
      department_id: tenantADepartment, designation_id: tenantADesignation },
  });
  const requisitionCreatedId = requisitionCreate.data;
  const requisitionStatus = requisitionCreatedId
    ? psql("SELECT status FROM public.manpower_requisitions WHERE id=" + sqlLiteral(requisitionCreatedId) + "::uuid;")
    : '';
  const draftPayloadCreate = await clients.recruiterA.rpc('admin_save_requisition', {
    p_id: null,
    p_payload: { title: 'Synthetic draft payload requisition', status: 'draft' },
  });
  const draftPayloadCreatedId = draftPayloadCreate.data;
  const draftPayloadStatus = draftPayloadCreatedId
    ? psql("SELECT status FROM public.manpower_requisitions WHERE id=" + sqlLiteral(draftPayloadCreatedId) + "::uuid;")
    : '';
  const validTenantReferences = requisitionCreatedId
    ? psql("SELECT department_id::text || '|' || designation_id::text FROM public.manpower_requisitions WHERE id="
      + sqlLiteral(requisitionCreatedId) + "::uuid;")
    : '';
  const crossTenantDepartmentCreate = await clients.recruiterA.rpc('admin_save_requisition', {
    p_id: null,
    p_payload: { title: 'Cross-tenant department create attempt', department_id: tenantBDepartment },
  });
  const crossTenantDepartmentCreateCount = psql(
    "SELECT count(*) FROM public.manpower_requisitions WHERE title='Cross-tenant department create attempt';",
  );
  const crossTenantDesignationCreate = await clients.recruiterA.rpc('admin_save_requisition', {
    p_id: null,
    p_payload: { title: 'Cross-tenant designation create attempt', designation_id: tenantBDesignation },
  });
  const crossTenantDesignationCreateCount = psql(
    "SELECT count(*) FROM public.manpower_requisitions WHERE title='Cross-tenant designation create attempt';",
  );
  const crossTenantDepartmentUpdate = await clients.recruiterA.rpc('admin_save_requisition', {
    p_id: requisitionCreatedId,
    p_payload: { title: 'Cross-tenant department update attempt', department_id: tenantBDepartment },
  });
  const crossTenantDesignationUpdate = await clients.recruiterA.rpc('admin_save_requisition', {
    p_id: requisitionCreatedId,
    p_payload: { title: 'Cross-tenant designation update attempt', designation_id: tenantBDesignation },
  });
  const requisitionAfterForeignReferenceAttempts = requisitionCreatedId
    ? psql("SELECT title || '|' || department_id::text || '|' || designation_id::text FROM public.manpower_requisitions WHERE id="
      + sqlLiteral(requisitionCreatedId) + "::uuid;")
    : '';
  const directRequisitionStatusWrite = requisitionCreatedId
    ? await clients.recruiterA.from('manpower_requisitions')
      .update({ status: 'approved' }).eq('id', requisitionCreatedId)
    : { error: new Error('Create did not return a requisition ID.'), data: null };
  const statusAfterDirectWrite = requisitionCreatedId
    ? psql("SELECT status FROM public.manpower_requisitions WHERE id=" + sqlLiteral(requisitionCreatedId) + "::uuid;")
    : '';
  const unauthorizedRequisition = await clients.candidateA.rpc('admin_save_requisition', {
    p_id: null,
    p_payload: { title: 'Unauthorized synthetic requisition', status: 'approved' },
  });
  const unauthorizedRequisitionCount = psql(
    "SELECT count(*) FROM public.manpower_requisitions WHERE title='Unauthorized synthetic requisition';",
  );

  const tenantBRequisitionId = randomUUID();
  psql("INSERT INTO public.manpower_requisitions(id,tenant_id,reference_number,title,status) VALUES ("
    + sqlLiteral(tenantBRequisitionId) + "::uuid," + sqlLiteral(tenantB) + "::uuid,'QA-TENANT-B-REQ','Synthetic tenant B requisition','pending');");
  const crossTenantRequisitionUpdate = await clients.recruiterA.rpc('admin_save_requisition', {
    p_id: tenantBRequisitionId,
    p_payload: { title: 'Cross-tenant update attempt' },
  });
  const tenantBRequisitionAfterUpdate = psql(
    "SELECT title || '|' || status FROM public.manpower_requisitions WHERE id="
    + sqlLiteral(tenantBRequisitionId) + "::uuid;",
  );
  const firstRequisitionDecision = requisitionCreatedId
    ? await clients.recruiterA.rpc('admin_resolve_requisition', {
      p_id: requisitionCreatedId, p_decision: 'approved', p_note: 'Synthetic isolated approval',
    })
    : { error: new Error('Create did not return a requisition ID.'), data: null };
  const duplicateRequisitionDecision = requisitionCreatedId
    ? await clients.recruiterA.rpc('admin_resolve_requisition', {
      p_id: requisitionCreatedId, p_decision: 'approved', p_note: 'Duplicate must fail',
    })
    : { error: new Error('Create did not return a requisition ID.'), data: null };
  const crossTenantRequisitionDecision = await clients.recruiterA.rpc('admin_resolve_requisition', {
    p_id: tenantBRequisitionId, p_decision: 'rejected', p_note: 'Cross-tenant attempt',
  });
  const resolvedRequisitionState = requisitionCreatedId
    ? psql("SELECT status || '|' || (SELECT count(*) FROM public.admin_audit_logs WHERE target_type='requisition' AND target_id="
      + sqlLiteral(requisitionCreatedId) + " AND action='recruitment.requisition.approved') FROM public.manpower_requisitions WHERE id="
      + sqlLiteral(requisitionCreatedId) + "::uuid;")
    : '';
  const tenantBRequisitionAfterResolve = psql(
    "SELECT title || '|' || status FROM public.manpower_requisitions WHERE id="
    + sqlLiteral(tenantBRequisitionId) + "::uuid;",
  );
  record('Requisition creation forces pending, enforces permission and tenant scope, and resolution is single-use',
    !requisitionCreate.error && typeof requisitionCreatedId === 'string' && requisitionStatus === 'pending'
      && validTenantReferences === tenantADepartment + '|' + tenantADesignation
      && !draftPayloadCreate.error && typeof draftPayloadCreatedId === 'string' && draftPayloadStatus === 'pending'
      && crossTenantDepartmentCreate.error?.code === 'P0002' && crossTenantDepartmentCreateCount === '0'
      && crossTenantDesignationCreate.error?.code === 'P0002' && crossTenantDesignationCreateCount === '0'
      && crossTenantDepartmentUpdate.error?.code === 'P0002'
      && crossTenantDesignationUpdate.error?.code === 'P0002'
      && requisitionAfterForeignReferenceAttempts === 'Synthetic pending-only requisition|' + tenantADepartment + '|' + tenantADesignation
      && directRequisitionStatusWrite.error?.code === '42501' && statusAfterDirectWrite === 'pending'
      && unauthorizedRequisition.error?.code === '42501' && unauthorizedRequisitionCount === '0'
      && crossTenantRequisitionUpdate.error?.code === 'P0002'
      && tenantBRequisitionAfterUpdate === 'Synthetic tenant B requisition|pending'
      && !firstRequisitionDecision.error && firstRequisitionDecision.data?.success === true
      && duplicateRequisitionDecision.error?.code === 'P0002'
      && crossTenantRequisitionDecision.error?.code === 'P0002'
      && resolvedRequisitionState === 'approved|1'
      && tenantBRequisitionAfterResolve === 'Synthetic tenant B requisition|pending',
    JSON.stringify({ createdPendingDespiteApprovedPayload: requisitionStatus === 'pending',
      createdPendingDespiteDraftPayload: draftPayloadStatus === 'pending',
      validSameTenantReferencesAccepted: validTenantReferences === tenantADepartment + '|' + tenantADesignation,
      crossTenantDepartmentCreateDenied: crossTenantDepartmentCreate.error?.code === 'P0002' && crossTenantDepartmentCreateCount === '0',
      crossTenantDesignationCreateDenied: crossTenantDesignationCreate.error?.code === 'P0002' && crossTenantDesignationCreateCount === '0',
      crossTenantDepartmentUpdateDenied: crossTenantDepartmentUpdate.error?.code === 'P0002',
      crossTenantDesignationUpdateDenied: crossTenantDesignationUpdate.error?.code === 'P0002',
      crossTenantReferencesDidNotMutateRow: requisitionAfterForeignReferenceAttempts === 'Synthetic pending-only requisition|' + tenantADepartment + '|' + tenantADesignation,
      directStatusWriteDenied: directRequisitionStatusWrite.error?.code === '42501' && statusAfterDirectWrite === 'pending',
      unauthorizedDenied: unauthorizedRequisition.error?.code === '42501',
      crossTenantSaveDenied: crossTenantRequisitionUpdate.error?.code === 'P0002',
      crossTenantRowUnchanged: tenantBRequisitionAfterUpdate === 'Synthetic tenant B requisition|pending',
      firstResolutionSucceeded: !firstRequisitionDecision.error,
      duplicateResolutionDenied: duplicateRequisitionDecision.error?.code === 'P0002',
      crossTenantResolutionDenied: crossTenantRequisitionDecision.error?.code === 'P0002',
      oneApprovalAudit: resolvedRequisitionState === 'approved|1',
      crossTenantAfterResolution: tenantBRequisitionAfterResolve }));

  const employeeEmail = 'release-employee-' + suffix + '@hris.test';
  const employeeNumber = 'E-' + suffix.replaceAll('-', '').slice(0, 12).toUpperCase();
  const employeeRequestId = randomUUID();
  const employeeCreateArgs = {
    p_tenant_id: tenantA,
    p_request_id: employeeRequestId,
    p_employee_number: employeeNumber,
    p_full_name: 'Synthetic Release Employee',
    p_email: employeeEmail,
    p_joining_date: '2026-11-01',
  };
  const unauthorizedEmployeeCreate = await clients.candidateA.rpc('hris_create_employee_invitation', employeeCreateArgs);
  const crossTenantEmployeeCreate = await clients.employeeManager.rpc('hris_create_employee_invitation', {
    ...employeeCreateArgs, p_tenant_id: tenantB, p_request_id: randomUUID(),
  });
  const createdEmployeeInvitation = await clients.employeeManager.rpc('hris_create_employee_invitation', employeeCreateArgs);
  if (createdEmployeeInvitation.error || typeof createdEmployeeInvitation.data?.invitation_id !== 'string'
    || typeof createdEmployeeInvitation.data?.employee_id !== 'string') {
    throw createdEmployeeInvitation.error || new Error('Tenant HR manager could not create a persistent employee invitation.');
  }
  const employeeInvitationId = createdEmployeeInvitation.data.invitation_id;
  const employeeId = createdEmployeeInvitation.data.employee_id;
  employeeInvitationIds.push(employeeInvitationId);
  employeeIds.push(employeeId);
  const concurrentEmployeeCreateReplays = await Promise.all([
    clients.employeeManager.rpc('hris_create_employee_invitation', employeeCreateArgs),
    clients.employeeManager.rpc('hris_create_employee_invitation', employeeCreateArgs),
  ]);
  const duplicateEmployeeCreate = await clients.employeeManager.rpc('hris_create_employee_invitation', {
    ...employeeCreateArgs, p_request_id: randomUUID(), p_email: 'release-employee-duplicate-' + suffix + '@hris.test',
  });
  directEmployeeEmail = 'direct-' + suffix + '@hris.test';
  const directEmployeeInsert = await clients.employeeManager.from('employees').insert({
    tenant_id: tenantA, employee_number: 'DIRECT-' + suffix.slice(0, 8),
    full_name: 'Direct insert must be denied', official_email: directEmployeeEmail,
    joining_date: '2026-11-01',
  });
  const employeeRows = await admin.from('employees').select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantA).eq('official_email', employeeEmail);
  record('Tenant HR manager persists one employee and blocks immediate pending delivery replay',
    !createdEmployeeInvitation.error && createdEmployeeInvitation.data?.invitation_id === employeeInvitationId
      && createdEmployeeInvitation.data?.employee_id === employeeId
      && createdEmployeeInvitation.data?.delivery_attempts === 1
      && concurrentEmployeeCreateReplays.every(result => Boolean(result.error))
      && employeeRows.count === 1 && Boolean(duplicateEmployeeCreate.error)
      && unauthorizedEmployeeCreate.error?.code === '42501'
      && crossTenantEmployeeCreate.error?.code === '42501'
      && Boolean(directEmployeeInsert.error),
    JSON.stringify({ persistedRows: employeeRows.count,
      immediatePendingReplayDenied: concurrentEmployeeCreateReplays.every(result => Boolean(result.error)),
      duplicateDenied: Boolean(duplicateEmployeeCreate.error),
      unauthorizedDenied: unauthorizedEmployeeCreate.error?.code === '42501',
      crossTenantDenied: crossTenantEmployeeCreate.error?.code === '42501',
      directInsertDenied: Boolean(directEmployeeInsert.error) }));

  const employeeAuthInvitation = await admin.auth.admin.inviteUserByEmail(employeeEmail);
  if (employeeAuthInvitation.error || !employeeAuthInvitation.data.user?.id) {
    throw employeeAuthInvitation.error || new Error('Local Auth did not create the synthetic employee invitee.');
  }
  const employeeInvitee = employeeAuthInvitation.data.user;
  createdUserIds.push(employeeInvitee.id);
  const taggedInitialInvite = await admin.auth.admin.updateUserById(employeeInvitee.id, {
    app_metadata: {
      ...(employeeInvitee.app_metadata || {}),
      hris_employee_invitation_request_id: employeeRequestId,
    },
  });
  if (taggedInitialInvite.error) throw taggedInitialInvite.error;
  // Simulate Auth invite success followed by an unsuccessful delivery-mark write.
  // The pending invitation must recover only this exact request identity.
  const interruptedMarkSent = await admin.rpc('hris_mark_employee_invitation_sent', {
    p_invitation_id: employeeInvitationId, p_auth_user_id: randomUUID(),
  });
  const pendingCreateRetryAfterMarkFailure = await clients.employeeManager.rpc(
    'hris_create_employee_invitation', employeeCreateArgs,
  );
  psql("UPDATE private.hris_employee_invitations SET updated_at=now()-interval '16 minutes' "
    + "WHERE id=" + sqlLiteral(employeeInvitationId) + "::uuid;");
  const reloadedEmployeeManager = createClient(services.API_URL, services.ANON_KEY, authOptions);
  const reloadedManagerSession = await reloadedEmployeeManager.auth.signInWithPassword({
    email: emails.employeeManager, password,
  });
  if (reloadedManagerSession.error) throw reloadedManagerSession.error;
  const resumedPendingInvitation = await reloadedEmployeeManager.rpc('hris_resume_employee_invitation', {
    p_tenant_id: tenantA, p_invitation_id: employeeInvitationId,
  });
  const crossTenantResume = await reloadedEmployeeManager.rpc('hris_resume_employee_invitation', {
    p_tenant_id: tenantB, p_invitation_id: employeeInvitationId,
  });
  const unauthorizedResume = await clients.candidateA.rpc('hris_resume_employee_invitation', {
    p_tenant_id: tenantA, p_invitation_id: employeeInvitationId,
  });
  const cooledCreateReplay = await clients.employeeManager.rpc(
    'hris_create_employee_invitation', employeeCreateArgs,
  );
  psql("UPDATE private.hris_employee_invitations SET updated_at=now()-interval '16 minutes' "
    + "WHERE id=" + sqlLiteral(employeeInvitationId) + "::uuid;");
  const secondResumedInvitation = await reloadedEmployeeManager.rpc('hris_resume_employee_invitation', {
    p_tenant_id: tenantA, p_invitation_id: employeeInvitationId,
  });
  psql("UPDATE private.hris_employee_invitations SET updated_at=now()-interval '16 minutes' "
    + "WHERE id=" + sqlLiteral(employeeInvitationId) + "::uuid;");
  const cappedResume = await reloadedEmployeeManager.rpc('hris_resume_employee_invitation', {
    p_tenant_id: tenantA, p_invitation_id: employeeInvitationId,
  });
  const recoveredEmployeeAuthUser = await admin.rpc(
    'hris_recover_employee_invitation_auth_user_id',
    { p_invitation_id: employeeInvitationId },
  );
  const employeeSent = await admin.rpc('hris_mark_employee_invitation_sent', {
    p_invitation_id: employeeInvitationId, p_auth_user_id: recoveredEmployeeAuthUser.data,
  });
  const employeeSentReplay = await admin.rpc('hris_mark_employee_invitation_sent', {
    p_invitation_id: employeeInvitationId, p_auth_user_id: recoveredEmployeeAuthUser.data,
  });
  const employeeCreateSentReplay = await clients.employeeManager.rpc(
    'hris_create_employee_invitation', employeeCreateArgs,
  );
  const authenticatedMarkSent = await clients.employeeManager.rpc('hris_mark_employee_invitation_sent', {
    p_invitation_id: employeeInvitationId, p_auth_user_id: employeeInvitee.id,
  });
  const wrongEmployeeAcceptance = await clients.candidateA.rpc('hris_accept_employee_invitation', {
    p_invitation_id: employeeInvitationId,
  });

  // Expire the sent request in the disposable database and prove that a new
  // request gets a fresh invitation ID while the previous ID stays unusable.
  psql("UPDATE private.hris_employee_invitations SET expires_at=now()-interval '1 second' "
    + "WHERE id=" + sqlLiteral(employeeInvitationId) + "::uuid;");
  const employeeReissueRequestId = randomUUID();
  const reissuedEmployeeInvitation = await clients.employeeManager.rpc('hris_reissue_employee_invitation', {
    p_tenant_id: tenantA, p_employee_id: employeeId, p_request_id: employeeReissueRequestId,
  });
  if (reissuedEmployeeInvitation.error || reissuedEmployeeInvitation.data?.status !== 'pending'
    || reissuedEmployeeInvitation.data?.delivery_attempts !== 1
    || reissuedEmployeeInvitation.data?.invitation_id === employeeInvitationId) {
    throw reissuedEmployeeInvitation.error || new Error('An expired employee invitation did not create a fresh pending request.');
  }
  const employeeReissueId = reissuedEmployeeInvitation.data.invitation_id;
  employeeInvitationIds.push(employeeReissueId);
  const concurrentPendingReissueReplays = await Promise.all([
    clients.employeeManager.rpc('hris_reissue_employee_invitation', {
      p_tenant_id: tenantA, p_employee_id: employeeId, p_request_id: employeeReissueRequestId,
    }),
    clients.employeeManager.rpc('hris_reissue_employee_invitation', {
      p_tenant_id: tenantA, p_employee_id: employeeId, p_request_id: employeeReissueRequestId,
    }),
  ]);
  const activeReissueDenied = await clients.employeeManager.rpc('hris_reissue_employee_invitation', {
    p_tenant_id: tenantA, p_employee_id: employeeId, p_request_id: randomUUID(),
  });
  const reissueDeliveryFailure = await admin.rpc('hris_mark_employee_invitation_failed', {
    p_invitation_id: employeeReissueId,
  });
  const immediateReissueRetry = await clients.employeeManager.rpc('hris_reissue_employee_invitation', {
    p_tenant_id: tenantA, p_employee_id: employeeId, p_request_id: employeeReissueRequestId,
  });
  psql("UPDATE private.hris_employee_invitations SET updated_at=now()-interval '16 minutes' "
    + "WHERE id=" + sqlLiteral(employeeReissueId) + "::uuid;");
  const reissueReplay = await clients.employeeManager.rpc('hris_reissue_employee_invitation', {
    p_tenant_id: tenantA, p_employee_id: employeeId, p_request_id: employeeReissueRequestId,
  });
  const immediateReissueReplay = await clients.employeeManager.rpc('hris_reissue_employee_invitation', {
    p_tenant_id: tenantA, p_employee_id: employeeId, p_request_id: employeeReissueRequestId,
  });
  psql("UPDATE private.hris_employee_invitations SET delivery_attempts=3, updated_at=now()-interval '16 minutes' "
    + "WHERE id=" + sqlLiteral(employeeReissueId) + "::uuid;");
  const cappedReissueRetry = await clients.employeeManager.rpc('hris_reissue_employee_invitation', {
    p_tenant_id: tenantA, p_employee_id: employeeId, p_request_id: employeeReissueRequestId,
  });
  psql("UPDATE private.hris_employee_invitations SET delivery_attempts=2, updated_at=now()-interval '16 minutes' "
    + "WHERE id=" + sqlLiteral(employeeReissueId) + "::uuid;");
  const staleInvitationRecovery = await admin.rpc(
    'hris_recover_employee_invitation_auth_user_id',
    { p_invitation_id: employeeInvitationId },
  );
  const clientCannotResolveAuthUser = await clients.employeeManager.rpc(
    'hris_resolve_employee_invitation_auth_user_id',
    { p_invitation_id: employeeReissueId },
  );
  const recoveryBeforeCurrentRequestTag = await admin.rpc(
    'hris_recover_employee_invitation_auth_user_id',
    { p_invitation_id: employeeReissueId },
  );
  const secondAuthInvitation = await admin.auth.admin.inviteUserByEmail(employeeEmail);
  const secondInviteUser = secondAuthInvitation.data?.user;
  const taggedReissuedInvite = secondInviteUser?.id
    ? await admin.auth.admin.updateUserById(secondInviteUser.id, {
      app_metadata: {
        ...(secondInviteUser.app_metadata || {}),
        hris_employee_invitation_request_id: employeeReissueRequestId,
      },
    })
    : null;
  const recoveredReissuedAuthUser = await admin.rpc(
    'hris_recover_employee_invitation_auth_user_id',
    { p_invitation_id: employeeReissueId },
  );
  const resolvedReissuedAuthUser = await admin.rpc(
    'hris_resolve_employee_invitation_auth_user_id',
    { p_invitation_id: employeeReissueId },
  );
  const employeeReissueSent = await admin.rpc('hris_mark_employee_invitation_sent', {
    p_invitation_id: employeeReissueId, p_auth_user_id: recoveredReissuedAuthUser.data,
  });
  const sentReissueReplay = await clients.employeeManager.rpc('hris_reissue_employee_invitation', {
    p_tenant_id: tenantA, p_employee_id: employeeId, p_request_id: employeeReissueRequestId,
  });
  const clientCannotMarkReissueSent = await clients.employeeManager.rpc('hris_mark_employee_invitation_sent', {
    p_invitation_id: employeeReissueId, p_auth_user_id: employeeInvitee.id,
  });

  const employeePassword = await admin.auth.admin.updateUserById(employeeInvitee.id, {
    email_confirm: true, password,
  });
  if (employeePassword.error) throw employeePassword.error;
  const employeeInviteeClient = createClient(services.API_URL, services.ANON_KEY, authOptions);
  const employeeInviteeSession = await employeeInviteeClient.auth.signInWithPassword({ email: employeeEmail, password });
  if (employeeInviteeSession.error || !employeeInviteeSession.data.user) {
    throw employeeInviteeSession.error || new Error('Synthetic employee invitee did not receive a local Auth session.');
  }
  const staleEmployeeAcceptance = await employeeInviteeClient.rpc('hris_accept_employee_invitation', {
    p_invitation_id: employeeInvitationId,
  });
  const acceptedEmployee = await employeeInviteeClient.rpc('hris_accept_employee_invitation', {
    p_invitation_id: employeeReissueId,
  });
  const replayedEmployeeAcceptance = await employeeInviteeClient.rpc('hris_accept_employee_invitation', {
    p_invitation_id: employeeReissueId,
  });
  const employeeLink = await admin.from('employees').select('id,user_id').eq('id', employeeId).single();
  const employeeMembership = await admin.from('tenant_memberships').select('role,status')
    .eq('tenant_id', tenantA).eq('user_id', employeeInvitee.id).single();
  const employeeRoleName = await admin.from('roles').select('name').eq('id', employeeMembership.data?.role || '').single();
  record('Employee invitation delivery recovery, pending retry limits, acceptance, and replay remain tenant-scoped',
    Boolean(interruptedMarkSent.error) && Boolean(pendingCreateRetryAfterMarkFailure.error)
      && resumedPendingInvitation.data?.invitation_id === employeeInvitationId
      && resumedPendingInvitation.data?.request_id === employeeRequestId
      && resumedPendingInvitation.data?.delivery_attempts === 2
      && secondResumedInvitation.data?.request_id === employeeRequestId
      && secondResumedInvitation.data?.delivery_attempts === 3
      && Boolean(cappedResume.error) && Boolean(cooledCreateReplay.error)
      && crossTenantResume.error?.code === '42501' && unauthorizedResume.error?.code === '42501'
      && recoveredEmployeeAuthUser.data === employeeInvitee.id
      && employeeSent.data === true && employeeSentReplay.data === true
      && employeeCreateSentReplay.data?.idempotent === true
      && Boolean(authenticatedMarkSent.error)
      && wrongEmployeeAcceptance.error?.code === '42501'
      && !reissuedEmployeeInvitation.error
      && concurrentPendingReissueReplays.every(result => Boolean(result.error))
      && reissueDeliveryFailure.data === true && Boolean(immediateReissueRetry.error)
      && reissueReplay.data?.invitation_id === employeeReissueId
      && reissueReplay.data?.idempotent === true && reissueReplay.data?.delivery_attempts === 2
      && Boolean(immediateReissueReplay.error) && Boolean(cappedReissueRetry.error)
      && Boolean(activeReissueDenied.error)
      && staleInvitationRecovery.data === null
      && Boolean(clientCannotResolveAuthUser.error)
      && recoveryBeforeCurrentRequestTag.data === null
      && resolvedReissuedAuthUser.data === employeeInvitee.id
      && !secondAuthInvitation.error && secondInviteUser?.id === employeeInvitee.id
      && !taggedReissuedInvite?.error
      && recoveredReissuedAuthUser.data === employeeInvitee.id
      && employeeReissueSent.data === true
      && sentReissueReplay.data?.idempotent === true
      && Boolean(clientCannotMarkReissueSent.error)
      && staleEmployeeAcceptance.error?.code === '22023'
      && acceptedEmployee.data?.accepted === true && acceptedEmployee.data?.tenant_id === tenantA
      && replayedEmployeeAcceptance.data?.idempotent === true
      && employeeLink.data?.user_id === employeeInvitee.id
      && employeeMembership.data?.status === 'active'
      && employeeRoleName.data?.name === 'Employee',
    JSON.stringify({
      authSendMarkFailureLeavesReplayCooldown: Boolean(interruptedMarkSent.error)
        && Boolean(pendingCreateRetryAfterMarkFailure.error),
      reloadResumeReusesExactInvitationRequest: resumedPendingInvitation.data?.request_id === employeeRequestId
        && resumedPendingInvitation.data?.invitation_id === employeeInvitationId,
      resumeAttemptBudget: [resumedPendingInvitation.data?.delivery_attempts,
        secondResumedInvitation.data?.delivery_attempts, Boolean(cappedResume.error)],
      resumeTenantAndRoleDenials: crossTenantResume.error?.code === '42501'
        && unauthorizedResume.error?.code === '42501',
      createReplayBlockedAfterResume: Boolean(cooledCreateReplay.error),
      initialMarkRecovery: recoveredEmployeeAuthUser.data === employeeInvitee.id,
      initialMarkReplay: employeeSent.data === true && employeeSentReplay.data === true,
      sentRequestReplayIsIdempotent: employeeCreateSentReplay.data?.idempotent === true,
      initialInviteReissued: !secondAuthInvitation.error && secondInviteUser?.id === employeeInvitee.id,
      freshInvitationId: employeeReissueId !== employeeInvitationId,
      requestReplayIsIdempotent: reissueReplay.data?.invitation_id === employeeReissueId && reissueReplay.data?.idempotent === true,
      pendingReissueReplayDenied: concurrentPendingReissueReplays.every(result => Boolean(result.error)),
      reissueDeliveryFailureRecorded: reissueDeliveryFailure.data === true,
      immediateReissueRetryDenied: Boolean(immediateReissueRetry.error),
      reissueCooledRetryCount: reissueReplay.data?.delivery_attempts,
      reissueCooldownReapplied: Boolean(immediateReissueReplay.error),
      reissueAttemptLimitEnforced: Boolean(cappedReissueRetry.error),
      activeInvitationCannotBeForked: Boolean(activeReissueDenied.error),
      expiredRequestCannotRecover: staleInvitationRecovery.data === null,
      clientCannotResolveAuthIdentity: Boolean(clientCannotResolveAuthUser.error),
      exactRequestMarkerRequired: recoveryBeforeCurrentRequestTag.data === null,
      serviceResolverMatchesInvitedIdentity: resolvedReissuedAuthUser.data === employeeInvitee.id,
      newRequestRecovery: recoveredReissuedAuthUser.data === employeeInvitee.id && employeeReissueSent.data === true,
      clientCannotMarkSent: Boolean(authenticatedMarkSent.error) && Boolean(clientCannotMarkReissueSent.error),
      staleInvitationRejected: staleEmployeeAcceptance.error?.code === '22023',
      accepted: acceptedEmployee.data?.accepted === true,
      replaySafe: replayedEmployeeAcceptance.data?.idempotent === true,
      activeEmployeeRole: employeeMembership.data?.status === 'active' && employeeRoleName.data?.name === 'Employee',
    }));

  const invitationEmail = 'release-invitee-' + suffix + '@hris.test';
  const invitationCreated = await clients.superAdmin.rpc('platform_hris_create_tenant_invitation', {
    p_code: 'QA_INV_' + suffix.replaceAll('-', '').slice(0, 12).toUpperCase(),
    p_slug: 'qa-invite-' + suffix.slice(0, 8),
    p_name: 'Synthetic invitation tenant',
    p_timezone: 'Asia/Dhaka',
    p_default_locale: 'en',
    p_admin_email: invitationEmail,
  });
  if (invitationCreated.error || typeof invitationCreated.data?.invitation_id !== 'string') {
    throw invitationCreated.error || new Error('Super Admin did not create a tenant invitation request.');
  }
  const invitationId = invitationCreated.data.invitation_id;
  invitationIds.push(invitationId);
  const invitationAuth = await admin.auth.admin.inviteUserByEmail(invitationEmail);
  if (invitationAuth.error || !invitationAuth.data.user?.id) {
    throw invitationAuth.error || new Error('Local Auth did not create an invited administrator.');
  }
  const invitee = invitationAuth.data.user;
  createdUserIds.push(invitee.id);
  const markedSent = await admin.rpc('platform_hris_mark_tenant_invitation_sent', {
    p_invitation_id: invitationId,
    p_auth_user_id: invitee.id,
  });
  if (markedSent.error || markedSent.data !== true) {
    throw markedSent.error || new Error('Service-only invitation delivery record was not finalized.');
  }
  const unauthenticatedInvite = await anon.rpc('platform_hris_create_tenant_invitation', {
    p_code: 'QA_ANON_' + suffix.replaceAll('-', '').slice(0, 10).toUpperCase(),
    p_slug: 'qa-anon-' + suffix.slice(0, 8), p_name: 'Denied anonymous invitation',
    p_timezone: 'Asia/Dhaka', p_default_locale: 'en', p_admin_email: invitationEmail,
  });
  const ordinaryAdminInvite = await clients.recruiterA.rpc('platform_hris_create_tenant_invitation', {
    p_code: 'QA_USER_' + suffix.replaceAll('-', '').slice(0, 10).toUpperCase(),
    p_slug: 'qa-user-' + suffix.slice(0, 8), p_name: 'Denied ordinary administrator invitation',
    p_timezone: 'Asia/Dhaka', p_default_locale: 'en', p_admin_email: invitationEmail,
  });
  const wrongAccountAcceptance = await clients.candidateA.rpc('platform_hris_accept_tenant_invitation', {
    p_invitation_id: invitationId,
  });
  const setInviteePassword = await admin.auth.admin.updateUserById(invitee.id, {
    email_confirm: true, password,
  });
  if (setInviteePassword.error) throw setInviteePassword.error;
  const inviteeClient = createClient(services.API_URL, services.ANON_KEY, authOptions);
  const inviteeSession = await inviteeClient.auth.signInWithPassword({ email: invitationEmail, password });
  if (inviteeSession.error || !inviteeSession.data.user) {
    throw inviteeSession.error || new Error('Invited administrator did not receive a local Auth session.');
  }
  const acceptedInvitation = await inviteeClient.rpc('platform_hris_accept_tenant_invitation', {
    p_invitation_id: invitationId,
  });
  if (acceptedInvitation.error || acceptedInvitation.data?.accepted !== true
    || acceptedInvitation.data?.is_active !== false
    || typeof acceptedInvitation.data?.tenant_id !== 'string') {
    throw acceptedInvitation.error || new Error('Invited administrator could not provision an inactive tenant.');
  }
  const invitedTenantId = acceptedInvitation.data.tenant_id;
  invitationTenantIds.push(invitedTenantId);
  const replayedAcceptance = await inviteeClient.rpc('platform_hris_accept_tenant_invitation', {
    p_invitation_id: invitationId,
  });
  const inactiveTenantRead = await inviteeClient.from('tenants').select('id')
    .eq('id', invitedTenantId);
  const invitationAudit = psql("SELECT count(*) FROM public.admin_audit_logs WHERE action='PLATFORM_TENANT_INVITATION_ACCEPTED' AND target_id="
    + sqlLiteral(invitedTenantId) + ";");
  const initialCertificationList = await clients.superAdmin.rpc('platform_hris_list_tenant_certifications');
  const pendingCertification = initialCertificationList.data?.find(row => row.tenant_id === invitedTenantId);
  const unassignedSuperAdminCertification = await clients.superAdmin.rpc('platform_hris_certify_and_activate_tenant', {
    p_tenant_id: invitedTenantId, p_security_signoff_complete: true,
    p_evidence_reference: 'must-not-activate-without-security-assignment',
  });
  const incompleteSignoff = await clients.securityCertifier.rpc('platform_hris_certify_and_activate_tenant', {
    p_tenant_id: invitedTenantId, p_security_signoff_complete: false,
    p_evidence_reference: 'isolated-incomplete-signoff',
  });
  const missingEvidence = await clients.securityCertifier.rpc('platform_hris_certify_and_activate_tenant', {
    p_tenant_id: invitedTenantId, p_security_signoff_complete: true,
    p_evidence_reference: ' ',
  });
  let directActivationDenied = false;
  try {
    psqlSync("UPDATE public.tenants SET is_active=true WHERE id=" + sqlLiteral(invitedTenantId) + "::uuid;");
  } catch {
    directActivationDenied = true;
  }
  const securityEvidenceReference = 'isolated-phase21-security-signoff-' + suffix;
  const approvedCertification = await clients.securityCertifier.rpc('platform_hris_certify_and_activate_tenant', {
    p_tenant_id: invitedTenantId, p_security_signoff_complete: true,
    p_evidence_reference: securityEvidenceReference,
  });
  const certifiedTenantRead = await inviteeClient.from('tenants').select('id').eq('id', invitedTenantId);
  const certificationList = await clients.securityCertifier.rpc('platform_hris_list_tenant_certifications');
  const certifiedRecord = certificationList.data?.find(row => row.tenant_id === invitedTenantId);
  const certificationAudit = psql("SELECT count(*) FROM public.admin_audit_logs WHERE action='PLATFORM_TENANT_SECURITY_CERTIFIED_AND_ACTIVATED' AND target_id="
    + sqlLiteral(invitedTenantId) + ";");
  record('Super Admin invite stays inactive until an assigned security certifier records approved evidence',
    invitationCreated.data.email === invitationEmail
      && markedSent.data === true
      && Boolean(unauthenticatedInvite.error)
      && ordinaryAdminInvite.error?.code === '42501'
      && wrongAccountAcceptance.error?.code === '42501'
      && !acceptedInvitation.error
      && replayedAcceptance.data?.tenant_id === invitedTenantId
      && inactiveTenantRead.data?.length === 0
      && invitationAudit === '1'
      && pendingCertification?.certification_status === 'pending'
      && pendingCertification?.can_certify === false
      && unassignedSuperAdminCertification.error?.code === '42501'
      && incompleteSignoff.error?.code === '55000'
      && missingEvidence.error?.code === '22023'
      && directActivationDenied
      && !approvedCertification.error
      && approvedCertification.data?.is_active === true
      && certifiedRecord?.certification_status === 'certified'
      && certifiedRecord?.can_certify === true
      && certifiedTenantRead.data?.length === 1
      && certificationAudit === '1',
    JSON.stringify({ requestCreated: true, serviceMarkedSent: markedSent.data === true,
      anonymousInviteDenied: Boolean(unauthenticatedInvite.error),
      ordinaryAdminInviteDenied: ordinaryAdminInvite.error?.code === '42501',
      wrongInviteeDenied: wrongAccountAcceptance.error?.code === '42501',
      createdInactive: acceptedInvitation.data?.is_active === false,
      replayIdempotent: replayedAcceptance.data?.tenant_id === invitedTenantId,
      tenantDataHiddenWhileInactive: inactiveTenantRead.data?.length === 0,
      pendingUntilSecurityCertifier: pendingCertification?.certification_status === 'pending',
      unassignedSuperAdminDenied: unassignedSuperAdminCertification.error?.code === '42501',
      incompleteSignoffDenied: incompleteSignoff.error?.code === '55000',
      missingEvidenceDenied: missingEvidence.error?.code === '22023',
      directActivationDenied,
      approvedCertification: !approvedCertification.error,
      activatedAfterCertification: approvedCertification.data?.is_active === true,
      tenantVisibleAfterActivation: certifiedTenantRead.data?.length === 1,
      certificationAudit }));

  const pipeline = await clients.recruiterA.rpc('hris_get_recruitment_pipeline', {
    p_tenant_id: tenantA, p_search: 'Synthetic HRIS Release Role',
    p_stage: 'submitted', p_limit: 10, p_offset: 0,
  });
  const foreignPipeline = await clients.recruiterB.rpc('hris_get_recruitment_pipeline', {
    p_tenant_id: tenantA, p_search: null, p_stage: null, p_limit: 10, p_offset: 0,
  });
  const anonymousPipeline = await anon.rpc('hris_get_recruitment_pipeline', {
    p_tenant_id: tenantA, p_search: null, p_stage: null, p_limit: 10, p_offset: 0,
  });
  const initialPipelineRow = pipeline.data?.applications?.find(item => item.application_id === applicationId);
  record('Recruitment pipeline returns the authorized tenant application and denies cross-tenant and anonymous reads',
    !pipeline.error && pipeline.data?.total_count === 1
      && initialPipelineRow?.candidate_name === 'Synthetic Release Candidate'
      && initialPipelineRow?.job_title === 'Synthetic HRIS Release Role'
      && initialPipelineRow?.stage === 'submitted'
      && foreignPipeline.error?.code === '42501'
      && Boolean(anonymousPipeline.error),
    JSON.stringify({ tenantRows: pipeline.data?.total_count || 0,
      authorizedCandidateVisible: Boolean(initialPipelineRow),
      crossTenantDenied: foreignPipeline.error?.code === '42501',
      anonymousDenied: Boolean(anonymousPipeline.error) }));

  const pathA = users.candidateA.id + '/application-documents/' + randomUUID() + '.pdf';
  const pathB = users.candidateB.id + '/application-documents/' + randomUUID() + '.pdf';
  for (const [client, objectPath] of [[clients.candidateA,pathA],[clients.candidateB,pathB]]) {
    const uploaded = await client.storage.from('candidate-documents').upload(
      objectPath, new Blob(['%PDF-1.4\nsynthetic release document\n'], { type: 'application/pdf' }),
      { contentType: 'application/pdf', upsert: false },
    );
    if (uploaded.error) throw uploaded.error;
    uploadedPaths.push(objectPath);
  }
  const screeningCvA = randomUUID();
  const screeningCvB = randomUUID();
  screeningCvIds.push(screeningCvA, screeningCvB);
  psql("INSERT INTO public.candidate_cvs(id,candidate_user_id,document_url) VALUES "
    + "(" + sqlLiteral(screeningCvA) + "::uuid," + sqlLiteral(users.candidateA.id) + "::uuid," + sqlLiteral(pathA) + "),"
    + "(" + sqlLiteral(screeningCvB) + "::uuid," + sqlLiteral(users.candidateB.id) + "::uuid," + sqlLiteral(pathB) + ");");

  const screeningQuestions = [
    { id: 'q-short', questionText: 'Short response', type: 'short_text', required: true },
    { id: 'q-long', questionText: 'Long response', type: 'long_text', required: true },
    { id: 'q-number', questionText: 'Years', type: 'number', required: true },
    { id: 'q-yes-no', questionText: 'Available', type: 'yes_no', required: true },
    { id: 'q-single', questionText: 'Work mode', type: 'single_select', required: true, options: ['Remote', 'Hybrid'] },
    { id: 'q-multi', questionText: 'Languages', type: 'multi_select', required: true, options: ['English', 'Bangla'] },
    { id: 'q-date', questionText: 'Start date', type: 'date', required: true },
  ];
  const screeningAnswers = [
    { questionId: 'q-short', answer: 'Short answer' },
    { questionId: 'q-long', answer: 'A longer answer.' },
    { questionId: 'q-number', answer: 0 },
    { questionId: 'q-yes-no', answer: 'No' },
    { questionId: 'q-single', answer: 'Remote' },
    { questionId: 'q-multi', answer: ['English', 'Bangla'] },
    { questionId: 'q-date', answer: '2026-10-26' },
  ];
  function createScreeningJob(questions) {
    const id = randomUUID();
    screeningJobIds.push(id);
    psql("INSERT INTO public.jobs(id,tenant_id,reference_number,title,status,is_published,is_active,required_documents,screening_questions) VALUES ("
      + sqlLiteral(id) + "::uuid," + sqlLiteral(tenantA) + "::uuid," + sqlLiteral('QA-SCREEN-' + id.slice(0, 8))
      + ",'Synthetic Screening Role','published',true,true,'{}'," + sqlLiteral(JSON.stringify(questions)) + "::jsonb);");
    return id;
  }
  async function submitScreeningApplication(client, candidateCvId, screeningJobId, answers) {
    return client.rpc('candidate_apply_to_job', {
      p_job_id: screeningJobId,
      p_payload: {
        selected_cv_id: candidateCvId,
        full_name: 'Synthetic Release Candidate',
        phone: '555-0101',
        years_experience: 4,
        skills: ['sql'],
        answers,
        document_ids: [],
        required_document_map: {},
        declarations: { accuracyCertified: true, recruitmentDataConsent: true },
      },
    });
  }
  const validScreeningJob = createScreeningJob(screeningQuestions);
  const validScreeningSubmission = await submitScreeningApplication(
    clients.candidateA, screeningCvA, validScreeningJob, screeningAnswers,
  );
  if (validScreeningSubmission.error || typeof validScreeningSubmission.data !== 'string') {
    throw validScreeningSubmission.error || new Error('A valid all-types screening submission was rejected.');
  }
  screeningApplicationIds.push(validScreeningSubmission.data);
  const screeningApplication = await admin.from('job_applications').select('application_data')
    .eq('id', validScreeningSubmission.data).single();
  const crossTenantScreening = await submitScreeningApplication(
    clients.candidateB, screeningCvB, validScreeningJob, screeningAnswers,
  );
  const invalidScreeningCases = [
    ['unknown question ID', screeningQuestions, [...screeningAnswers, { questionId: 'unknown-question', answer: 'x' }]],
    ['duplicate question answer', screeningQuestions, [...screeningAnswers, { questionId: 'q-short', answer: 'duplicate' }]],
    ['wrong numeric answer type', screeningQuestions, screeningAnswers.map(answer => answer.questionId === 'q-number'
      ? { ...answer, answer: '0' } : answer)],
    ['unlisted single-select value', screeningQuestions, screeningAnswers.map(answer => answer.questionId === 'q-single'
      ? { ...answer, answer: 'Office' } : answer)],
    ['unlisted multi-select value', screeningQuestions, screeningAnswers.map(answer => answer.questionId === 'q-multi'
      ? { ...answer, answer: ['English', 'French'] } : answer)],
    ['duplicate multi-select value', screeningQuestions, screeningAnswers.map(answer => answer.questionId === 'q-multi'
      ? { ...answer, answer: ['English', 'English'] } : answer)],
    ['missing required answer', screeningQuestions, screeningAnswers.filter(answer => answer.questionId !== 'q-date')],
    ['invalid persisted question type', screeningQuestions.map(question => question.id === 'q-short'
      ? { ...question, type: 'client_only_type' } : question), screeningAnswers],
  ];
  const rejectedScreeningResults = [];
  for (const [label, questions, answers] of invalidScreeningCases) {
    const testJob = createScreeningJob(questions);
    const attempt = await submitScreeningApplication(clients.candidateA, screeningCvA, testJob, answers);
    rejectedScreeningResults.push({ label, rejected: Boolean(attempt.error) });
  }
  const rejectedApplicationRows = await admin.from('job_applications').select('id')
    .in('job_id', screeningJobIds);
  const screeningPassed = screeningApplication.data?.application_data?.answers?.length === 7
    && crossTenantScreening.error?.code === '42501'
    && rejectedScreeningResults.length === invalidScreeningCases.length
    && rejectedScreeningResults.every(result => result.rejected)
    && (rejectedApplicationRows.data || []).length === 1
    && rejectedApplicationRows.data?.[0]?.id === validScreeningSubmission.data;
  record('Candidate screening accepts all seven valid types and rejects malformed, unknown, duplicate, unlisted, missing, and cross-tenant submissions',
    screeningPassed,
    JSON.stringify({ validAnswerCount: screeningApplication.data?.application_data?.answers?.length || 0,
      rejected: rejectedScreeningResults,
      crossTenantDenied: crossTenantScreening.error?.code === '42501',
      noPartialInvalidApplications: (rejectedApplicationRows.data || []).length === 1 }));

  const registered = await clients.candidateA.rpc('candidate_add_application_document', {
    p_title: 'Synthetic identity document', p_file_name: 'identity.pdf',
    p_file_path: pathA, p_content_type: 'application/pdf',
  });
  const foreignPath = await clients.candidateA.rpc('candidate_add_application_document', {
    p_title: 'Foreign path', p_file_name: 'foreign.pdf',
    p_file_path: pathB, p_content_type: 'application/pdf',
  });
  const invalidTitle = await clients.candidateA.rpc('candidate_add_application_document', {
    p_title: '', p_file_name: 'identity.pdf', p_file_path: pathA,
    p_content_type: 'application/pdf',
  });
  const anonymousDocument = await anon.rpc('candidate_add_application_document', {
    p_title: 'Anonymous', p_file_name: 'identity.pdf', p_file_path: pathA,
    p_content_type: 'application/pdf',
  });
  const failedUploadPath = users.candidateA.id + '/application-documents/' + randomUUID() + '.pdf';
  const failedUpload = await clients.candidateA.storage.from('candidate-documents').upload(
    failedUploadPath, new Blob(['%PDF-1.4\nsynthetic failed upload\n'], { type: 'application/pdf' }),
    { contentType: 'application/pdf', upsert: false },
  );
  if (failedUpload.error) throw failedUpload.error;
  uploadedPaths.push(failedUploadPath);
  const failedRegistration = await clients.candidateA.rpc('candidate_add_application_document', {
    p_title: '', p_file_name: 'retry.pdf', p_file_path: failedUploadPath,
    p_content_type: 'application/pdf',
  });
  const cleanupUpload = await clients.candidateA.storage.from('candidate-documents').remove([failedUploadPath]);
  if (cleanupUpload.error) throw cleanupUpload.error;
  uploadedPaths.splice(uploadedPaths.indexOf(failedUploadPath), 1);
  const orphanedFile = await admin.storage.from('candidate-documents').download(failedUploadPath);
  record('Failed Candidate document registration cleans up its private upload',
    Boolean(failedRegistration.error) && Boolean(orphanedFile.error),
    JSON.stringify({ rejected: Boolean(failedRegistration.error), objectRemoved: Boolean(orphanedFile.error) }));
  const profile = await admin.from('candidate_profiles').select('profile_data')
    .eq('user_id', users.candidateA.id).single();
  const documents = profile.data?.profile_data?.documents || [];
  record('Candidate-owned private upload registers metadata and rejects foreign, invalid, and anonymous requests',
    !registered.error && registered.data?.fileUrl === pathA && documents.length === 1
      && documents[0]?.title === 'Synthetic identity document'
      && Boolean(foreignPath.error) && Boolean(invalidTitle.error) && Boolean(anonymousDocument.error),
    JSON.stringify({ ownerAccepted: !registered.error, metadataRows: documents.length,
      foreignPathDenied: Boolean(foreignPath.error), invalidDenied: Boolean(invalidTitle.error),
      anonymousDenied: Boolean(anonymousDocument.error) }));

  const issued = await clients.recruiterA.rpc('hris_issue_candidate_offer', {
    p_tenant_id: tenantA, p_application_id: applicationId, p_salary_amount: 100000,
    p_salary_currency: 'BDT', p_pay_period: 'monthly',
    p_proposed_joining_date: '2026-11-15', p_response_deadline: '2026-10-31',
    p_terms: 'Synthetic isolated acceptance test offer.',
  });
  if (issued.error || !issued.data?.offer_id) throw issued.error || new Error('Recruiter offer was not created.');
  const accepted = await clients.candidateA.rpc('candidate_respond_offer_record', {
    p_offer_id: issued.data.offer_id, p_response: 'accepted', p_note: null,
    p_signature: 'Synthetic isolated acceptance signature',
  });
  if (accepted.error) throw accepted.error;
  const updatedPipeline = await clients.recruiterA.rpc('hris_get_recruitment_pipeline', {
    p_tenant_id: tenantA, p_search: 'Synthetic Release Candidate',
    p_stage: 'offer_accepted', p_limit: 10, p_offset: 0,
  });
  const updatedPipelineRow = updatedPipeline.data?.applications?.find(item => item.application_id === applicationId);
  const offerMilestone = updatedPipelineRow?.milestones?.find(item => item.stage === 'offer_extended');
  if (updatedPipeline.error || updatedPipelineRow?.stage !== 'offer_accepted' || !offerMilestone) {
    throw updatedPipeline.error || new Error('Recruitment pipeline did not reflect the Candidate offer acceptance and history.');
  }
  const handoff = await clients.candidateA.rpc('candidate_get_my_preboarding_handoff', {
    p_application_id: applicationId,
  });
  if (handoff.error || handoff.data?.application_id !== applicationId) {
    throw handoff.error || new Error('The accepting candidate could not read the handoff.');
  }
  const invalidStep = await clients.candidateA.rpc('candidate_save_my_preboarding_step', {
    p_application_id: applicationId, p_step_key: 'step_identity',
    p_payload: { national_id: 'SYNTHETIC-ID', date_of_birth: '1988-12-31',
      nationality: 'Bangladeshi', address: 'Synthetic address', recruiter_only: 'forbidden' },
  });
  const foreignHandoff = await clients.candidateB.rpc('candidate_get_my_preboarding_handoff', {
    p_application_id: applicationId,
  });
  const foreignStep = await clients.candidateB.rpc('candidate_save_my_preboarding_step', {
    p_application_id: applicationId, p_step_key: 'step_identity',
    p_payload: { national_id: 'FOREIGN', date_of_birth: '1988-12-31',
      nationality: 'Bangladeshi', address: 'Foreign address' },
  });
  if (!invalidStep.error || foreignHandoff.error || foreignHandoff.data !== null || !foreignStep.error) {
    throw new Error('Candidate preboarding did not reject invalid fields and isolate ownership.');
  }
  const steps = [
    ['step_identity', { national_id: 'SYNTHETIC-ID', date_of_birth: '1988-12-31',
      nationality: 'Bangladeshi', address: 'Synthetic address' }],
    ['step_emergency', { emergency_contact_name: 'Synthetic Contact',
      emergency_contact_phone: '+8801700000000', emergency_contact_relation: 'Parent' }],
    ['step_payroll', { bank_name: 'Synthetic Bank', bank_account_number: 'TEST-ACCOUNT-001',
      tax_identification_number: 'TEST-TIN-001' }],
    ['step_policies', { policies_accepted: true }],
  ];
  const stepProgress = [];
  for (const [step, payload] of steps) {
    const saved = await clients.candidateA.rpc('candidate_save_my_preboarding_step', {
      p_application_id: applicationId, p_step_key: step, p_payload: payload,
    });
    if (saved.error) throw saved.error;
    stepProgress.push({
      step,
      completedSteps: saved.data?.candidate_completed_steps?.length || 0,
      submitted: Boolean(saved.data?.candidate_submitted_at),
      status: saved.data?.status,
    });
  }
  const queue = await clients.recruiterA.rpc('hris_get_candidate_preboarding_queue', { p_tenant_id: tenantA });
  const foreignQueue = await clients.recruiterB.rpc('hris_get_candidate_preboarding_queue', { p_tenant_id: tenantA });
  const directRead = await clients.candidateA.from('onboarding_handoffs').select('id').eq('application_id', applicationId);
  const anonymousHandoff = await anon.rpc('candidate_get_my_preboarding_handoff', { p_application_id: applicationId });
  const row = queue.data?.find(item => item.application_id === applicationId);
  record('Recruiter offer → Candidate acceptance and steps → authorized HR queue stays tenant scoped',
    !accepted.error && !handoff.error && queue.data?.length === 1
      && row?.candidate_completed_steps?.length === 4
      && Boolean(row?.candidate_submitted_at)
      && row?.candidate_personal_data?.national_id === 'SYNTHETIC-ID'
      && foreignQueue.error?.code === '42501'
      && Boolean(directRead.error) && Boolean(anonymousHandoff.error),
    JSON.stringify({ accepted: !accepted.error, queueRows: queue.data?.length || 0,
      completedSteps: row?.candidate_completed_steps?.length || 0,
      submitted: Boolean(row?.candidate_submitted_at), stepProgress,
      foreignRecruiterDenied: foreignQueue.error?.code === '42501',
      directTableDenied: Boolean(directRead.error), anonymousDenied: Boolean(anonymousHandoff.error) }));
} catch (error) {
  record('Release RPC local Auth/Postgres acceptance completed without errors', false,
    String(error?.message || error).slice(0, 500));
} finally {
  if (uploadedPaths.length) {
    const removed = await admin.storage.from('candidate-documents').remove(uploadedPaths);
    if (removed.error) throw removed.error;
  }
  const ids = createdUserIds.map(sqlLiteral).join(',');
  if (invitationIds.length) {
    const invitationSql = invitationIds.map(sqlLiteral).join(',');
    psql("DELETE FROM public.admin_audit_logs WHERE target_type='platform_tenant_invitations' AND target_id IN ("
      + invitationSql + ");"
      + "DELETE FROM private.platform_tenant_invitations WHERE id IN (" + invitationSql + ");");
  }
  if (invitationTenantIds.length) {
    const tenantSql = invitationTenantIds.map(sqlLiteral).join(',');
    psql("DELETE FROM public.admin_audit_logs WHERE actor_id IN (" + ids + ") OR target_id IN ("
      + tenantSql + ");"
      + "DELETE FROM private.platform_tenant_security_certifications WHERE tenant_id IN (" + tenantSql + ");"
      + "DELETE FROM public.tenant_memberships WHERE tenant_id IN (" + tenantSql + ");"
      + "DELETE FROM public.tenants WHERE id IN (" + tenantSql + ");");
  }
  if (employeeInvitationIds.length) {
    const employeeInvitationSql = employeeInvitationIds.map(sqlLiteral).join(',');
    const employeeSql = employeeIds.map(sqlLiteral).join(',');
    psql("DELETE FROM public.admin_audit_logs WHERE target_type='employee' AND target_id IN (" + employeeSql + ");"
      + "DELETE FROM private.hris_employee_invitations WHERE id IN (" + employeeInvitationSql + ");"
      + "DELETE FROM public.employees WHERE id IN (" + employeeSql + ");");
  }
  if (directEmployeeEmail) {
    psql("DELETE FROM public.employees WHERE official_email=" + sqlLiteral(directEmployeeEmail) + ";");
  }
  if (screeningApplicationIds.length) {
    const applicationSql = screeningApplicationIds.map(sqlLiteral).join(',');
    psql("DELETE FROM public.candidate_notifications WHERE related_application_id IN (" + applicationSql + ");"
      + "DELETE FROM public.candidate_application_stage_history WHERE application_id IN (" + applicationSql + ");"
      + "DELETE FROM public.job_applications WHERE id IN (" + applicationSql + ");");
  }
  if (screeningJobIds.length) {
    const jobSql = screeningJobIds.map(sqlLiteral).join(',');
    psql("DELETE FROM public.job_applications WHERE job_id IN (" + jobSql + ");"
      + "DELETE FROM public.candidate_application_drafts WHERE job_id IN (" + jobSql + ");"
      + "DELETE FROM public.jobs WHERE id IN (" + jobSql + ");");
  }
  if (screeningCvIds.length) {
    psql("DELETE FROM public.candidate_cvs WHERE id IN (" + screeningCvIds.map(sqlLiteral).join(',') + ");");
  }
  if (createdUserIds.length) {
    psql("DELETE FROM public.candidate_notifications WHERE related_application_id=" + sqlLiteral(applicationId) + "::uuid;"
      + "DELETE FROM public.candidate_application_stage_history WHERE application_id=" + sqlLiteral(applicationId) + "::uuid;"
      + "DELETE FROM public.onboarding_handoffs WHERE application_id=" + sqlLiteral(applicationId) + "::uuid;"
      + "DELETE FROM public.job_offers WHERE application_id=" + sqlLiteral(applicationId) + "::uuid;"
      + "DELETE FROM public.job_applications WHERE id=" + sqlLiteral(applicationId) + "::uuid;"
      + "DELETE FROM public.jobs WHERE id=" + sqlLiteral(jobId) + "::uuid;"
      + "DELETE FROM public.candidate_profiles WHERE user_id IN (" + ids + ");"
      + "DELETE FROM public.admin_audit_logs WHERE actor_id IN (" + ids + ");"
      + "DELETE FROM public.admin_users WHERE user_id IN (" + ids + ");"
      + "DELETE FROM public.tenant_memberships WHERE user_id IN (" + ids + ");"
      + "DELETE FROM public.user_roles WHERE user_id IN (" + ids + ");");
    for (const userId of createdUserIds) {
      const deleted = await admin.auth.admin.deleteUser(userId);
      if (deleted.error) throw deleted.error;
    }
  }
  if (createdBucket) {
    const deleted = await admin.storage.deleteBucket('candidate-documents');
    if (deleted.error) throw deleted.error;
  }
}

const failures = results.filter(item => !item.ok);
console.log('Release RPC acceptance: ' + (results.length - failures.length) + '/' + results.length + ' passed.');
if (failures.length) process.exitCode = 1;
