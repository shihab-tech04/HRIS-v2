import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const file = readFileSync(new URL('../../.github/workflows/hris-step1-offline-restore-proof.yml', import.meta.url), 'utf8');

test('isolated recovery explicitly preserves historical audit references', () => {
  assert.match(file, /PINNED_LEGACY_FK_DRIFT_VERIFIED/);
  assert.match(file, /ISOLATED_RESTORE_WITH_DOCUMENTED_LEGACY_FK_EXCEPTION/);
  assert.match(file, /RECOVERY_EXCEPTION/);
  assert.match(file, /hris-legacy-audit-fk-postdata\.toc/);
  assert.match(file, /admin_audit_logs_actor_id_fkey/);
  assert.match(file, /NOT VALID/);
  assert.match(file, /NOT con\.convalidated/);
  assert.match(file, /supabase_migrations\.schema_migrations/);
  assert.match(file, /--host 127\.0\.0\.1 --port 55422/);
});
