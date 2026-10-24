import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = path => fs.readFileSync(path, 'utf8');

test('employee referrals use tenant-scoped RPCs and keep resume objects private', () => {
  const sql = read('supabase/migrations/20261013175151_employee_referral_workflow.sql');
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.hris_get_employee_referral_workspace\(p_tenant_id uuid\)/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.hris_submit_employee_referral\(p_tenant_id uuid,p_payload jsonb\)/);
  assert.match(sql, /hris_own_employee_for_tenant\(p_tenant_id\)/);
  assert.match(sql, /has_tenant_permission\(p_tenant_id,'referrals\.view'\)/);
  assert.match(sql, /has_tenant_permission\(p_tenant_id,'referrals\.manage'\)/);
  assert.match(sql, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER\s+ON public\.employee_referrals FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /employee_referral_files_employee_insert[\s\S]+?CREATE POLICY employee_referral_files_scoped_read/);
  assert.match(sql, /employee_referral_files_scoped_read[\s\S]+?r\.tenant_id::text=\(storage\.foldername\(storage\.objects\.name\)\)\[2\]/);
  assert.match(sql, /employee_referral_files_employee_delete_unattached/);
  assert.match(sql, /storage\.foldername\(storage\.objects\.name\)/);
  assert.doesNotMatch(sql, /storage\.foldername\(t\.name\)/);
  assert.match(sql, /5242880/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.hris_submit_employee_referral\(uuid,jsonb\) FROM PUBLIC,anon/);
  assert.match(read('tests/sql/isolated-auth/fixture.sql'), /CREATE TABLE public\.departments \([\s\S]+?active boolean NOT NULL DEFAULT true/);
});

test('referral form and recruiter queue are connected to authenticated permissions and RPCs', () => {
  const app = read('src/live/LiveApp.tsx');
  const workspace = read('src/live/LiveHrisWorkspace.tsx');
  const ui = read('src/live/EmployeeReferrals.tsx');
  assert.match(app, /'referrals\.view', 'referrals\.manage'/);
  assert.match(app, /referralsManage: grants\.get\('referrals\.manage'\) === true/);
  assert.match(workspace, /page === 'referrals' && \(isEmployee \|\| permissions\.referrals\) && <EmployeeReferrals/);
  assert.match(workspace, /!permissions\.referrals\) items\.push\(\{ id: 'referrals', label: 'My Referrals'/);
  for (const label of ['Candidate Relationship', 'LinkedIn/Portfolio URL', 'Job Opening', 'Preferred Department', 'Upload Your Resume/CV']) {
    assert.ok(ui.includes(label), `Referral form is missing ${label}`);
  }
  assert.match(ui, /rpc\('hris_submit_employee_referral'/);
  assert.match(ui, /rpc\('hris_get_employee_referral_workspace'/);
  assert.match(ui, /rpc\('hris_mark_employee_referral_in_review'/);
  assert.match(ui, /createSignedUrl\(selected\.resume_storage_path/);
});

test('isolated acceptance covers cross-tenant denial and actual private file downloads', () => {
  const runner = read('tests/sql/isolated-auth/run-local.mjs');
  const browser = read('tests/sql/isolated-auth/run-employee-referrals-browser.mjs');
  assert.match(runner, /referralCrossTenant\.error\?\.code === '42501'/);
  assert.match(runner, /tenantBResumeDownload\.error/);
  assert.match(runner, /ownerResumeDownload\.error/);
  assert.match(runner, /recruiterResumeDownload\.error/);
  assert.match(runner, /employeeCannotReviewReferral\.error\?\.code === '42501'/);
  assert.match(runner, /referralReviewDuplicate\.error\?\.code === 'P0002'/);
  assert.match(browser, /375px mobile and 1280px desktop/);
  assert.match(browser, /Synthetic browser resume/);
  assert.match(browser, /Mark in review/);
});
