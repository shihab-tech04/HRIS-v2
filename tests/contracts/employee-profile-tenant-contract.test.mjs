import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../../supabase/migrations/20261027040642_employee_profile_tenant_scoped_contract.sql');
const runner = read('../sql/isolated-auth/run-local.mjs');
const fixture = read('../sql/isolated-auth/fixture.sql');
const parity = read('../sql/hosted-parity/check-read-only.sql');
const inventory = read('../sql/hosted-parity/frontends-admin-candidate-rpc-inventory.sql');

test('profile v1 exposes the approved scalar and record contracts with exact tenant-scoped RPCs', () => {
  for (const signature of [
    'employee_get_my_profile_v1(uuid)',
    'employee_save_my_education_v1(uuid,jsonb)',
    'employee_save_my_experience_v1(uuid,jsonb)',
    'employee_save_my_family_member_v1(uuid,jsonb)',
    'employee_save_my_bank_v1(uuid,jsonb)',
    'employee_save_my_training_v1(uuid,jsonb)',
    'employee_save_my_certification_v1(uuid,jsonb)',
  ]) {
    assert.ok(migration.includes(`FUNCTION public.${signature}`), `${signature} is missing from the migration`);
    assert.ok(parity.includes(`public.${signature}`), `${signature} is missing from hosted parity`);
    assert.ok(inventory.includes(`'${signature.split('(')[0]}'`), `${signature} is missing from the frontend inventory`);
  }
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.employee_get_my_profile_v1\(uuid\) TO authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.employee_save_my_bank_v1\(uuid,jsonb\) TO authenticated/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.employee_save_my_bank_v1\(uuid,jsonb\) FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(migration, /private\.hris_profile_own_employee\(p_tenant_id\)/);
  assert.match(migration, /public\.hris_profile_change_active_member\(p_tenant_id\)/);
  assert.match(migration, /e\.id=v_employee AND e\.tenant_id=p_tenant_id/);
});

test('scalar profile corrections retain HR approval and use the employee scalar address source', () => {
  const submit = migration.match(/CREATE OR REPLACE FUNCTION public\.employee_submit_profile_change_request\([\s\S]*?\$function\$;/)?.[0] || '';
  const review = migration.match(/CREATE OR REPLACE FUNCTION public\.admin_review_profile_change_request\([\s\S]*?\$function\$;/)?.[0] || '';
  const projection = migration.match(/CREATE OR REPLACE FUNCTION public\.employee_get_my_profile_v1\([\s\S]*?\$function\$;/)?.[0] || '';
  assert.match(migration, /current profile address fields map to employees\.address\/mailing_address/);
  assert.match(submit, /INSERT INTO public\.employee_profile_change_requests/);
  assert.match(review, /public\.has_tenant_permission\(p_tenant_id,'self_service\.manage'\)/);
  assert.match(review, /r\.requested_by IS NOT DISTINCT FROM auth\.uid\(\)/,
    'a reviewer must not approve or reject a change they requested themselves');
  assert.match(review, /RAISE EXCEPTION 'Reviewers cannot decide their own profile change requests\.' USING errcode='42501'/);
  assert.match(review, /UPDATE public\.employees e SET/);
  assert.match(review, /WHERE e\.id=r\.employee_id AND e\.tenant_id=p_tenant_id/);
  assert.match(review, /address=CASE WHEN r\.field_key='address' THEN r\.requested_value ELSE e\.address END/);
  assert.match(review, /mailing_address=CASE WHEN r\.field_key='mailing_address' THEN r\.requested_value ELSE e\.mailing_address END/);
  assert.match(projection, /'address',e\.address,'mailing_address',e\.mailing_address/);
  assert.doesNotMatch(migration, /(?:INSERT INTO|UPDATE)\s+public\.employee_addresses/i);
  assert.doesNotMatch(projection, /employee_compensation|salary|tax/);
  assert.match(parity, /employee_submit_profile_change_request\(text,text,text\)/);
  assert.match(parity, /employee_get_my_profile\(\)/);
});

test('original verification Tax Circle stays a tenant-scoped reviewed field', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS tax_circle text/);
  assert.match(migration, /'tax_circle',e\.tax_circle/);
  assert.match(migration, /WHEN 'tax_circle' THEN e\.tax_circle/);
  assert.match(migration, /tax_circle=CASE WHEN r\.field_key='tax_circle'/);
});

test('record save allowlists and certificate paths remain own-employee and tenant scoped', () => {
  const saveFunctions = [...migration.matchAll(/(CREATE OR REPLACE FUNCTION public\.employee_save_my_[a-z_]+_v1\([\s\S]*?\$function\$;)/g)];
  assert.equal(saveFunctions.length, 6);
  for (const [, body] of saveFunctions) {
    assert.match(body, /private\.hris_profile_own_employee\(p_tenant_id\)/);
    assert.match(body, /jsonb_typeof\(p_payload\) IS DISTINCT FROM 'object'/);
    assert.match(body, /Unsupported .* fields/);
  }
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.employee_bank_details/);
  const bankSave = migration.match(/CREATE OR REPLACE FUNCTION public\.employee_save_my_bank_v1\([\s\S]*?\$function\$;/)?.[0] || '';
  assert.match(bankSave, /'bank_name','account_number','branch_name','routing_number'/);
  assert.match(bankSave, /'bank_name','account_name','account_number','branch_name','routing_number'/);
  assert.match(bankSave, /v_account_name/);
  assert.match(migration, /e\.bank_account_name/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\.employee_bank_details FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(migration, /split_part\(name,'\/',1\)=\(SELECT auth\.uid\(\)\)::text/);
  assert.match(migration, /split_part\(name,'\/',2\)::uuid/);
  assert.match(migration, /VALUES\(pg_catalog\.gen_random_uuid\(\),v_employee,'Training certificate[^\n]*'certificate',v_path,'pending'\)/);
  assert.match(migration, /VALUES\(pg_catalog\.gen_random_uuid\(\),v_employee,'Certification[^\n]*'certificate',v_path,v_end,'pending'\)/);
  assert.match(parity, /employee_profile_certificate_insert/);
  assert.match(parity, /employee_profile_certificate_orphan_delete/);
  assert.match(parity, /private_bucket', 'employee-documents'/);
  assert.match(migration, /UPDATE public\.employee_documents SET name='Certification — '\|\|v_title,expires_at=v_end/);
});

test('disposable Auth/RLS journey covers valid, invalid, cross-tenant, unlinked, and direct-write cases', () => {
  assert.match(runner, /20261027040642_employee_profile_tenant_scoped_contract\.sql/);
  assert.match(runner, /profileCrossTenantEducation/);
  assert.match(runner, /profileRoleWithoutEmployeeWrite/);
  assert.match(runner, /invalidTraining\.error\?\.code === '22023'/);
  assert.match(runner, /profileCertificateForeignDownload/);
  assert.match(runner, /retiredProfileRpcExecute\.bank_update === true/);
  assert.match(runner, /employee profile.*bank details|employee-owned records/i);
  assert.match(fixture, /CREATE TABLE public\.employee_education/);
  assert.match(fixture, /CREATE TABLE public\.employee_experience/);
  assert.match(parity, /protected_table', 'public\.employee_bank_details'/);
  assert.match(parity, /revoked_procedures\(signature, source\)/);
});
