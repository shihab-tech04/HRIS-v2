import { expect, test } from '@playwright/test';

const userId = 'e3333333-3333-4333-8333-333333333333';
const tenantId = 'e4444444-4444-4444-8444-444444444444';
const candidateId = 'e5555555-5555-4555-8555-555555555555';
const applicationId = 'e6666666-6666-4666-8666-666666666666';
const user = { id: userId, aud: 'authenticated', role: 'authenticated',
  email: 'synthetic-recruiter@example.org', app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {}, created_at: '2026-01-01T00:00:00.000Z' };
const jwtHeader = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })).toString('base64url');
const jwtPayload = Buffer.from(JSON.stringify({ sub: userId, aud: 'authenticated',
  role: 'authenticated', email: user.email,
  iss: 'https://oslgwxaqfbteqtwqvdzs.supabase.co/auth/v1',
  exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
const jwt = [jwtHeader, jwtPayload, 'synthetic-signature'].join('.');

test('recruiter reviews an application, signs a private CV link and persists a stage decision', async ({ page }) => {
  let stage = 'submitted';
  let stageWrites = 0;
  let signedCvRequests = 0;
  const permissionChecks: string[] = [];
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
    const endpoint = url.pathname.split('/').pop();
    if (endpoint === 'has_permission') {
      const permission = (request.postDataJSON() as { p_permission_id?: string }).p_permission_id || '';
      permissionChecks.push(permission);
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(permission === 'recruitment.view' || permission === 'recruitment.manage') });
      return;
    }
    if (endpoint === 'admin_get_recruitment_data') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ applications: [{
        id: applicationId, candidate_user_id: candidateId, full_name: 'Synthetic Candidate',
        email: 'candidate@example.org', phone: '+8801000000000', current_location: 'Dhaka',
        years_experience: 4, skills: ['TypeScript', 'PostgreSQL'], cv_url: `${candidateId}/cv.pdf`,
        cover_letter: 'Synthetic application for browser acceptance.',
        application_data: { answers: [{ questionId: 'q1', answer: 'Yes' }] },
        stage, status_note: 'Synthetic internal recruiter note', applied_at: '2026-10-15T09:00:00Z',
        job_title: 'Software Engineer', job_reference: 'SYN-01', stage_history: []
      }] }) });
      return;
    }
    if (endpoint === 'admin_update_application_stage') {
      const body = request.postDataJSON() as { p_application_id: string; p_stage: string; p_note: string | null };
      expect(body.p_application_id).toBe(applicationId);
      expect(body.p_stage).toBe('shortlisted');
      expect(body.p_note).toBe('Reviewed in synthetic browser test');
      stage = body.p_stage;
      stageWrites += 1;
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    let data: unknown = [];
    if (endpoint === 'admin_users') data = { active: true, is_super_admin: false };
    else if (endpoint === 'tenants') data = url.searchParams.get('select') === 'id'
      ? { id: tenantId } : [{ id: tenantId, name: 'Synthetic Synesis', slug: 'synesis-it', timezone: 'Asia/Dhaka' }];
    if (request.method() === 'HEAD') {
      await route.fulfill({ status: 200, headers: { 'content-range': '0-0/0' }, body: '' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.route('**/storage/v1/object/sign/candidate-documents/**', async route => {
    signedCvRequests += 1;
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ signedURL: `/storage/v1/object/sign/candidate-documents/${candidateId}/cv.pdf?token=synthetic` }) });
  });

  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  const moduleNav = page.getByRole('navigation', { name: 'HRIS modules' });
  await expect(moduleNav).toBeVisible();
  await moduleNav.getByRole('button', { name: /Candidate pipeline/ }).click();
  const pipeline = page.getByRole('region', { name: 'Recruiter candidate pipeline' });
  await expect(pipeline.getByText('Synthetic Candidate')).toBeVisible();
  await expect(pipeline.getByText('Synthetic internal recruiter note')).toBeVisible();

  await pipeline.getByRole('button', { name: 'Prepare private CV link' }).click();
  await expect(pipeline.getByRole('link', { name: 'Open CV (valid 1 minute)' })).toBeVisible();
  expect(signedCvRequests).toBe(1);

  await pipeline.getByLabel('Next stage').selectOption('shortlisted');
  await pipeline.getByLabel('Internal note').fill('Reviewed in synthetic browser test');
  await pipeline.getByRole('button', { name: 'Save decision' }).click();
  await expect(pipeline.getByText('Application stage updated to Shortlisted.')).toBeVisible();
  await expect(pipeline.getByText('shortlisted', { exact: true })).toBeVisible();
  expect(stageWrites).toBe(1);
  expect(permissionChecks).toContain('recruitment.view');
  expect(permissionChecks).toContain('recruitment.manage');
});
