import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../../src/live/MyPerformance.tsx', import.meta.url), 'utf8');
const managerPage = readFileSync(new URL('../../src/live/OrganizationPerformance.tsx', import.meta.url), 'utf8');
const liveApp = readFileSync(new URL('../../src/live/LiveApp.tsx', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/20261013011651_hris_performance_goal_self_progress_tenant_scope.sql', import.meta.url), 'utf8');
const appraisalMigration = readFileSync(new URL('../../supabase/migrations/20261013023141_hris_performance_appraisal_membership_read.sql', import.meta.url), 'utf8');
const appraisalWorkflowMigration = readFileSync(new URL('../../supabase/migrations/20261013124000_hris_appraisal_narrative_workflow.sql', import.meta.url), 'utf8');
const browser = readFileSync(new URL('../browser/performance.spec.ts', import.meta.url), 'utf8');
const managerBrowser = readFileSync(new URL('../browser/manager-performance.spec.ts', import.meta.url), 'utf8');

test('personal performance page is mounted only for linked employees', () => {
  assert.match(app, /id: 'my-performance', label: 'My Performance'/);
  assert.match(app, /page === 'my-performance' && isEmployee && <MyPerformance tenantId=\{tenantId\} userId=\{userId\} locale=\{locale\} \/>/);
});

test('employee performance reads are tenant-filtered and use explicit columns', () => {
  assert.match(page, /\.select\('id,title,description,category,target_metric,current_progress,due_date,status,weight,origin'\)/);
  assert.match(page, /\.eq\('tenant_id', requestTenantId\)/);
  assert.match(page, /\.limit\(100\)/);
});

test('employee progress writes change only the bounded progress field', () => {
  assert.match(page, /\.update\(\{ current_progress: progress \}\)/);
  assert.match(page, /progress < 0 \|\| progress > 100/);
  assert.match(migration, /REVOKE UPDATE ON TABLE public\.performance_goals FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT UPDATE \(current_progress\) ON TABLE public\.performance_goals TO authenticated/);
});

test('employee goal updates require an active tenant-linked employee row', () => {
  assert.match(migration, /employee_id = public\.hris_own_employee_for_tenant\(tenant_id\)/);
  assert.match(migration, /AS RESTRICTIVE FOR UPDATE TO authenticated/);
  assert.match(migration, /WITH CHECK \([\s\S]*hris_own_employee_for_tenant\(tenant_id\) IS NOT NULL/);
});

test('browser journey checks progress save, tenant filter, and narrow viewport', () => {
  assert.match(browser, /Progress saved/);
  assert.match(browser, /eq\.\$\{tenantId\}/);
  assert.match(browser, /width: 375/);
});

test('organization performance is permission-gated and reads only tenant-visible goals', () => {
  assert.match(liveApp, /'performance\.view', 'performance\.manage'/);
  assert.match(liveApp, /performance: grants\.get\('performance\.view'\) === true \|\| grants\.get\('performance\.manage'\) === true/);
  assert.match(managerPage, /\.from\('performance_cycles'\)[\s\S]*?\.eq\('tenant_id', requestTenantId\)/);
  assert.match(managerPage, /\.select\('id,employee_id,cycle_id,title,description,category,target_metric,current_progress,due_date,status,weight,origin'\)/);
  assert.match(managerPage, /\.from\('performance_goals'\)[\s\S]*?\.eq\('tenant_id', requestTenantId\)/);
  assert.match(managerPage, /\.from\('employees'\)[\s\S]*?\.eq\('tenant_id', requestTenantId\)/);
  assert.match(managerPage, /Filter organization performance by review cycle/);
  assert.match(managerPage, /manager_review_deadline/);
  assert.doesNotMatch(managerPage, /\.(?:insert|update|delete)\(/);
});

test('appraisal pages use the scoped narrative RPC while organization status reads omit score and feedback fields', () => {
  assert.match(page, /\.rpc\('hris_get_my_appraisal_work', \{ p_tenant_id: requestTenantId \}\)/);
  assert.match(page, /hris_save_my_appraisal_self_comment/);
  assert.match(page, /hris_save_assigned_appraisal_review/);
  assert.doesNotMatch(page, /\.from\('performance_appraisals'\)/);
  assert.match(managerPage, /\.from\('performance_appraisals'\)[\s\S]*?\.eq\('tenant_id', requestTenantId\)/);
  assert.match(appraisalMigration, /reviewer_employee_id = public\.hris_own_employee_for_tenant\(tenant_id\)[\s\S]*?hris_is_active_tenant_member\(tenant_id\)/);
  assert.match(appraisalMigration, /GRANT SELECT \([\s\S]*?reviewer_employee_id, status, created_at, updated_at[\s\S]*?\) ON TABLE public\.performance_appraisals TO authenticated/);
  assert.match(appraisalMigration, /REVOKE SELECT ON TABLE public\.performance_appraisals FROM PUBLIC, anon, authenticated/);
  assert.match(appraisalMigration, /CREATE POLICY hris_performance_cycles_membership_guard/);
  assert.doesNotMatch(page, /manager_scores|final_rating|final_feedback/);
  assert.match(appraisalWorkflowMigration, /CREATE OR REPLACE FUNCTION public\.hris_get_my_appraisal_work/);
  assert.match(appraisalWorkflowMigration, /a\.reviewer_employee_id=v_employee_id AND a\.status='submitted_by_employee'/);
  assert.match(appraisalWorkflowMigration, /a\.employee_id=v_employee_id AND a\.status='draft'/);
  assert.match(appraisalWorkflowMigration, /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.performance_appraisals FROM PUBLIC, anon, authenticated/);
  assert.match(appraisalWorkflowMigration, /GRANT EXECUTE ON FUNCTION public\.hris_save_assigned_appraisal_review[^;]* TO authenticated, service_role/);
  assert.doesNotMatch(appraisalWorkflowMigration, /manager_scores\s*=|manager_rating\s*=|final_rating\s*=|final_feedback\s*=/);
  assert.match(browser, /Submit self review/);
});

test('organization performance CSV export follows visible filters and excludes appraisal scores and feedback', () => {
  assert.match(managerPage, /import \{ downloadCsv \} from '\.\/csv'/);
  assert.match(managerPage, /visibleGoals\.map/);
  assert.match(managerPage, /visibleAppraisals\.map/);
  assert.match(managerPage, /'Record type', 'Employee name', 'Employee number', 'Review cycle'/);
  assert.doesNotMatch(managerPage, /manager_scores|final_rating|final_feedback/);
  assert.match(managerBrowser, /Export CSV/);
  assert.match(managerBrowser, /Publish team handbook/);
});

test('organization appraisal status filter uses only statuses returned for the tenant', () => {
  assert.match(managerPage, /appraisal\.status !== appraisalFilter/);
  assert.match(managerPage, /appraisals\.map\(appraisal => appraisal\.status\)/);
  assert.match(managerPage, /Filter appraisal reviews by status/);
  assert.match(managerBrowser, /submitted_by_employee/);
  assert.match(managerBrowser, /selectOption\('draft'\)/);
});
