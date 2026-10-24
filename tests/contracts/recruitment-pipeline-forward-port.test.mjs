import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const original = readFileSync(new URL('../../supabase/migrations/20261013130829_hris_recruitment_pipeline_read.sql', import.meta.url), 'utf8');
const ported = readFileSync(new URL('../../supabase/migrations/20261024210001_hris_recruitment_pipeline_forward_port.sql', import.meta.url), 'utf8');
const acceptance = readFileSync(new URL('../sql/isolated-auth/hris-release-rpc-acceptance.mjs', import.meta.url), 'utf8');

test('recruitment pipeline forward port preserves canonical SQL byte-for-byte', () => {
  const marker = '-- Tenant-authorized, read-only recruiter queue.';
  assert.equal(ported.slice(ported.indexOf(marker)), original);
  assert.match(ported, /Replacement HRIS project xfuxnljfrgvusbrpvxpa only/);
  assert.match(ported, /without fabricating a historical ledger row/);
});

test('recruitment pipeline contract is tenant-guarded and private', () => {
  assert.match(ported, /CREATE OR REPLACE FUNCTION public\.hris_get_recruitment_pipeline\(/);
  assert.match(ported, /public\.is_live_session\(\)/);
  assert.match(ported, /public\.hris_admin_can_read_tenant\(p_tenant_id, 'recruitment\.view'\)/);
  assert.match(ported, /public\.hris_admin_can_read_tenant\(p_tenant_id, 'recruitment\.manage'\)/);
  assert.match(ported, /SECURITY DEFINER SET search_path = ''/);
  assert.match(ported, /REVOKE ALL ON FUNCTION public\.hris_get_recruitment_pipeline\(uuid,text,text,integer,integer\) FROM PUBLIC,anon/);
  assert.match(ported, /GRANT EXECUTE ON FUNCTION public\.hris_get_recruitment_pipeline\(uuid,text,text,integer,integer\) TO authenticated,service_role/);
  assert.doesNotMatch(ported, /\b(?:DROP TABLE|TRUNCATE|ALTER ROLE|CREATE USER|DISABLE ROW LEVEL SECURITY)\b/i);
});

test('release acceptance applies forward ports in order and exercises recruitment tenant boundaries', () => {
  const documentPort = acceptance.indexOf("applySql('supabase/migrations/20261024191001_hris_candidate_application_document_forward_port.sql')");
  const preboardingPort = acceptance.indexOf("applySql('supabase/migrations/20261024200001_hris_preboarding_missing_rpcs_forward_port.sql')");
  const recruitmentPort = acceptance.indexOf("applySql('supabase/migrations/20261024210001_hris_recruitment_pipeline_forward_port.sql')");
  assert.ok(documentPort >= 0 && documentPort < preboardingPort && preboardingPort < recruitmentPort);
  assert.match(acceptance, /clients\.recruiterA\.rpc\('hris_get_recruitment_pipeline'/);
  assert.match(acceptance, /clients\.recruiterB\.rpc\('hris_get_recruitment_pipeline'/);
  assert.match(acceptance, /anon\.rpc\('hris_get_recruitment_pipeline'/);
  assert.match(acceptance, /Candidate offer acceptance and history/);
});
