import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const userId = 'e7333333-3333-4333-8333-333333333333';
const tenantId = 'e7444444-4444-4444-8444-444444444444';
const approvedRequisitionId = 'e7777777-7777-4777-8777-777777777777';
const rejectedRequisitionId = 'e8888888-8888-4888-8888-888888888888';
const savedJobId = 'e9999999-9999-4999-8999-999999999999';
const user = {
  id: userId, aud: 'authenticated', role: 'authenticated',
  email: 'synthetic-hr@example.test',
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
};
const jwtHeader = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })).toString('base64url');
const jwtPayload = Buffer.from(JSON.stringify({ sub: userId, aud: 'authenticated', role: 'authenticated',
  email: user.email, iss: 'https://synthetic.supabase.test/auth/v1',
  exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
const jwt = [jwtHeader, jwtPayload, 'synthetic-signature'].join('.');

type SyntheticRequisition = {
  id: string;
  tenant_id: string;
  reference_number: string;
  title: string;
  department_id: string | null;
  designation_id: string | null;
  employment_type: string;
  project_name: string | null;
  required_positions: number;
  desired_joining_date: string | null;
  years_experience: number | null;
  education_qualifications: string | null;
  certifications: string | null;
  job_description: string | null;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
};

type SyntheticState = {
  requisitions: SyntheticRequisition[];
  saveRequisitionCalls: Array<Record<string, unknown>>;
  resolveCalls: Array<Record<string, unknown>>;
  saveJobCalls: Array<Record<string, unknown>>;
  approvedReadFails: boolean;
  directTableWrites: string[];
};

async function installSyntheticTenant(page: Page, state: SyntheticState) {
  await page.route('**/auth/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/token')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        access_token: jwt, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600, user,
      }) });
      return;
    }
    if (path.endsWith('/user')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
      return;
    }
    await route.fulfill({ status: 400, contentType: 'application/json', body: '{}' });
  });

  await page.route('**/rest/v1/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const endpoint = url.pathname.split('/').pop() || '';

    if (url.pathname.includes('/rpc/')) {
      if (endpoint === 'has_tenant_permission') {
        const args = request.postDataJSON() as { p_tenant_id?: string; p_permission_id?: string };
        expect(args.p_tenant_id).toBe(tenantId);
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(
          args.p_permission_id === 'recruitment.manage' || args.p_permission_id === 'recruitment.view',
        ) });
        return;
      }
      if (endpoint === 'has_permission') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: 'false' });
        return;
      }
      if (endpoint === 'admin_save_requisition') {
        const args = request.postDataJSON() as Record<string, unknown>;
        state.saveRequisitionCalls.push(args);
        const payload = args.p_payload as Record<string, unknown>;
        const id = state.saveRequisitionCalls.length === 1 ? approvedRequisitionId : rejectedRequisitionId;
        state.requisitions.push({
          id, tenant_id: tenantId, reference_number: `SYN-REQ-${state.saveRequisitionCalls.length}`,
          title: String(payload.title), department_id: null, designation_id: null,
          employment_type: String(payload.employment_type), project_name: payload.project_name as string | null,
          required_positions: Number(payload.required_positions), desired_joining_date: payload.desired_joining_date as string | null,
          years_experience: payload.years_experience as number | null,
          education_qualifications: payload.education_qualifications as string | null,
          certifications: payload.certifications as string | null, job_description: payload.job_description as string | null,
          reason: payload.reason as string | null, status: 'pending', requested_at: new Date().toISOString(),
          resolved_at: null, resolution_note: null,
        });
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(id) });
        return;
      }
      if (endpoint === 'admin_resolve_requisition') {
        const args = request.postDataJSON() as Record<string, unknown>;
        state.resolveCalls.push(args);
        const requestRow = state.requisitions.find(row => row.id === args.p_id && row.tenant_id === tenantId && row.status === 'pending');
        if (!requestRow) {
          await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: 'Not found or already resolved.' }) });
          return;
        }
        requestRow.status = args.p_decision as 'approved' | 'rejected';
        requestRow.resolution_note = args.p_note as string | null;
        requestRow.resolved_at = new Date().toISOString();
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          success: true, decision: args.p_decision, requisition_id: requestRow.id,
        }) });
        return;
      }
      if (endpoint === 'admin_save_job') {
        const args = request.postDataJSON() as Record<string, unknown>;
        state.saveJobCalls.push(args);
        const payload = args.p_payload as Record<string, unknown>;
        const linked = state.requisitions.find(row => row.id === payload.requisition_id
          && row.tenant_id === tenantId && row.status === 'approved');
        if (payload.requisition_id && !linked) {
          await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: 'Requisition must be approved for this organization.' }) });
          return;
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(savedJobId) });
        return;
      }
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: `Unexpected RPC ${endpoint}` }) });
      return;
    }

    if (request.method() === 'HEAD') {
      await route.fulfill({ status: 200, headers: { 'content-range': '0-0/0' }, body: '' });
      return;
    }
    if (request.method() !== 'GET') {
      state.directTableWrites.push(`${request.method()} ${url.pathname}`);
      await route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic fixture allows RPC writes only.' }) });
      return;
    }

    let data: unknown = [];
    if (endpoint === 'admin_users') data = { active: true, is_super_admin: false };
    else if (endpoint === 'tenant_memberships') data = [{ tenant_id: tenantId, role: 'tenant_admin', status: 'active' }];
    else if (endpoint === 'employees') data = [];
    else if (endpoint === 'tenants') data = [{ id: tenantId, name: 'Synthetic Organization', slug: 'synthetic-org', timezone: 'Asia/Dhaka', is_active: true }];
    else if (endpoint === 'manpower_requisitions') {
      expect(url.searchParams.get('tenant_id')).toBe(`eq.${tenantId}`);
      const statusFilter = url.searchParams.get('status');
      if (state.approvedReadFails && statusFilter === 'eq.approved') {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic read failure.' }) });
        return;
      }
      data = state.requisitions.filter(row => row.tenant_id === tenantId
        && (!statusFilter || statusFilter === `eq.${row.status}`));
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
}

async function openJobCirculars(page: Page) {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const modules = page.getByRole('navigation', { name: 'HRIS modules' });
  await expect(modules).toBeVisible();
  await modules.getByRole('button', { name: 'Job circulars', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Job circular management' })).toBeVisible();
}

test('synthetic tenant admin creates and resolves requisitions, then links only an approved request to a job', async ({ page }) => {
  const state: SyntheticState = {
    requisitions: [], saveRequisitionCalls: [], resolveCalls: [], saveJobCalls: [],
    approvedReadFails: false, directTableWrites: [],
  };
  await installSyntheticTenant(page, state);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openJobCirculars(page);

  const workflows = page.getByRole('navigation', { name: 'Recruitment workflows' });
  await workflows.getByRole('button', { name: 'Manpower requisitions', exact: true }).click();
  const manager = page.getByRole('region', { name: 'Manpower requisition management' });
  await expect(manager.getByRole('heading', { name: 'Manpower requisitions', exact: true })).toBeVisible();
  await manager.getByRole('button', { name: 'New requisition', exact: true }).click();
  const editor = page.getByRole('form', { name: 'Requisition editor' });
  const title = editor.getByLabel(/Requisition title/);
  const positions = editor.getByLabel(/Required positions/);

  await editor.getByRole('button', { name: 'Save requisition', exact: true }).click();
  expect(await title.evaluate(element => !(element as HTMLInputElement).checkValidity())).toBe(true);
  expect(state.saveRequisitionCalls).toHaveLength(0);

  await title.fill('Synthetic Approved Requisition');
  await positions.fill('0');
  await editor.getByRole('button', { name: 'Save requisition', exact: true }).click();
  expect(await positions.evaluate(element => !(element as HTMLInputElement).checkValidity())).toBe(true);
  expect(state.saveRequisitionCalls).toHaveLength(0);

  await positions.fill('2');
  await editor.getByLabel(/Reason for request/).fill('Synthetic fixture for isolated workflow acceptance.');
  await editor.getByRole('button', { name: 'Save requisition', exact: true }).click();
  await expect(manager.getByText('Requisition submitted for approval.')).toBeVisible();
  await expect(manager.getByText('Synthetic Approved Requisition', { exact: true })).toBeVisible();
  expect(state.saveRequisitionCalls).toHaveLength(1);
  expect(state.saveRequisitionCalls[0]).toMatchObject({ p_id: null });
  const savedPayload = state.saveRequisitionCalls[0].p_payload as Record<string, unknown>;
  expect(savedPayload).toMatchObject({ title: 'Synthetic Approved Requisition', required_positions: 2 });
  expect(savedPayload).not.toHaveProperty('status');
  expect(savedPayload).not.toHaveProperty('tenant_id');

  await manager.getByLabel('Reviewer note (optional)').fill('Synthetic approval evidence.');
  await manager.getByRole('button', { name: 'Approve requisition', exact: true }).click();
  await expect(manager.getByText('Requisition approved.')).toBeVisible();
  await expect(manager.getByText('Approved', { exact: true })).toBeVisible();
  expect(state.resolveCalls[0]).toEqual({
    p_id: approvedRequisitionId, p_decision: 'approved', p_note: 'Synthetic approval evidence.',
  });
  await expect(manager.getByRole('button', { name: 'Approve requisition', exact: true })).toHaveCount(0);

  await manager.getByRole('button', { name: 'New requisition', exact: true }).click();
  const rejectedEditor = page.getByRole('form', { name: 'Requisition editor' });
  await rejectedEditor.getByLabel(/Requisition title/).fill('Synthetic Rejected Requisition');
  await rejectedEditor.getByLabel(/Required positions/).fill('1');
  await rejectedEditor.getByRole('button', { name: 'Save requisition', exact: true }).click();
  await expect(manager.getByText('Synthetic Rejected Requisition', { exact: true })).toBeVisible();
  const rejectedCard = manager.locator('li').filter({ hasText: 'Synthetic Rejected Requisition' });
  await rejectedCard.getByRole('button', { name: 'Reject requisition', exact: true }).click();
  await expect(manager.getByText('Requisition rejected.')).toBeVisible();
  expect(state.resolveCalls[1]).toEqual({ p_id: rejectedRequisitionId, p_decision: 'rejected', p_note: null });
  await expect(rejectedCard.getByRole('button', { name: 'Reject requisition', exact: true })).toHaveCount(0);

  await workflows.getByRole('button', { name: 'Job circulars', exact: true }).click();
  const jobs = page.getByRole('region', { name: 'Job circular management' });
  await jobs.getByRole('button', { name: 'New job circular', exact: true }).click();
  const jobEditor = page.getByRole('form', { name: 'Job circular editor' });
  const requisitionPicker = jobEditor.getByLabel('Approved requisition');
  await expect(requisitionPicker.locator('option')).toHaveCount(2);
  await expect(requisitionPicker).toContainText('Synthetic Approved Requisition');
  await expect(requisitionPicker).not.toContainText('Synthetic Rejected Requisition');
  await requisitionPicker.selectOption(approvedRequisitionId);
  await jobEditor.getByLabel(/Job title/).fill('Synthetic approved requisition vacancy');
  await jobEditor.getByRole('button', { name: 'Save job circular', exact: true }).click();
  await expect(jobs.getByText('Job circular saved as draft. Publish it when ready.')).toBeVisible();
  expect(state.saveJobCalls).toHaveLength(1);
  expect((state.saveJobCalls[0].p_payload as Record<string, unknown>).requisition_id).toBe(approvedRequisitionId);
  expect(state.directTableWrites).toEqual([]);

  state.approvedReadFails = true;
  await workflows.getByRole('button', { name: 'Manpower requisitions', exact: true }).click();
  await workflows.getByRole('button', { name: 'Job circulars', exact: true }).click();
  await jobs.getByRole('button', { name: 'New job circular', exact: true }).click();
  const failedPicker = page.getByRole('form', { name: 'Job circular editor' }).getByLabel('Approved requisition');
  await expect(page.getByText('Approved requisitions could not be loaded. Save without a new link or refresh to try again.')).toBeVisible();
  await expect(failedPicker.locator('option')).toHaveCount(1);

  await workflows.getByRole('button', { name: 'Manpower requisitions', exact: true }).click();
  await page.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await expect(page.getByRole('region', { name: 'জনবল চাহিদা ব্যবস্থাপনা' })).toBeVisible();
  for (const width of [1920, 1280, 768, 375]) {
    await page.setViewportSize({ width, height: width < 768 ? 812 : 960 });
    await expect(page.getByRole('heading', { name: 'জনবল চাহিদাসমূহ', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
  }

  expect(state.directTableWrites).toEqual([]);
});
