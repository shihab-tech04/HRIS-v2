import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../../.github/workflows/hris-release1-platform-access-sql-release.yml', import.meta.url), 'utf8');
const dispatcher = readFileSync(new URL('../../.github/workflows/hris-ws05-fresh-backup-dispatch-20261025.yml', import.meta.url), 'utf8');
const restore = readFileSync(new URL('../../.github/workflows/hris-step1-offline-restore-proof.yml', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/20261109035656_hris_admin_role_access_management.sql', import.meta.url), 'utf8');

test('Release 1 SQL writes require explicit approval and offsite recovery proof on protected Main', () => {
  assert.match(workflow, /workflow_dispatch:[\s\S]+?release_approved:[\s\S]+?default: false/);
  assert.match(workflow, /offsite_recovery_verified:[\s\S]+?default: false/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'[\s\S]+?inputs\.release_approved == true[\s\S]+?inputs\.offsite_recovery_verified == true/);
  assert.match(workflow, /SOURCE_BACKUP_RUN_ID/);
  assert.match(workflow, /DATABASE_BACKUP_RUN_ID/);
  assert.match(workflow, /RESTORE_RUN_ID/);
  assert.match(workflow, /OFFSITE_SOURCE_ARCHIVE_SHA256/);
  assert.match(workflow, /OFFSITE_DATABASE_ARCHIVE_SHA256/);
  assert.match(workflow, /SUPABASE_TELEMETRY_DISABLED: '1'/);
  assert.match(workflow, /c95db1790a3ca5afd164a85f2162a12ff723949823b4d8fda22ae2422d734098/);
});

test('Release 1 SQL deployment validates exact-run recovery, applies one migration, and proves unchanged identity rows', () => {
  for (const value of [
    'HRIS exact protected Main source history backup',
    'HRIS Step 1 - Encrypted database export',
    'HRIS Step 1 - Isolated PostgreSQL restore proof',
    'hris-restore-proof-',
    'backup_run_id=',
    'source_main_sha=',
    'head_sha',
    'head_branch',
    '135',
    '20261106090000|hris_new_workforce_account',
    '136',
    '20261109035656_hris_admin_role_access_management.sql',
    'public.admin_save_role(text,jsonb)',
    'public.admin_update_user_access(uuid,text,boolean)',
    'tenant_memberships_admin_directory_read',
    'public.tenant_memberships',
    'public.role_permissions',
    'public.admin_audit_logs',
  ]) assert.ok(workflow.includes(value), value);
  assert.match(workflow, /supabase db push --db-url .*--include-all --dry-run/);
  assert.match(workflow, /supabase --yes db push --db-url .*--include-all/);
  assert.doesNotMatch(workflow, /supabase functions deploy|deploy-pages\.yml|supabase link/);
  assert.match(restore, /restore_run_id=%s/);
  assert.match(restore, /backup_run_id=%s/);
  assert.match(restore, /hris-restore-proof-\$\{\{ github\.run_id \}\}/);
  assert.match(workflow, /sha256sum --check --status restore\.sha256/);
  assert.match(workflow, /sha256sum --check --status encrypted\.sha256/);
  assert.match(workflow, /Offsite source checksum does not match/);
  assert.match(workflow, /Offsite database checksum does not match/);
  assert.match(dispatcher, /hris-release1-platform-access-sql-release\.yml/);
  assert.match(migration, /has_tenant_permission\(v_tenant_id,'admin_users\.manage'\)/);
  assert.match(migration, /v_id !~ '\^\[a-z0-9\]\[a-z0-9_\]\{1,63\}\$'/);
  assert.match(migration, /cardinality\(v_permission_ids\)>500/);
  assert.doesNotMatch(migration, /effective_permissions_for_user/);
});
