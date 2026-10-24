import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manager = readFileSync(new URL('../../src/live/JobCircularManager.tsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../src/live/LiveSystemWorkspace.tsx', import.meta.url), 'utf8');
const live = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
const locale = readFileSync(new URL('../../src/live/project-locale.ts', import.meta.url), 'utf8');
const candidate = readFileSync(new URL('../../../HRIS-Candidate-v2/src/lib/api.ts', import.meta.url), 'utf8');

test('job postings screen provides an authenticated HR job circular editor', () => {
  assert.match(workspace, /selected\.id === 'jobs' \? <JobCircularManager tenantId=\{tenantId\} refreshKey=\{revision\}/);
  assert.match(live, /id: 'job-circulars', label: 'Job circulars'/);
  assert.match(live, /page === 'job-circulars' && permissions\.recruitmentManage && <JobCircularManager tenantId=\{tenantId\}/);
  assert.match(locale, /'Job circulars': 'চাকরির বিজ্ঞপ্তি'/);
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
  assert.match(manager, /screening_questions: editing\?\.is_published/);
  assert.match(manager, /\? editing\.screening_questions/);
  assert.match(manager, /: screeningQuestions\.map\(question =>/);
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


test('screening editor matches hosted SQL and Candidate question contracts', () => {
  for (const type of ['short_text','long_text','number','yes_no','single_select','multi_select','date']) {
    assert.ok(manager.includes("'" + type + "'"), 'missing supported SQL answer kind: ' + type);
  }
  assert.match(manager, /function validateQuestions\(questions: ScreeningQuestion\[\]\)/);
  assert.match(manager, /needsOptions\(question\.type\)/);
  assert.match(manager, /questionText: question\.questionText\.trim\(\)/);
  assert.match(manager, /id: crypto\.randomUUID\(\)/);
  assert.match(manager, /setScreeningQuestions\(restoreQuestions\(job\.screening_questions \|\| \[\]\)\)/);
  assert.match(manager, /disabled=\{saving \|\| Boolean\(editing\?\.is_published\)\}/);
  assert.match(manager, /screening_questions: editing\?\.is_published/);
  assert.match(candidate, /question: String\(q\.questionText \|\| q\.question \|\| ''\)/);
  assert.match(candidate, /options: Array\.isArray\(q\.options\)/);
});

test('screening editor translates active EN/BN UI, preserving Candidate public-only gate', () => {
  assert.match(live, /<JobCircularManager tenantId=\{tenantId\} refreshKey=\{0\} locale=\{locale\}/);
  for (const word of ['Application screening questions', 'Add question', 'Question text *',
    'Answer type', 'Answer options (one per line) *', 'Required answer', 'Remove question']) {
    assert.ok(locale.includes("'" + word + "':"), 'missing Bengali translation: ' + word);
  }
  assert.match(manager, /projectText\(locale, english\)/);
  assert.doesNotMatch(manager, /style=\{/);
});
