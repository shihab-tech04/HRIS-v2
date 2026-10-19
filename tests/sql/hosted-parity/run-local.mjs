// Run the hosted Phase 04 catalog contract against the repository's disposable
// Supabase source schema. This harness refuses every workdir except the local
// acceptance stack used by the no-deployment CI workflow.
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
  path.resolve('/tmp/synesis-local-hris-parity-test'),
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
console.log(`Phase 04 SQL/API parity contract: ${rows.length}/25 passed on disposable source schema.`);
