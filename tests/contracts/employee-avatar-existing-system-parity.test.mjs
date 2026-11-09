import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../../supabase/migrations/20261109130637_hris_employee_avatar_existing_system_parity.sql');
const photo = read('../../src/live/EmployeeAvatarPhoto.tsx');
const profile = read('../../src/live/EmployeeProfileFigma.tsx');

test('legacy Change Photo keeps its verified Figma slot without altering existing profile editors', () => {
  assert.match(profile, /data-figma-node="66:72046"/);
  assert.match(profile, /<EmployeeAvatarPhoto tenantId=\{tenantId\} locale=\{locale\}/);
  assert.match(photo, /h-\[203px\] w-\[203px\]/);
  assert.match(photo, /role="img" aria-label=\{label\}/);
  assert.match(photo, /Change photo/);
  assert.match(photo, /ছবি পরিবর্তন/);
  assert.match(photo, /disabled=\{!enabled \|\| loading \|\| busy\}/);
  assert.match(profile, /employee_get_my_profile_v1/);
  assert.match(profile, /kind:'request-personal'/);
  assert.match(profile, /kind:'request-contact'/);
});

test('avatar SQL exposes only a signed-in employee own-tenant read/write contract', () => {
  assert.match(migration, /private\.hris_profile_own_employee\(p_tenant_id\)/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.employee_get_my_avatar_v1\(p_tenant_id uuid\)/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.employee_set_my_avatar_v1\(/);
  assert.match(migration, /p_expected_path text DEFAULT NULL/);
  assert.match(migration, /v_previous_path IS DISTINCT FROM nullif\(btrim\(p_expected_path\),''\)/);
  assert.match(migration, /WHERE e\.id=v_employee_id AND e\.tenant_id=p_tenant_id/);
  assert.match(migration, /o\.bucket_id='employee-avatars'/);
  assert.match(migration, /o\.owner_id=v_authenticated_user_id/);
  assert.match(migration, /o\.metadata->>'mimetype'/);
  assert.match(migration, /2097152/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.employee_set_my_avatar_v1\(uuid,text,text\)/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.employee_set_my_avatar_v1\(uuid,text,text\) TO authenticated/);
  assert.doesNotMatch(migration, /ALTER TABLE .*? DISABLE ROW LEVEL SECURITY/i);
  assert.doesNotMatch(migration, /\bUPDATE public\.employees\b[\s\S]{0,300}?(?:full_name|salary|bank_account|role_id)\s*=/i);
});

test('client checks file type, size, owner and tenant path and verifies persistence before success', () => {
  for (const marker of [
    "'employee-avatars'",
    'image/jpeg',
    'image/png',
    'MAX_BYTES',
    'UUID_IMAGE_NAME',
    'belongsToActiveEmployee(path, userId, tenantId)',
    "supabase.auth.getUser()",
    "supabase.rpc('employee_get_my_avatar_v1'",
    "supabase.rpc('employee_set_my_avatar_v1'",
    'p_tenant_id: tenantId',
    'p_expected_path: savedPath',
    'confirmed !== newPath',
    'setRevision(value => value + 1)',
    'URL.revokeObjectURL(objectUrl)',
  ]) assert.ok(photo.includes(marker), marker);
  assert.match(photo, /upsert: false/);
  assert.match(photo, /if \(!committed && newPath\)/);
  assert.doesNotMatch(photo, /\.from\('employees'\)/);
  assert.doesNotMatch(photo, /getPublicUrl|createSignedUrl/);
});
