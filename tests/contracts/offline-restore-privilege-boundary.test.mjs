import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const workflow = readFileSync(new URL('../../.github/workflows/hris-step1-offline-restore-proof.yml', import.meta.url), 'utf8');
test('isolation restore verifies disposable superuser without hosted credentials', () => {
  assert.match(workflow, /ISOLATED_SUPERUSER_VERIFIED/);
  assert.match(workflow, /current_setting\('is_superuser'\)='on'/);
  assert.match(workflow, /--username supabase_admin/);
  assert.match(workflow, /--host 127\.0\.0\.1 --port 55422/);
  assert.match(workflow, /--dbname hris_recovered_isolated/);
  assert.match(workflow, /--env PGPASSWORD=postgres/);
  assert.match(workflow, /pg_restore --host 127\.0\.0\.1/);
  assert.match(workflow, /HRIS_BACKUP_PASSPHRASE/);
  assert.doesNotMatch(workflow, /HRIS_DB_PASSWORD|aws-\d+-ap-northeast-2\.pooler|db\.xfuxnljfrgvusbrpvxpa/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
});
