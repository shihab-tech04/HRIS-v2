import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const migrationPath = new URL('../../supabase/migrations/20261111031236_hris_restore_private_storage_tenant_read_guard.sql', import.meta.url);
const migration = readFileSync(migrationPath, 'utf8');
const historicalMigration = readFileSync(new URL('../../supabase/migrations/20261023130800_hris_private_storage_tenant_read_guard.sql', import.meta.url), 'utf8');
const releasePath = new URL('../../scripts/release/hris-attendance-gated-sql-release.sh', import.meta.url);
const release = readFileSync(releasePath, 'utf8');
const isolatedHarness = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');

test('storage guard recovery reuses the approved tenant-aware policy contract', () => {
  assert.equal(migration, historicalMigration, 'Recovery must apply the exact already-reviewed tenant guard SQL.');
  assert.match(migration, /CREATE OR REPLACE FUNCTION private\.hris_storage_owner_tenant_read/);
  assert.match(migration, /SECURITY DEFINER[\s\S]*?SET search_path = ''/);
  assert.match(migration, /public\.is_live_session\(\)[\s\S]*?auth\.uid\(\) IS NOT NULL/);
  for (const bucket of ['candidate-documents', 'employee-documents', 'attendance-evidence']) {
    assert.match(migration, new RegExp(`WHEN p_bucket_id='${bucket}'`));
  }
  assert.match(migration, /ELSE FALSE/);
  assert.match(migration, /REVOKE ALL ON FUNCTION private\.hris_storage_owner_tenant_read\(text,text\)[\s\S]*?FROM PUBLIC, anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION private\.hris_storage_owner_tenant_read\(text,text\)[\s\S]*?TO authenticated/);
  assert.match(migration, /CREATE POLICY hris_private_storage_tenant_read_guard[\s\S]*?AS RESTRICTIVE FOR SELECT TO authenticated/);
  assert.match(migration, /DROP POLICY IF EXISTS employee_documents_storage_owner_guard/);
});

test('the protected attendance release supports repair-only after E06 is already applied', () => {
  execFileSync('bash', ['-n', fileURLToPath(releasePath)], { encoding: 'utf8' });
  const migrationHash = createHash('sha256').update(migration).digest('hex');
  assert.match(release, /guard_migration='20261111031236_hris_restore_private_storage_tenant_read_guard\.sql'/);
  assert.ok(release.includes(migrationHash), 'The release script must pin the exact recovery migration bytes.');
  assert.match(release, /apply_e06=false/);
  assert.match(release, /apply_guard=false/);
  assert.match(release, /verify_only=false/);
  assert.match(release, /if \[\[ \"\$verify_only\" == true \]\]; then\s+echo 'PASS: both approved migrations are already installed; continuing with production verification only\.'\s+else\s+supabase init/);
  assert.match(release, /no SQL migration was re-applied/);
  assert.match(release, /FAIL: production dependency precheck query could not execute/);
  assert.match(release, /FAIL: production function, grant, RLS, or tenant-aware Storage policy postcheck failed/);
  assert.doesNotMatch(release, /Private-storage tenant guard repair migration is already installed/);
  assert.match(release, /20261111031236\|hris_restore_private_storage_tenant_read_guard/);
  assert.match(release, /Dry run selected migrations outside the approved E06\/E11 and private-storage guard set/);
  assert.match(release, /FAIL: an unapproved hosted migration history row changed/);
  assert.match(release, /FAIL: protected migration changed one or more guarded table row counts/);
  assert.match(release, /hris_private_storage_tenant_read_guard' AND permissive='RESTRICTIVE'/);
  assert.match(release, /ATTENDANCE_PRODUCTION_POSTCHECK_PASS/);
});

test('the production postcheck preserves empty search_path quotes through Bash expansion', () => {
  const postcheckMatch = release.match(/if ! postcheck="\$\(db_psql -c "([\s\S]*?)"\)"; then/);
  assert.ok(postcheckMatch, 'The release must capture the postcheck SQL output.');
  const postcheckSql = postcheckMatch[1];
  assert.doesNotMatch(postcheckSql, /["$`]/, 'The SQL passed inside Bash double quotes must not contain unescaped shell metacharacters.');

  const expandedSql = execFileSync('bash', ['-c', `query="${postcheckSql}"\nprintf '%s' "$query"`], { encoding: 'utf8' });
  assert.match(expandedSql, /p\.proconfig @> ARRAY\['search_path=' \|\| chr\(34\) \|\| chr\(34\)\]/);
  assert.doesNotMatch(expandedSql, /p\.proconfig @> ARRAY\['search_path='\s*\]/);
});

test('isolated Auth/Postgres acceptance applies the repair after the E06/E11 migration', () => {
  assert.match(isolatedHarness, /20261110193754_hris_attendance_correction_movement_parity\.sql'[\s\S]*?20261111031236_hris_restore_private_storage_tenant_read_guard\.sql/);
});
