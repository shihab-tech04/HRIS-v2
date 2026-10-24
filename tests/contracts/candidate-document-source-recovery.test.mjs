import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../../supabase/migrations/20261018120000_candidate_requested_document_source_recovery.sql', import.meta.url), 'utf8');
const candidateClient = readFileSync(new URL('../../../HRIS-Candidate-v2/src/lib/api.ts', import.meta.url), 'utf8');

test('Phase 06 restores the hosted 2026-10-18 Candidate requested-document API contract without creating a new live endpoint', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.candidate_submit_requested_document\(\s*p_request_id uuid, p_file_name text, p_file_path text/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /SET search_path TO 'pg_catalog', 'public', 'auth', 'storage'/);
  assert.match(sql, /public\.is_live_session\(\)/);
  assert.match(sql, /split_part\(p_file_path,'\/',1\)<>auth\.uid\(\)::text/);
  assert.match(sql, /storage\.objects[\s\S]*bucket_id='candidate-documents' AND name=p_file_path/);
  assert.match(sql, /UPDATE public\.candidate_document_requests dr[\s\S]*a\.candidate_user_id=auth\.uid\(\)[\s\S]*dr\.status='pending'[\s\S]*dr\.due_date>=current_date/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.candidate_submit_requested_document\(uuid,text,text\)[\s\S]*FROM PUBLIC, anon/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.candidate_submit_requested_document\(uuid,text,text\)[\s\S]*TO authenticated/);
  assert.doesNotMatch(sql, /GRANT\s+EXECUTE[\s\S]*TO\s+anon|GRANT\s+(?:INSERT|UPDATE|DELETE)\s+ON\s+TABLE\s+storage\.objects/i);
  assert.match(candidateClient, /rpc\('candidate_submit_requested_document',\s*\{\s*p_request_id: requestId, p_file_name: file\.name, p_file_path: path/);
  assert.match(candidateClient, /storage\.from\('candidate-documents'\)/);
});
