import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const restore = load('.github/workflows/hris-step1-offline-restore-proof.yml');
const source = load('.github/workflows/hris-current-main-source-backup.yml');
const database = load('.github/workflows/hris-ws05-fresh-backup-dispatch-20261025.yml');

test('isolated restore supports both pinned 135-migration and 137-migration Auth FK inventories', () => {
  assert.match(restore, /ns\.nspname='public'\) = 58 \+/);
  assert.match(restore, /WHERE version='20261109174000'/);
  assert.match(restore, /THEN 1 ELSE 0 END/);
  assert.match(restore, /service_request_status_history_actor_user_id_fkey/);
  assert.match(restore, /con\.confrelid='auth\.users'::regclass/);
  assert.match(restore, /con\.convalidated/);
  assert.match(restore, /AND NOT con\.convalidated\) = 17/);
  assert.match(restore, /PINNED_LEGACY_FK_DRIFT_VERIFIED/);
  assert.match(restore, /isolated PG17 restoration/);
});

test('restore correction changes no hosted SQL and refreshes protected exact-Main recovery', () => {
  assert.match(source, /branches: \[main\]/);
  assert.match(source, /- \.github\/workflows\/hris-step1-offline-restore-proof\.yml/);
  assert.match(source, /git bundle create/);
  assert.match(source, /bundle verify/);
  assert.match(database, /- \.github\/workflows\/hris-step1-offline-restore-proof\.yml/);
  assert.match(database, /hris-step1-encrypted-db-export\.yml/);
  assert.match(database, /hris-step1-offline-restore-proof\.yml/);
  assert.doesNotMatch(restore, /ALTER TABLE .*?DISABLE ROW LEVEL SECURITY|TRUNCATE public|DELETE FROM auth\.users/i);
});
