import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20261014110000_hris_employee_payslip_history.sql', import.meta.url), 'utf8');
const screen = readFileSync(new URL('../../src/live/MyPayslips.tsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
const browser = readFileSync(new URL('../sql/isolated-auth/run-payslips-browser.mjs', import.meta.url), 'utf8');

test('payslip RPC is a tenant-bound released-row whitelist with authenticated-only execution', () => {
  assert.match(migration, /FUNCTION public\.hris_get_my_payslips\(p_tenant_id uuid\)[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/);
  assert.match(migration, /public\.is_live_session\(\)/);
  assert.match(migration, /public\.hris_own_employee_for_tenant\(p_tenant_id\)/);
  assert.match(migration, /s\.tenant_id=p_tenant_id[\s\S]*?s\.employee_id=v_employee_id[\s\S]*?s\.status='released'/);
  assert.match(migration, /p\.tenant_id=s\.tenant_id AND p\.id=s\.pay_period_id/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.hris_get_my_payslips\(uuid\) FROM PUBLIC,anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.hris_get_my_payslips\(uuid\) TO authenticated,service_role/);
  for (const privateField of ['bank_name', 'bank_account_no', 'tax_identification_no', "'note'"]) {
    assert.doesNotMatch(migration, new RegExp(`['"]?${privateField.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]?\\s*,?`));
  }
});

test('employee screen calls only the RPC and supports loading, retry, refresh, empty state, and responsive breakdown', () => {
  assert.match(screen, /supabase\.rpc\('hris_get_my_payslips'/);
  assert.doesNotMatch(screen, /\.from\(['"]payslips['"]\)/);
  for (const expected of ['Loading your payslips', 'No released payslips yet', 'Retry', 'Refresh payslips', 'View earnings and deductions', 'Gross earnings', 'Total deductions', 'Net salary']) {
    assert.ok(screen.includes(expected), `missing payslip UI state or field: ${expected}`);
  }
  assert.match(screen, /requestSequence/);
  assert.match(screen, /data\.tenant_id !== requestedTenant/);
  assert.match(screen, /grid-cols-3 sm:grid-cols-3|sm:grid-cols-3/);
  assert.match(workspace, /id: 'my-payslips', label: 'My Payslips'/);
  assert.match(workspace, /page === 'my-payslips' && isEmployee && <MyPayslips tenantId=\{tenantId\} \/>/);
});

test('local browser journey covers outage retry, real released data, refresh, and mobile/desktop overflow', () => {
  assert.match(browser, /hris_get_my_payslips/);
  assert.match(browser, /503/);
  assert.match(browser, /375/);
  assert.match(browser, /1280/);
  assert.match(browser, /Refresh payslips/);
  assert.match(browser, /directPayslipTableReads/);
  assert.match(browser, /152,000/);
});
