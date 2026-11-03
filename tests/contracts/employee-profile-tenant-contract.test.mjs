import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../../supabase/migrations/20261027040642_employee_profile_tenant_scoped_contract.sql');
const runner = read('../sql/isolated-auth/run-local.mjs');
const fixture = read('../sql/isolated-auth/fixture.sql');
const parity = read('../sql/hosted-parity/check-read-only.sql');
const inventory = read('../sql/hosted-parity/frontends-admin-candidate-rpc-inventory.sql');
const certificatePolicyGuards = read('../../supabase/migrations/20261030114500_employee_profile_certificate_policy_guards.sql');

test('profile v1 exposes the approved scalar and record contracts with exact tenant-scoped RPCs', () => {
  for (const signature of [
    'employee_get_my_profile_v1(uuid)',
    'employee_delete_my_profile_record_v1(uuid,text,uuid)',
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
  assert.match(migration, /scalar corrections remain in employees\.address\/mailing_address/);
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
  assert.doesNotMatch(submit, /(?:INSERT INTO|UPDATE)\s+public\.employee_addresses/i);
  assert.doesNotMatch(review, /(?:INSERT INTO|UPDATE)\s+public\.employee_addresses/i);
  assert.doesNotMatch(projection, /employee_compensation|salary|taxable_income|tax_withheld/);
  assert.match(parity, /employee_submit_profile_change_request\(text,text,text\)/);
  assert.match(parity, /employee_get_my_profile\(\)/);
});

test('E02-05 structured employee addresses remain separate, tenant-scoped and non-destructive', () => {
  const projection = migration.match(/CREATE OR REPLACE FUNCTION public\.employee_get_my_profile_v1\([\s\S]*?\$function\$;/)?.[0] || '';
  const save = migration.match(/CREATE OR REPLACE FUNCTION public\.employee_save_my_addresses_v1\([\s\S]*?\$function\$;/)?.[0] || '';
  assert.match(projection, /'addresses',coalesce/);
  assert.match(projection, /FROM public\.employee_addresses a WHERE a\.employee_id=e\.id/);
  assert.match(save, /private\.hris_profile_own_employee\(p_tenant_id\)/);
  assert.match(save, /e\.id=v_employee AND e\.tenant_id=p_tenant_id FOR UPDATE/);
  assert.match(save, /'id','address_type','district','thana','post_code','city_village','road_block_house'/);
  assert.match(save, /WHERE a\.id=v_id AND a\.employee_id=v_employee FOR UPDATE/);
  assert.match(save, /Existing addresses cannot be removed by saving the list/);
  assert.match(save, /'employee\.profile\.addresses\.saved_v1'/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.employee_save_my_addresses_v1\(uuid,jsonb\)/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.employee_save_my_addresses_v1\(uuid,jsonb\)\s+TO authenticated/);
  assert.match(parity, /public\.employee_save_my_addresses_v1\(uuid,jsonb\)/);
  assert.match(fixture, /CREATE TABLE public\.employee_addresses/);
  assert.match(fixture, /ENABLE ROW LEVEL SECURITY/);
  assert.match(runner, /structuredAddressCrossTenant\.error\?\.code === '42501'/);
  assert.match(runner, /structuredAddressForeignRow\.error\?\.code === '42501'/);
  assert.match(runner, /structuredAddressOmission\.error\?\.code === '22023'/);
  assert.match(runner, /structuredAddressDirectWrite/);
});

test('original verification Tax Circle stays a tenant-scoped reviewed field', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS tax_circle text/);
  assert.match(migration, /'tax_circle',e\.tax_circle/);
  assert.match(migration, /WHEN 'tax_circle' THEN e\.tax_circle/);
  assert.match(migration, /tax_circle=CASE WHEN r\.field_key='tax_circle'/);
});

test('record save allowlists and certificate paths remain own-employee and tenant scoped', () => {
  const saveFunctions = [...migration.matchAll(/(CREATE OR REPLACE FUNCTION public\.employee_save_my_[a-z_]+_v1\([\s\S]*?\$function\$;)/g)]
    .filter(([, body]) => !body.includes('employee_save_my_addresses_v1'));
  assert.equal(saveFunctions.length, 6);
  for (const [, body] of saveFunctions) {
    assert.match(body, /private\.hris_profile_own_employee\(p_tenant_id\)/);
    assert.match(body, /jsonb_typeof\(p_payload\) IS DISTINCT FROM 'object'/);
    assert.match(body, /Unsupported .* fields/);
  }
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.employee_bank_details/);
  const bankSave = migration.match(/CREATE OR REPLACE FUNCTION public\.employee_save_my_bank_v1\([\s\S]*?\$function\$;/)?.[0] || '';
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
  assert.match(runner, /20261030114500_employee_profile_certificate_policy_guards\.sql/);
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

test('restrictive certificate guards close permissive-policy OR bypasses without replacing legacy document rules', () => {
  assert.match(certificatePolicyGuards, /employee_profile_certificate_select_namespace_guard[\s\S]+AS RESTRICTIVE[\s\S]+FOR SELECT/);
  assert.match(certificatePolicyGuards, /public\.has_tenant_permission\(split_part\(name,'\/',2\)::uuid,'employees\.view'\)/);
  assert.match(certificatePolicyGuards, /public\.has_tenant_permission\(split_part\(name,'\/',2\)::uuid,'employees\.manage'\)/);
  assert.match(certificatePolicyGuards, /employee_profile_certificate_insert_namespace_guard[\s\S]+AS RESTRICTIVE[\s\S]+FOR INSERT/);
  assert.match(certificatePolicyGuards, /employee_profile_certificate_update_namespace_guard[\s\S]+AS RESTRICTIVE[\s\S]+FOR UPDATE/);
  assert.match(certificatePolicyGuards, /employee_profile_certificate_delete_namespace_guard[\s\S]+AS RESTRICTIVE[\s\S]+FOR DELETE/);
  assert.equal((certificatePolicyGuards.match(/array_position\(storage\.foldername\(name\),'profile-certificates'\) IS NULL/g) || []).length, 5);
  assert.match(certificatePolicyGuards, /public\.hris_profile_change_active_member\(split_part\(name,'\/',2\)::uuid\)/);
  assert.match(certificatePolicyGuards, /private\.hris_profile_document_is_unlinked\(split_part\(name,'\/',2\)::uuid,name\)/);
  assert.doesNotMatch(certificatePolicyGuards, /DROP POLICY|CREATE POLICY employee_documents_own_(?:insert|update|delete)/);
  assert.match(fixture, /CREATE POLICY employee_documents_own_insert[\s\S]+?public\.employee_for_auth_user\(\)/);
  assert.match(fixture, /CREATE POLICY employee_documents_own_update[\s\S]+?CREATE POLICY employee_documents_own_delete/);
  assert.match(runner, /Existing non-profile employee-document owner upload, overwrite, and delete behavior is preserved/);
  assert.match(runner, /Profile certificate paths cannot bypass tenant\/format, overwrite, or linked-delete checks while orphan cleanup remains available/);
  assert.match(runner, /Profile certificate SELECT enforces the document tenant for authorized HR reviewers/);
  assert.match(parity, /employee_profile_certificate_select_namespace_guard/);
  assert.match(parity, /employee_profile_certificate_insert_namespace_guard/);
  assert.match(parity, /employee_profile_certificate_update_namespace_guard/);
  assert.match(parity, /employee_profile_certificate_delete_namespace_guard/);
});
