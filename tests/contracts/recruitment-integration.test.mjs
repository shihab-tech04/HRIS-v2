import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pipeline = readFileSync('src/live/RecruitmentPipeline.tsx', 'utf8');
const workspace = readFileSync('src/live/LiveSystemWorkspace.tsx', 'utf8');
const app = readFileSync('src/live/LiveApp.tsx', 'utf8');

test('recruiter reads require recruitment permission and the audited HRIS RPC', () => {
  assert.match(pipeline, /has_permission',\s*\{\s*p_permission_id:\s*'recruitment\.view'/);
  assert.match(pipeline, /has_permission',\s*\{\s*p_permission_id:\s*'recruitment\.manage'/);
  assert.match(pipeline, /if\s*\(!canView\s*&&\s*!canManage\)/);
  assert.match(pipeline, /rpc\('admin_get_recruitment_data'\)/);
  assert.doesNotMatch(pipeline, /\.from\(['"](?:job_applications|candidates|candidate_profiles)['"]\)/);
  assert.match(workspace, /selected\.id\s*===\s*'candidate'\s*\?\s*<RecruitmentPipeline/);
});

test('recruiter stage changes use the permission-checked audit RPC and supported stages', () => {
  assert.match(pipeline, /rpc\('admin_update_application_stage',\s*\{\s*p_application_id:\s*application\.id,\s*p_stage:\s*stage,\s*p_note:/);
  assert.match(pipeline, /'screening'/);
  assert.match(pipeline, /'shortlisted'/);
  assert.match(pipeline, /'final_review'/);
  assert.match(pipeline, /'rejected'/);
  assert.match(pipeline, /access\s*!==\s*'manage'\s*\|\|\s*!stage/);
  assert.match(pipeline, /Stage changes are checked and audited by HRIS/);
});

test('candidate CVs stay private and are opened through short-lived owner-scoped links', () => {
  assert.match(pipeline, /segments\[0\]\s*!==\s*owner/);
  assert.match(pipeline, /segment === '\.' \|\| segment === '\.\.'/);
  assert.match(pipeline, /from\('candidate-documents'\)\s*\.\s*createSignedUrl\(path,\s*60\)/);
  assert.doesNotMatch(pipeline, /getPublicUrl\(/);
  assert.match(pipeline, /target="_blank"\s+rel="noopener noreferrer"/);
});

test('recruitment-only workspace access is active-admin and Synesis scoped', () => {
  assert.match(app, /adminResult\.data\?\.active\s*===\s*true\s*&&\s*\n\s*permissions\.slice\(5\)/);
  assert.match(app, /eq\('slug','synesis-it'\)/);
  assert.match(app, /recruitmentAllowed\s*&&\s*tenants\.some\(t\s*=>\s*t\.id\s*===\s*tenantId\s*&&\s*t\.slug\s*===\s*'synesis-it'\)/);
  assert.match(app, /view\s*===\s*'admin'\s*&&\s*!canAdminSelectedTenant/);
  assert.match(app, /canUseSystemWorkspace\s*&&\s*<button onClick=\{\(\)\s*=>\s*setView\('system'\)\}/);
});
