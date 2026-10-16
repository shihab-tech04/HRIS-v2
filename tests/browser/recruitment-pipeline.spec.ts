import { expect, test } from '@playwright/test';

const userId = 'e3333333-3333-4333-8333-333333333333';
const tenantId = 'e4444444-4444-4444-8444-444444444444';
const applicationId = 'e6666666-6666-4666-8666-666666666666';
const user = {
  id: userId, aud: 'authenticated', role: 'authenticated',
  email: 'synthetic-recruiter@example.org',
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
};
const jwtHeader = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })).toString('base64url');
const jwtPayload = Buffer.from(JSON.stringify({ sub: userId, aud: 'authenticated',
  role: 'authenticated', email: user.email,
  iss: 'https://oslgwxaqfbteqtwqvdzs.supabase.co/auth/v1',
  exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
const jwt = [jwtHeader, jwtPayload, 'synthetic-signature'].join('.');

test('tenant recruiter moves an application through the privacy-safe pipeline', async ({ page }) => {
  let stage = 'submitted';
  let stageWrites = 0;
  let stagePayload: Record<string, unknown> = {};
  let lastPipelinePayload: Record<string, unknown> = {};
  const permissionChecks: string[] = [];
  const application = () => ({
    application_id: applicationId,
    candidate_name: 'Synthetic Candidate',
    job_id: 'e5555555-5555-4555-8555-555555555555',
    job_reference: 'SYN-01',
    job_title: 'Software Engineer',
    stage,
    applied_at: '2026-10-15T09:00:00Z',
    milestones: [{ stage: 'submitted', created_at: '2026-10-15T09:00:00Z' }],
  });

  await page.route('**/auth/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/token')) {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ access_token: jwt, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600, user }) });
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
    if (endpoint === 'has_tenant_permission') {
      const payload = request.postDataJSON() as { p_permission_id?: string; p_tenant_id?: string };
      expect(payload.p_tenant_id).toBe(tenantId);
      const permission = payload.p_permission_id || '';
      permissionChecks.push(permission);
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(permission === 'recruitment.view' || permission === 'recruitment.manage') });
      return;
    }
    if (endpoint === 'has_permission') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'false' });
      return;
    }
    if (endpoint === 'hris_get_recruitment_pipeline') {
      lastPipelinePayload = request.postDataJSON() as Record<string, unknown>;
      expect(lastPipelinePayload.p_tenant_id).toBe(tenantId);
      const matchesStage = !lastPipelinePayload.p_stage || lastPipelinePayload.p_stage === stage;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        applications: matchesStage ? [application()] : [],
        available_stages: ['submitted', 'under_review', 'screening', 'rejected'],
        total_count: matchesStage ? 1 : 0,
        limit: lastPipelinePayload.p_limit,
        offset: lastPipelinePayload.p_offset,
      }) });
      return;
    }
    if (endpoint === 'hris_update_candidate_application_stage') {
      stagePayload = request.postDataJSON() as Record<string, unknown>;
      expect(stagePayload.p_tenant_id).toBe(tenantId);
      expect(stagePayload.p_application_id).toBe(applicationId);
      expect(stagePayload.p_stage).toBe('under_review');
      stage = String(stagePayload.p_stage);
      stageWrites += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        success: true, changed: true, stage, history_id: 'e7777777-7777-4777-8777-777777777777',
        created_at: '2026-10-16T09:00:00Z',
      }) });
      return;
    }

    let data: unknown = [];
    if (endpoint === 'admin_users') data = { active: true, is_super_admin: false };
    else if (endpoint === 'tenant_memberships') data = [{ tenant_id: tenantId, role: 'recruiter', status: 'active' }];
    else if (endpoint === 'employees') data = [];
    else if (endpoint === 'tenants') data = [{ id: tenantId, name: 'Synthetic Synesis', slug: 'synesis-it', timezone: 'Asia/Dhaka', is_active: true }];
    if (request.method() === 'HEAD') {
      await route.fulfill({ status: 200, headers: { 'content-range': '0-0/0' }, body: '' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });

  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  const moduleNav = page.getByRole('navigation', { name: 'HRIS modules' });
  await expect(moduleNav).toBeVisible();
  await moduleNav.getByRole('button', { name: /Candidate pipeline/ }).click();
  const pipeline = page.getByRole('region', { name: 'Candidate pipeline' });
  await expect(pipeline.getByText('Synthetic Candidate', { exact: true })).toBeVisible();
  await expect(pipeline.getByText('Software Engineer')).toBeVisible();
  await expect(pipeline.getByText('SYN-01')).toBeVisible();
  await expect(pipeline.getByText('This read-only view excludes application answers, CVs, uploaded files, private recruiter notes, and panel evaluations.')).toBeVisible();
  await expect(pipeline.getByText('Synthetic internal recruiter note')).toHaveCount(0);
  await expect(pipeline.getByRole('button', { name: 'Prepare private CV link' })).toHaveCount(0);
  expect(lastPipelinePayload).toMatchObject({
    p_tenant_id: tenantId,
    p_search: null,
    p_stage: null,
    p_limit: 50,
    p_offset: 0,
  });

  await pipeline.getByText('Update application progress', { exact: true }).click();
  await pipeline.getByLabel('Next application stage for Synthetic Candidate').selectOption('under_review');
  await pipeline.getByRole('button', { name: 'Save stage' }).click();
  await expect(pipeline.getByText('Application progress updated.')).toBeVisible();
  await expect(pipeline.locator(`[data-application-id="${applicationId}"] article`).getByText('Under Review', { exact: true })).toBeVisible();
  expect(stageWrites).toBe(1);
  expect(stagePayload).toEqual({
    p_tenant_id: tenantId,
    p_application_id: applicationId,
    p_stage: 'under_review',
  });
  expect(permissionChecks).toContain('recruitment.view');
  expect(permissionChecks).toContain('recruitment.manage');
});
