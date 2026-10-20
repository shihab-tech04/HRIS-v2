// Run the hosted Phase 04 catalog contract against the isolated Auth/RLS
// schema after the selected source migrations have been installed. This harness
// refuses every workdir except the local acceptance stack used by no-deploy CI.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const workdir = path.resolve(process.env.HRIS_SUPABASE_TEST_WORKDIR || '/tmp/synesis-local-hris-test');
const dockerContext = process.env.HRIS_DOCKER_CONTEXT || 'default';
const allowedWorkdirs = new Set([
  path.resolve('/tmp/synesis-local-hris-test'),
  path.resolve('/private/tmp/synesis-local-hris-test'),
]);

if (!allowedWorkdirs.has(workdir)) {
  throw new Error('Refusing parity test: only the disposable Synesis HRIS acceptance workdir is allowed.');
}
if (execFileSync('docker', ['--context', dockerContext, 'context', 'show'], {
  encoding: 'utf8',
}).trim() !== dockerContext) {
  throw new Error('Refusing parity test: the requested Docker context is not active.');
}

const container = execFileSync('docker', [
  '--context', dockerContext, 'ps', '--filter',
  `name=supabase_db_${path.basename(workdir)}`, '--format', '{{.Names}}',
], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
if (container !== `supabase_db_${path.basename(workdir)}`) {
  throw new Error('Refusing parity test: no matching disposable local Supabase Postgres container was found.');
}

const legacyGuardRetirementSql = readFileSync(
  path.join(root, 'supabase/staging/hosted-legacy-notices/retire-legacy-security-guard.staging.sql'),
  'utf8',
).trim();
const retirementSqlLines = legacyGuardRetirementSql.split(String.fromCharCode(10));
while (retirementSqlLines[0]?.trimStart().startsWith('--')) retirementSqlLines.shift();
const retirementSqlBody = retirementSqlLines.join(String.fromCharCode(10)).trim();
if (!retirementSqlBody.startsWith('BEGIN;')
    || !retirementSqlBody.endsWith('COMMIT;')) {
  throw new Error('Refusing notices guard rehearsal: staging retirement must remain a single transaction.');
}
const retirementBody = retirementSqlBody
  .slice('BEGIN;'.length)
  .slice(0, -'COMMIT;'.length);
const retirementRehearsal = `BEGIN;
DO $replacement_guard_preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname='public' AND p.tablename='notices'
      AND p.policyname='hris_notices_membership_guard'
      AND p.permissive='RESTRICTIVE' AND p.cmd='SELECT'
      AND 'authenticated'=ANY(p.roles)
      AND p.qual LIKE '%hris_notices_super_admin_tenant_member%'
      AND p.qual NOT LIKE '%is_active_admin%'
      AND to_regprocedure('public.hris_notices_super_admin_tenant_member(uuid)') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Disposable rehearsal requires the membership-scoped Super Admin replacement guard.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname='public' AND p.tablename='notices'
      AND p.policyname='hris_notices_legacy_security_guard'
  ) THEN
    RAISE EXCEPTION 'Disposable rehearsal requires a clean initial notices policy state.';
  END IF;
END
$replacement_guard_preflight$;

CREATE POLICY hris_notices_legacy_security_guard
  ON public.notices AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    tenant_id = public.synesis_tenant_id()
    AND (
      public.is_active_admin()
      OR public.has_permission('notices.view')
      OR public.has_permission('notices.manage')
    )
  );

${retirementBody}

DO $replacement_guard_postflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname='public' AND p.tablename='notices'
      AND p.policyname='hris_notices_membership_guard'
      AND p.permissive='RESTRICTIVE' AND p.cmd='SELECT'
      AND p.qual LIKE '%hris_notices_super_admin_tenant_member%'
      AND p.qual NOT LIKE '%is_active_admin%'
  ) THEN
    RAISE EXCEPTION 'Notices retirement removed or changed the replacement policy.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname='public' AND p.tablename='notices'
      AND p.policyname='hris_notices_legacy_security_guard'
  ) THEN
    RAISE EXCEPTION 'Disposable rehearsal did not retire the legacy notices guard.';
  END IF;
END
$replacement_guard_postflight$;

ROLLBACK;
`;
execFileSync('docker', [
  '--context', dockerContext, 'exec', '-i', container, 'psql',
  '-X', '-A', '-t', '-q', '--set=ON_ERROR_STOP=1', '--username', 'postgres', '--dbname', 'postgres',
], { input: retirementRehearsal, encoding: 'utf8' });
console.log('Legacy notices guard retirement rehearsal passed in a rolled-back disposable transaction.');
const rollbackStateOutput = execFileSync('docker', [
  '--context', dockerContext, 'exec', '-i', container, 'psql',
  '-X', '-A', '-t', '-q', '--set=ON_ERROR_STOP=1', '--username', 'postgres', '--dbname', 'postgres',
], {
  input: `SELECT jsonb_build_object(
    'replacement_guard', EXISTS (
      SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename='notices'
        AND p.policyname='hris_notices_membership_guard'
        AND p.permissive='RESTRICTIVE' AND p.cmd='SELECT'
        AND p.qual LIKE '%hris_notices_super_admin_tenant_member%'
        AND p.qual NOT LIKE '%is_active_admin%'
    ),
    'legacy_guard_absent', NOT EXISTS (
      SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename='notices'
        AND p.policyname='hris_notices_legacy_security_guard'
    ),
    'super_admin_helper', to_regprocedure('public.hris_notices_super_admin_tenant_member(uuid)') IS NOT NULL
  )::text;`,
  encoding: 'utf8',
}).trim();
const rollbackState = JSON.parse(rollbackStateOutput);
if (rollbackState.replacement_guard !== true
    || rollbackState.legacy_guard_absent !== true
    || rollbackState.super_admin_helper !== true) {
  throw new Error('Rolled-back notices retirement did not restore the prior safe replacement policy state.');
}


const paritySql = readFileSync(path.join(root, 'tests/sql/hosted-parity/check-read-only.sql'), 'utf8')
  .trim().replace(/;\s*$/, '');
const wrappedSql = `SELECT jsonb_agg(to_jsonb(g) ORDER BY g.kind,g.object) FROM (${paritySql}) AS g;`;
const output = execFileSync('docker', [
  '--context', dockerContext, 'exec', '-i', container, 'psql',
  '-X', '-A', '-t', '-q', '--set=ON_ERROR_STOP=1', '--username', 'postgres', '--dbname', 'postgres',
], { input: wrappedSql, encoding: 'utf8' }).trim();
const rows = JSON.parse(output);
const failures = (rows || []).filter((row) => row.passed !== true);
if (!Array.isArray(rows) || rows.length !== 26 || failures.length) {
  const missing = failures.map((row) => `${row.kind}:${row.object}`).join(', ');
  throw new Error(`Phase 04 SQL/API parity failed (${rows?.length || 0}/26): ${missing || 'unexpected contract count'}`);
}
console.log(`Phase 04 SQL/API parity contract: ${rows.length}/26 passed on Auth-tested disposable schema.`);

const hostedTransitionSql = readFileSync(
  path.join(root, 'database-releases/phase03-04-recovery/phase03_phase04_hosted_compatibility.sql'),
  'utf8',
);
const transitionLines = hostedTransitionSql.split(String.fromCharCode(10));
const transactionStart = transitionLines.findIndex((line) => line.trim() && !line.trimStart().startsWith('--'));
let transactionEnd = transitionLines.length - 1;
while (transactionEnd >= 0 && !transitionLines[transactionEnd].trim()) transactionEnd -= 1;
if (transitionLines[transactionStart]?.trim() !== 'BEGIN;'
    || transitionLines[transactionEnd]?.trim() !== 'COMMIT;') {
  throw new Error('Hosted compatibility rehearsal must remain one explicit transaction.');
}
transitionLines.splice(transactionEnd, 1);
transitionLines.splice(transactionStart, 1);
const transitionBody = transitionLines.join(String.fromCharCode(10));

const rollbackSnapshotSql = `SELECT jsonb_build_object(
  'admin_users', (SELECT md5(coalesce(string_agg(to_jsonb(a)::text,chr(10) ORDER BY a.user_id::text),''))
                  FROM public.admin_users a),
  'auth_users', (SELECT md5(coalesce(string_agg(to_jsonb(u)::text,chr(10) ORDER BY u.id::text),''))
                 FROM auth.users u),
  'audit', (SELECT md5(coalesce(string_agg(to_jsonb(a)::text,chr(10) ORDER BY a.id::text),''))
            FROM public.admin_audit_logs a),
  'memberships', (SELECT md5(coalesce(string_agg(to_jsonb(m)::text,chr(10) ORDER BY m.tenant_id::text,m.user_id::text),''))
                  FROM public.tenant_memberships m),
  'user_roles', (SELECT md5(coalesce(string_agg(to_jsonb(ur)::text,chr(10) ORDER BY ur.user_id::text,ur.role_id),''))
                 FROM public.user_roles ur),
  'role_permissions', (SELECT md5(coalesce(string_agg(to_jsonb(rp)::text,chr(10) ORDER BY rp.role_id,rp.permission_id),''))
                       FROM public.role_permissions rp),
  'columns', (SELECT md5(coalesce(string_agg(table_schema||'.'||table_name||'.'||column_name||':'||udt_name||':'||is_nullable||':'||coalesce(column_default,''),chr(10)
                    ORDER BY table_schema,table_name,ordinal_position),''))
              FROM information_schema.columns WHERE table_schema IN ('auth','private','public','storage')),
  'relations', (SELECT md5(coalesce(string_agg(n.nspname||'.'||c.relname||':'||c.relkind::text||':'||c.relrowsecurity||':'||c.relforcerowsecurity,chr(10)
                      ORDER BY n.nspname,c.relname),''))
                FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname IN ('auth','private','public','storage') AND c.relkind IN ('r','p','v','m','S')),
  'indexes', (SELECT md5(coalesce(string_agg(i.indexrelid::regclass::text||':'||pg_get_indexdef(i.indexrelid),chr(10)
                    ORDER BY i.indexrelid::regclass::text),''))
              FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid
              JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','storage')),
  'constraints', (SELECT md5(coalesce(string_agg(conrelid::regclass::text||':'||conname||':'||pg_get_constraintdef(oid),chr(10)
                        ORDER BY conrelid::regclass::text,conname),''))
                  FROM pg_constraint WHERE connamespace IN ('public'::regnamespace,'storage'::regnamespace)),
  'policies', (SELECT md5(coalesce(string_agg(schemaname||'.'||tablename||'.'||policyname||':'||permissive||':'||roles::text||':'||cmd||':'||coalesce(qual,'')||':'||coalesce(with_check,''),chr(10)
                      ORDER BY schemaname,tablename,policyname),''))
               FROM pg_policies),
  'functions', (SELECT md5(coalesce(string_agg(n.nspname||'.'||p.oid::regprocedure::text||':'||pg_get_functiondef(p.oid),chr(10)
                       ORDER BY n.nspname,p.oid::regprocedure::text),''))
                FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname IN ('private','public') AND p.prokind IN ('f','p')),
  'triggers', (SELECT md5(coalesce(string_agg(n.nspname||'.'||c.relname||':'||t.tgname||':'||pg_get_triggerdef(t.oid),chr(10)
                      ORDER BY n.nspname,c.relname,t.tgname),''))
               FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
               JOIN pg_namespace n ON n.oid=c.relnamespace
               WHERE n.nspname IN ('public','storage') AND NOT t.tgisinternal)
)::text;`;
const runRollbackSnapshot = () => execFileSync('docker', [
  '--context', dockerContext, 'exec', '-i', container, 'psql',
  '-X', '-A', '-t', '-q', '--set=ON_ERROR_STOP=1', '--username', 'postgres', '--dbname', 'postgres',
], { input: rollbackSnapshotSql, encoding: 'utf8' }).trim();

const rollbackBefore = runRollbackSnapshot();
const hostedTransitionRollback = `BEGIN;
DROP FUNCTION public.hris_can_read_learning_catalog(uuid) CASCADE;
DROP TABLE IF EXISTS public.tenant_module_settings CASCADE;
DROP TABLE IF EXISTS public.employee_shift_assignment_changes CASCADE;
DROP TABLE IF EXISTS public.roster_change_notifications CASCADE;
DROP TABLE IF EXISTS public.travel_request_notifications CASCADE;
DROP TABLE IF EXISTS public.learning_completion_notifications CASCADE;
DROP TABLE IF EXISTS public.learning_completion_events CASCADE;
ALTER TABLE public.tenants DROP COLUMN IF EXISTS default_locale CASCADE;
DROP POLICY IF EXISTS hris_notices_legacy_security_guard ON public.notices;
CREATE POLICY hris_notices_legacy_security_guard
  ON public.notices AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    tenant_id = public.synesis_tenant_id()
    AND (
      public.is_active_admin()
      OR public.has_permission('notices.view')
      OR public.has_permission('notices.manage')
    )
  );
${transitionBody}
DO $recovery_learning_dependency$
BEGIN
 IF to_regprocedure('public.hris_can_read_learning_catalog(uuid)') IS NULL
 OR has_function_privilege('anon','public.hris_can_read_learning_catalog(uuid)','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.hris_can_read_learning_catalog(uuid)','EXECUTE')
 OR public.hris_can_read_learning_catalog(NULL::uuid) IS DISTINCT FROM false THEN
  RAISE EXCEPTION 'Learning catalogue dependency or ACL was not restored';
 END IF;
END
$recovery_learning_dependency$;
ROLLBACK;`;
execFileSync('docker', [
  '--context', dockerContext, 'exec', '-i', container, 'psql',
  '-X', '-A', '-t', '-q', '--set=ON_ERROR_STOP=1', '--username', 'postgres', '--dbname', 'postgres',
], { input: hostedTransitionRollback, encoding: 'utf8' });
const rollbackAfter = runRollbackSnapshot();
if (rollbackBefore !== rollbackAfter) {
  throw new Error('Hosted Phase 03/04 migration rollback changed Auth, records, catalog, policies, or grants.');
}
console.log('Phase 03/04 hosted compatibility migration and rollback rehearsal passed; Auth, audit, grants and schema fingerprints are unchanged.');
