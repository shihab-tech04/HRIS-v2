import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../../supabase/migrations/20261016223226_employee_documents_tenant_read.sql');
const fixture = read('../sql/isolated-auth/fixture.sql');
const runner = read('../sql/isolated-auth/run-local.mjs');

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
  assert.match(runner, /object reads stay owner-only until a tenant-safe storage path contract exists/);
});
