import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../../supabase/migrations/20261016223226_employee_documents_tenant_read.sql');
const fixture = read('../sql/isolated-auth/fixture.sql');
const runner = read('../sql/isolated-auth/run-local.mjs');
const storageGuard = read('../../supabase/migrations/20261023130800_hris_private_storage_tenant_read_guard.sql');

test('employee document metadata uses linked employee and active tenant membership authorization', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION private\.hris_employee_document_own_read\(p_employee_id uuid\)/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION private\.hris_employee_document_manager_read\(p_employee_id uuid\)/);
  assert.match(migration, /public\.is_live_session\(\)/);
  assert.match(migration, /JOIN public\.tenant_memberships tm[\s\S]+?tm\.tenant_id = e\.tenant_id[\s\S]+?tm\.user_id = auth\.uid\(\)[\s\S]+?lower\(tm\.status\) = 'active'/);
  assert.match(migration, /JOIN public\.roles r[\s\S]+?r\.id = tm\.role[\s\S]+?r\.active IS TRUE/);
  assert.match(migration, /rp\.permission_id IN \('employees\.view', 'employees\.manage'\)/);
  assert.match(migration, /CREATE POLICY employee_documents_tenant_read_guard[\s\S]+?AS RESTRICTIVE[\s\S]+?private\.hris_employee_document_own_read\(employee_id\)[\s\S]+?private\.hris_employee_document_manager_read\(employee_id\)/);
  assert.match(migration, /DROP POLICY IF EXISTS employee_documents_admin_read/);
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\.employee_documents FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT SELECT ON TABLE public\.employee_documents TO authenticated/);
  assert.match(migration, /DROP POLICY IF EXISTS employee_documents_own_select ON storage\.objects/);
  assert.match(migration, /bucket_id IS DISTINCT FROM 'employee-documents'[\s\S]+?storage\.foldername\(name\)\)\[1\] = \(SELECT auth\.uid\(\)\)::text/);
  assert.doesNotMatch(migration, /ALTER TABLE public\.employee_documents ADD COLUMN[^;]*tenant_id/);
});

test('isolated acceptance seeds the legacy exposure and proves tenant, self, grant, anonymous, and storage boundaries', () => {
  assert.match(fixture, /CREATE POLICY employee_documents_admin_read[\s\S]+?public\.has_permission\('employees\.view'\)[\s\S]+?public\.has_permission\('employees\.manage'\)/);
  assert.match(fixture, /GRANT TRUNCATE, TRIGGER, REFERENCES ON public\.employee_documents TO authenticated/);
  assert.match(runner, /20261016223226_employee_documents_tenant_read\.sql/);
  assert.match(runner, /Employee-document managers and directory viewers read only documents in their active tenant/);
  assert.match(runner, /global roles alone grant no document access/);
  assert.match(runner, /authenticated_truncate/);
  assert.match(runner, /authenticated_trigger/);
  assert.match(runner, /authenticated_references/);
  assert.match(runner, /Anonymous clients cannot read employee-document metadata/);
  assert.match(storageGuard, /CREATE POLICY hris_private_storage_tenant_read_guard/);
  assert.match(storageGuard, /AS RESTRICTIVE FOR SELECT TO authenticated/);
  assert.match(storageGuard, /public\.has_tenant_permission\(e\.tenant_id,'employees\.view'\)/);
  assert.match(storageGuard, /d\.employee_id=e\.id AND d\.file_url=p_object_name/);
  assert.match(storageGuard, /c\.tenant_id=e\.tenant_id[\s\S]+?c\.evidence_path=p_object_name/);
  assert.match(storageGuard, /c\.user_id::text=split_part\(p_object_name,'\/',1\)/);
  assert.match(storageGuard, /REVOKE ALL ON FUNCTION private\.hris_storage_owner_tenant_read\(text,text\)/);
  assert.match(runner, /Private employee Storage permits own and authorized same-tenant manager downloads and signed URLs only/);
  assert.match(runner, /WS02 attendance evidence: actual sessions enforce owner, manager tenant and signed-link issuance/);
  assert.match(runner, /WS02 private candidate files: real Auth owners and same-tenant recruiters pass/);
});
