import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../../src/live/MyPerformance.tsx', import.meta.url), 'utf8');
const managerPage = readFileSync(new URL('../../src/live/OrganizationPerformance.tsx', import.meta.url), 'utf8');
const liveApp = readFileSync(new URL('../../src/live/LiveApp.tsx', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/20261013011651_hris_performance_goal_self_progress_tenant_scope.sql', import.meta.url), 'utf8');
const browser = readFileSync(new URL('../browser/performance.spec.ts', import.meta.url), 'utf8');

test('personal performance page is mounted only for linked employees', () => {
  assert.match(app, /id: 'my-performance', label: 'My Performance'/);
  assert.match(app, /page === 'my-performance' && isEmployee && <MyPerformance tenantId=\{tenantId\} \/>/);
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
