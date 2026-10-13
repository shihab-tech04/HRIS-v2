import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20261014120000_hris_tenant_payroll_register_read.sql', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../src/live/PayrollRegister.tsx', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../../src/live/LiveApp.tsx', import.meta.url), 'utf8');
const browser = readFileSync(new URL('../sql/isolated-auth/run-payroll-register-browser.mjs', import.meta.url), 'utf8');

test('payroll register RPC requires an active tenant payroll membership and returns only whitelisted read fields', () => {
  assert.match(migration, /FUNCTION public\.hris_get_tenant_payroll_register\([\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/);
  assert.match(migration, /public\.is_live_session\(\)/);
  assert.match(migration, /public\.has_tenant_permission\(p_tenant_id,'payroll\.view'\)/);
  assert.match(migration, /public\.has_tenant_permission\(p_tenant_id,'payroll\.manage'\)/);
  assert.match(migration, /p\.tenant_id=p_tenant_id/);
  assert.match(migration, /ILIKE[\s\S]*?employee_number/);
  assert.match(migration, /LIMIT p_limit OFFSET p_offset/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.hris_get_tenant_payroll_register[\s\S]*?FROM PUBLIC,anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.hris_get_tenant_payroll_register[\s\S]*?TO authenticated,service_role/);
  for (const excluded of ['bank_name', 'bank_account_no', 'tax_identification_no', "'note'"]) assert.doesNotMatch(migration, new RegExp(excluded));
  assert.doesNotMatch(migration, /\b(?:INSERT INTO|UPDATE public\.|DELETE FROM|CREATE POLICY|GRANT (?:INSERT|UPDATE|DELETE))/i);
});

test('payroll register UI is read-only, uses the tenant RPC, and has recovery, filters, pagination, and responsive rows', () => {
  assert.match(workspace, /supabase\.rpc\('hris_get_tenant_payroll_register'/);
  assert.match(workspace, /setDataTenantId\(requestedTenant\);\s*setError\(/);
  assert.match(workspace, /const tenantPending = dataTenantId !== tenantId/);
  assert.doesNotMatch(workspace, /\.from\(['"]payslips['"]\)/);
  for (const label of ['Payroll register', 'Search payroll employees', 'Filter payroll by pay period', 'Filter payroll by payslip status', 'Apply search', 'Clear filters', 'Retry', 'Refresh payroll register', 'Previous', 'Next', 'No payroll records yet']) {
    assert.ok(workspace.includes(label), `missing payroll register flow: ${label}`);
  }
  assert.match(workspace, /Read only/);
  assert.match(workspace, /md:hidden/);
  assert.match(workspace, /hidden overflow-x-auto rounded-xl/);
  assert.match(shell, /id: 'payroll-register', label: 'Payroll register'/);
  assert.match(shell, /page === 'payroll-register' && permissions\.payroll && <PayrollRegister/);
  assert.match(app, /'payroll\.view', 'payroll\.manage'/);
  assert.match(app, /payroll: grants\.get\('payroll\.view'\) === true \|\| grants\.get\('payroll\.manage'\) === true/);
  assert.match(app, /workspacePermissions\.payroll/);
});

test('local browser acceptance exercises the authenticated register at mobile and desktop widths', () => {
  assert.match(browser, /hris_get_tenant_payroll_register/);
  assert.match(browser, /Synthetic payroll register outage/);
  assert.match(browser, /Search payroll employees/);
  assert.match(browser, /Filter payroll by payslip status/);
  assert.match(browser, /375/);
  assert.match(browser, /1280/);
  assert.match(browser, /directPayslipReads/);
  assert.match(browser, /SYN-TAX-001/);
});
