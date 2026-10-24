import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const original = readFileSync(new URL('../../supabase/migrations/20261013080630_hris_candidate_application_document.sql', import.meta.url), 'utf8');
const ported = readFileSync(new URL('../../supabase/migrations/20261024191001_hris_candidate_application_document_forward_port.sql', import.meta.url), 'utf8');

test('Candidate document migration preserves exact previously reviewed source body', () => {
  const marker = '-- Atomically register a candidate-owned, privately stored supporting document.';
  assert.equal(ported.slice(ported.indexOf(marker)), original);
  assert.match(ported, /SOURCE STAGING/);
  assert.match(ported, /20261013080630_hris_candidate_application_document\.sql/);
});

test('Candidate document RPC verifies live Auth and private storage ownership', () => {
  assert.match(ported, /CREATE OR REPLACE FUNCTION public\.candidate_add_application_document\(/);
  assert.match(ported, /IF NOT public\.is_live_session\(\)/);
  assert.match(ported, /WHERE user_id=auth\.uid\(\) AND profile_status='active'/);
  assert.match(ported, /split_part\(p_file_path,'\/',1\)<>auth\.uid\(\)::text/);
  assert.match(ported, /bucket_id='candidate-documents'/);
  assert.match(ported, /REVOKE ALL ON FUNCTION public\.candidate_add_application_document\(text,text,text,text\) FROM PUBLIC, anon/);
  assert.match(ported, /GRANT EXECUTE ON FUNCTION public\.candidate_add_application_document\(text,text,text,text\) TO authenticated, service_role/);
  assert.doesNotMatch(ported, /\b(?:DROP TABLE|TRUNCATE|ALTER ROLE|CREATE USER|ALTER POLICY|DISABLE ROW LEVEL SECURITY)\b/i);
});
