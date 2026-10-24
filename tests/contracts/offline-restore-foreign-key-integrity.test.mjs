import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const file = readFileSync(new URL('../../.github/workflows/hris-step1-offline-restore-proof.yml',import.meta.url),'utf8');
test('offline PG17 archive restores pre-data, data, then post-data with real constraints', () => {
  assert.match(file,/for section in pre-data data post-data; do/);
  assert.match(file,/--section="\$section" --exit-on-error/);
  assert.match(file,/restore_failed_section/);
  assert.match(file,/--username supabase_admin/);
  assert.match(file,/ISOLATED_SUPERUSER_VERIFIED/);
  assert.match(file,/FROM auth\.users/);
  assert.match(file,/admin_audit_logs a[\s\S]*LEFT JOIN auth\.users u ON u\.id=a\.actor_id/);
  assert.match(file,/supabase_migrations\.schema_migrations/);
  // The hosted source has 58 historic orphan actors. Only an explicitly
  // qualified recovery result is permissible until Auth/source drift is fixed.
  assert.match(file,/ISOLATED_RESTORE_WITH_DOCUMENTED_LEGACY_FK_EXCEPTION/);
  assert.match(file,/PINNED_LEGACY_FK_DRIFT_VERIFIED/);
  assert.match(file,/NOT con\.convalidated/);
  assert.doesNotMatch(file,/--disable-triggers|session_replication_role\s*=\s*replica|HRIS_DB_PASSWORD|aws-\d+-ap-northeast-2/);
});
