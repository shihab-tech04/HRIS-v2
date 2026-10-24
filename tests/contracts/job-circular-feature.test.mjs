import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manager = readFileSync(new URL('../../src/live/JobCircularManager.tsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../src/live/LiveSystemWorkspace.tsx', import.meta.url), 'utf8');
const candidate = readFileSync(new URL('../../../HRIS-Candidate-v2/src/lib/api.ts', import.meta.url), 'utf8');

test('job postings screen provides an authenticated HR job circular editor', () => {
  assert.match(workspace, /selected\.id === 'jobs' \? <JobCircularManager tenantId=\{tenantId\} refreshKey=\{revision\}/);
  assert.match(manager, /rpc\('has_tenant_permission',\s*\{/);
  assert.match(manager, /p_permission_id: 'recruitment\.manage'/);
  assert.match(manager, /canManage && <button type="button" onClick=\{openCreate\}/);
  assert.match(manager, /supabase\.rpc\('admin_save_job',\s*\{/);
  assert.match(manager, /p_id: editing\?\.id \|\| null, p_payload: payload/);
  assert.match(manager, /supabase\.rpc\('admin_set_job_published',\s*\{/);
  assert.match(manager, /p_job_id: job\.id, p_published: published/);
  assert.doesNotMatch(manager, /supabase\.from\('jobs'\)\.(insert|update|delete)\(/);
});

test('job circular changes preserve official linked identities and structured questions', () => {
  for (const field of ['department_id','location_id','team_id','designation_id','requisition_id',
    'screening_questions','workplace_type','employment_type','experience_level',
    'vacancy_count','min_experience_years','application_deadline',
    'skills','responsibilities','requirements','benefits','required_documents']) {
    assert.ok(manager.includes(field), 'missing approved SQL field: ' + field);
  }
  assert.match(manager, /screening_questions: editing\?\.screening_questions \|\| \[\]/);
  assert.match(manager, /team_id: editing\?\.team_id \|\| null/);
  assert.match(manager, /designation_id: editing\?\.designation_id \|\| null/);
  assert.match(manager, /requisition_id: editing\?\.requisition_id \|\| null/);
  assert.match(manager, /setRevision\(v => v \+ 1\)/);
});

test('publishing validates a deadline and salary, waits for authoritative RPC response', () => {
  assert.match(manager, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
  assert.match(manager, /draft\.salaryMin.*draft\.salaryMax/);
  assert.match(manager, /response\?\.success !== true \|\| response\.published !== published/);
  assert.match(manager, /setPublished\(job,!job\.is_published\)/);
  assert.match(manager, /encodeURIComponent\(job\.id\)/);
  assert.doesNotMatch(manager, /style=\{/);
});

test('public Candidate vacancy retrieval remains backed by published SQL view, never sample data in production', () => {
  assert.match(candidate, /supabase\.from\('candidate_published_jobs'\)\.select\('\*'\)/);
  assert.match(candidate, /\.eq\('status', 'published'\)/);
  assert.match(candidate, /\.eq\('is_published', true\)/);
  assert.match(candidate, /\.eq\('is_active', true\)/);
  assert.match(candidate, /if \(!DEMO_MODE\) throw new Error\('Unable to verify published vacancies/);
  assert.match(candidate, /published_salary_min: undefined, published_salary_max: undefined, salary_currency: undefined/);
});
