import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const profile = read('../../src/live/EmployeeProfileFigma.tsx');
const editor = read('../../src/live/EmployeeStructuredAddresses.tsx');
const migration = read('../../supabase/migrations/20261027040642_employee_profile_tenant_scoped_contract.sql');

test('E02 shows tenant-scoped structured addresses without hiding original scalar corrections', () => {
  assert.match(migration, /'addresses',coalesce/);
  assert.match(migration, /'road_block_house',a\.road_block_house/);
  assert.match(profile, /getStructuredAddresses\(currentTenant \? profile\?\.addresses : null\)/);
  assert.match(profile, /id: 'present-address'.*value: value\('address'\)/);
  assert.match(profile, /id: 'permanent-address'.*value: value\('mailing_address'\)/);
  assert.match(profile, /addressRows\.filter\(row => row\.address_type === 'Present'\)/);
  assert.match(profile, /addressRows\.filter\(row => row\.address_type === 'Permanent'\)/);
  assert.match(profile, /kind:'request-contact'/);
  assert.match(profile, /Array\.isArray\(profile\?\.addresses\).*setAddressEditorOpen\(true\)/s);
});

test('E02 address update uses only approved tenant-explicit RPC and preserves all record IDs', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.employee_save_my_addresses_v1\(\s*p_tenant_id uuid, p_rows jsonb/);
  assert.match(migration, /Existing addresses cannot be removed by saving the list/);
  assert.match(editor, /invalidSource = !Array\.isArray\(addresses\) \|\| records\.length !== addresses\.length/);
  assert.match(editor, /const next: AddressRow\[\] = records\.map\(item => \(\{ \.\.\.item \}\)\)/);
  assert.match(editor, /p_tenant_id: tenantId, p_rows: next/);
  assert.match(editor, /savedCount !== next\.length/);
  assert.match(editor, /readback\.tenant_id !== tenantId/);
  assert.match(editor, /confirmed\.length !== next\.length/);
  assert.doesNotMatch(editor, /\.from\(['"]employee_addresses['"]\)/);
  assert.doesNotMatch(editor, /supabase\.rpc\(['"]employee_get_my_addresses_v2/);
});

test('E02 addresses retain EN/BN, recovery, accessible form and keyboard controls', () => {
  assert.match(editor, /en: \{/);
  assert.match(editor, /bn: \{/);
  assert.match(editor, /role="dialog" aria-modal="true"/);
  assert.match(editor, /fieldset key=\{type\}/);
  assert.match(editor, /role="alert"/);
  assert.match(editor, /event\.key === 'Escape'/);
  assert.match(editor, /event\.key !== 'Tab'/);
  assert.match(editor, /disabled=\{busy \|\| invalidSource\}/);
  assert.match(profile, /setAddressEditorOpen\(false\)/);
});
