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
if (!legacyGuardRetirementSql.startsWith('BEGIN;')
    || !legacyGuardRetirementSql.endsWith('COMMIT;')) {
  throw new Error('Refusing notices guard rehearsal: staging retirement must remain a single transaction.');
}
const retirementBody = legacyGuardRetirementSql
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
  ) THEN
    RAISE EXCEPTION 'Disposable rehearsal requires the replacement tenant guard.';
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

const paritySql = readFileSync(path.join(root, 'tests/sql/hosted-parity/check-read-only.sql'), 'utf8')
  .trim().replace(/;\s*$/, '');
const wrappedSql = `SELECT jsonb_agg(to_jsonb(g) ORDER BY g.kind,g.object) FROM (${paritySql}) AS g;`;
const output = execFileSync('docker', [
  '--context', dockerContext, 'exec', '-i', container, 'psql',
  '-X', '-A', '-t', '-q', '--set=ON_ERROR_STOP=1', '--username', 'postgres', '--dbname', 'postgres',
], { input: wrappedSql, encoding: 'utf8' }).trim();
const rows = JSON.parse(output);
const failures = (rows || []).filter((row) => row.passed !== true);
if (!Array.isArray(rows) || rows.length !== 25 || failures.length) {
  const missing = failures.map((row) => `${row.kind}:${row.object}`).join(', ');
  throw new Error(`Phase 04 SQL/API parity failed (${rows?.length || 0}/25): ${missing || 'unexpected contract count'}`);
}
console.log(`Phase 04 SQL/API parity contract: ${rows.length}/25 passed on Auth-tested disposable schema.`);
