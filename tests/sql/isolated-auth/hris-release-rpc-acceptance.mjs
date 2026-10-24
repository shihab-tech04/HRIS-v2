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
let createdBucket = false;
const password = randomBytes(24).toString('base64url');
const tenantA = '11111111-1111-4111-8111-111111111111';
const tenantB = '22222222-2222-4222-8222-222222222222';
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
  psql("INSERT INTO public.roles(id,name,description,active,is_system) "
    + "VALUES('hr_admin','Tenant HR administrator',"
    + "'Synthetic isolated tenant-scoped organization administration',true,false) "
    + "ON CONFLICT (id) DO NOTHING;"
    + "INSERT INTO public.role_permissions(role_id,permission_id) "
    + "SELECT 'hr_admin','organization.manage' WHERE NOT EXISTS ("
    + "SELECT 1 FROM public.role_permissions WHERE role_id='hr_admin' "
    + "AND permission_id='organization.manage');");
  applySql('supabase/migrations/20261024220001_platform_tenant_invitations.sql');
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
    + " AND NOT has_table_privilege('anon','private.platform_tenant_invitations','SELECT'))::text;";
  const contractState = JSON.parse(psql(contractSql));
  const rpcContractsPass = hostedRpcSignatures.length === 36
    && contractState.missing_signatures.length === 0
    && contractState.anonymous_execute.length === 0
    && contractState.authenticated_missing.length === 0
    && contractState.private_roster === true;
  record('All 36 forward-ported public RPC signatures have authenticated execution and anonymous access is denied',
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
  };
  const users = {};
  for (const key of Object.keys(emails)) {
    const created = await admin.auth.admin.createUser({
      email: emails[key], password, email_confirm: true,
    });
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
    + "(" + sqlLiteral(users.superAdmin.id) + "::uuid,'Synthetic release platform Super Admin',true,true);"
    + "INSERT INTO public.tenant_memberships(tenant_id,user_id,role,status) VALUES "
    + "(" + sqlLiteral(tenantA) + "::uuid," + sqlLiteral(users.recruiterA.id) + "::uuid,'qa_tenant_recruitment_manager_a','active'),"
    + "(" + sqlLiteral(tenantB) + "::uuid," + sqlLiteral(users.recruiterB.id) + "::uuid,'qa_tenant_manager_b','active');"
    + "INSERT INTO public.candidate_profiles(user_id,tenant_id,profile_status,profile_data) VALUES "
    + "(" + sqlLiteral(users.candidateA.id) + "::uuid," + sqlLiteral(tenantA) + "::uuid,'active','{}'::jsonb),"
    + "(" + sqlLiteral(users.candidateB.id) + "::uuid," + sqlLiteral(tenantB) + "::uuid,'active','{}'::jsonb);"
    + "INSERT INTO public.jobs(id,tenant_id,reference_number,title,status,is_published,is_active) VALUES "
    + "(" + sqlLiteral(jobId) + "::uuid," + sqlLiteral(tenantA) + "::uuid,'QA-RELEASE-1','Synthetic HRIS Release Role','published',true,true);"
    + "INSERT INTO public.job_applications(id,tenant_id,job_id,candidate_user_id,full_name,email,stage,applied_at) VALUES "
    + "(" + sqlLiteral(applicationId) + "::uuid," + sqlLiteral(tenantA) + "::uuid," + sqlLiteral(jobId) + "::uuid,"
    + sqlLiteral(users.candidateA.id) + "::uuid,'Synthetic Release Candidate'," + sqlLiteral(emails.candidateA) + ",'submitted',now());");

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
  record('Super Admin invite uses local Auth, accepts only for the invited email, and provisions an inactive tenant once',
    invitationCreated.data.email === invitationEmail
      && markedSent.data === true
      && Boolean(unauthenticatedInvite.error)
      && ordinaryAdminInvite.error?.code === '42501'
      && wrongAccountAcceptance.error?.code === '42501'
      && !acceptedInvitation.error
      && replayedAcceptance.data?.tenant_id === invitedTenantId
      && inactiveTenantRead.data?.length === 0
      && invitationAudit === '1',
    JSON.stringify({ requestCreated: true, serviceMarkedSent: markedSent.data === true,
      anonymousDenied: Boolean(unauthenticatedInvite.error),
      ordinaryAdminDenied: ordinaryAdminInvite.error?.code === '42501',
      wrongInviteeDenied: wrongAccountAcceptance.error?.code === '42501',
      createdInactive: acceptedInvitation.data?.is_active === false,
      replayIdempotent: replayedAcceptance.data?.tenant_id === invitedTenantId,
      tenantDataHiddenWhileInactive: inactiveTenantRead.data?.length === 0 }));

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
  for (const [step, payload] of steps) {
    const saved = await clients.candidateA.rpc('candidate_save_my_preboarding_step', {
      p_application_id: applicationId, p_step_key: step, p_payload: payload,
    });
    if (saved.error) throw saved.error;
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
    JSON.stringify({ accepted: !accepted.error, completedSteps: row?.candidate_completed_steps?.length || 0,
      submitted: Boolean(row?.candidate_submitted_at),
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
      + "DELETE FROM public.tenant_memberships WHERE tenant_id IN (" + tenantSql + ");"
      + "DELETE FROM public.tenants WHERE id IN (" + tenantSql + ");");
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
