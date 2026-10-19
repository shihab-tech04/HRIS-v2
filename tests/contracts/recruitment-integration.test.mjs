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

test('interviews and panel assessments persist through the live recruiter RPCs', () => {
  assert.match(pipeline, /rpc\('admin_schedule_interview',\s*\{\s*p_application_id:\s*application\.id,\s*p_payload:/);
  assert.match(pipeline, /rpc\('admin_assign_assessment',\s*\{\s*p_application_id:\s*application\.id,\s*p_payload:/);
  assert.match(pipeline, /rpc\('admin_review_assessment',\s*\{\s*p_assessment_id:\s*assessment\.id,\s*p_note:/);
  assert.match(pipeline, /access\s*!==\s*'manage'\s*\|\|\s*assessment\.status\s*!==\s*'submitted'/);
  assert.match(pipeline, /interviewDrafts\[application\.id\]/);
  assert.match(pipeline, /Assessment and panel review/);
  assert.match(pipeline, /Candidate submission:/);
  assert.match(pipeline, /Panel evaluation note/);
});

test('candidate CVs stay private and are opened through short-lived owner-scoped links', () => {
  assert.match(pipeline, /segments\[0\]\s*!==\s*owner/);
  assert.match(pipeline, /segment === '\.' \|\| segment === '\.\.'/);
  assert.match(pipeline, /from\('candidate-documents'\)\s*\.\s*createSignedUrl\(path,\s*60\)/);
  assert.doesNotMatch(pipeline, /getPublicUrl\(/);
  assert.match(pipeline, /target="_blank"\s+rel="noopener noreferrer"/);
});

test('recruitment and profile-review workspace access require active tenant membership and stay Synesis scoped', () => {
  assert.match(app, /adminResult\.data\?\.active\s*===\s*true\s*&&\s*\n\s*permissions\.slice\(5,\s*7\)/);
  assert.match(app, /const profileChangeReviewWorkspaceAllowed\s*=\s*adminResult\.data\?\.active\s*===\s*true/);
  assert.match(app, /const hasActiveSelectedTenantMembership = memberships\.some\(m => m\.tenant_id === tenantId && m\.status\.toLowerCase\(\) === 'active'\)/);
  assert.match(app, /const canAdminSelectedTenant = adminAllowed && hasActiveSelectedTenantMembership && isLegacySynesisTenant/);
  assert.match(app, /const canUseSystemWorkspace = hasActiveSelectedTenantMembership && \(canAdminSelectedTenant \|\| \(\(recruitmentAllowed \|\| profileChangeReviewAllowed\) && isLegacySynesisTenant\)\)/);
  assert.match(app, /const hasLegacyTenantMembership = Boolean\(legacyTenantId && mine\.some\(m => m\.tenant_id === legacyTenantId\)\)/);
  assert.match(app, /eq\('slug','synesis-it'\)/);
  assert.match(app, /view\s*===\s*'admin'\s*&&\s*!canAdminSelectedTenant/);
  assert.match(app, /canUseSystemWorkspace\s*&&\s*<button onClick=\{\(\)\s*=>\s*setView\('system'\)\}/);
});
