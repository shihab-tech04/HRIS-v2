import { expect, test } from '@playwright/test';

type RecordedCall = {
  kind: string;
  name?: string;
  payload?: Record<string, unknown>;
};

async function invitationCalls(page: import('@playwright/test').Page) {
  return page.evaluate(() => (
    window as Window & { __hrisInvitationCalls?: RecordedCall[] }
  ).__hrisInvitationCalls || []);
}

test('tenant HR saves an employee and submits one stable invitation request', async ({ page }) => {
  await page.goto('/tests/browser/employee-invitation-harness.html?mode=manager');
  await page.getByRole('button', { name: 'Add employee' }).click();
  await expect(page.getByRole('heading', { name: 'Add employee and send invitation' })).toBeVisible();

  await page.getByLabel('Employee number').fill('E-123');
  await page.getByLabel('Full name').fill('Realistic Test Employee');
  await page.getByLabel('Official email').fill('employee@example.test');
  await page.getByLabel('Joining date').fill('2026-11-01');
  await page.getByRole('button', { name: 'Save employee and send invitation' }).click();

  await expect(page.getByRole('status')).toContainText('Employee record saved and invitation email sent.');
  const calls = await invitationCalls(page);
  const submitted = calls.find(call => call.kind === 'function' && call.name === 'hris-employee-invite');
  expect(submitted?.payload).toMatchObject({
    tenant_id: 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    employee_number: 'E-123',
    full_name: 'Realistic Test Employee',
    email: 'employee@example.test',
    joining_date: '2026-11-01',
  });
  expect(submitted?.payload?.request_id).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/i));
});

test('expired invitation resend retries with the same idempotency key and hides actions from viewers', async ({ page }) => {
  await page.goto('/tests/browser/employee-invitation-harness.html?mode=retry');
  const resend = page.getByRole('button', { name: 'Resend invitation' }).first();
  await expect(resend).toBeVisible();
  await resend.click();
  await expect(page.getByRole('alert')).toContainText('The employee invitation could not be reissued.');
  await page.getByRole('button', { name: 'Resend invitation' }).first().click();
  await expect(page.getByRole('status')).toContainText('Employee invitation reissued and email sent.');

  const calls = await invitationCalls(page);
  const resendCalls = calls.filter(call => call.kind === 'function'
    && call.name === 'hris-employee-invite' && call.payload?.mode === 'resend');
  expect(resendCalls).toHaveLength(2);
  expect(resendCalls[0].payload?.request_id).toBe(resendCalls[1].payload?.request_id);
  expect(resendCalls[0].payload).not.toHaveProperty('email');
  expect(resendCalls[0].payload).not.toHaveProperty('full_name');

  await page.goto('/tests/browser/employee-invitation-harness.html?mode=readonly');
  await expect(page.getByRole('button', { name: 'Add employee' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Resend invitation' })).toHaveCount(0);
});

test('employee acceptance is localized and lets a verified invitee retry after a transient failure', async ({ page }) => {
  await page.goto('/tests/browser/employee-invitation-acceptance-harness.html?mode=retry&locale=bn');
  await expect(page.getByRole('heading')).toContainText('কর্মী প্রবেশাধিকার সম্পন্ন করুন');
  await page.getByLabel('নতুন পাসওয়ার্ড').fill('FreshPassword123');
  await page.getByLabel('পাসওয়ার্ড নিশ্চিত করুন').fill('MismatchPassword123');
  await page.getByRole('button', { name: 'পাসওয়ার্ড সংরক্ষণ করে প্রবেশাধিকার সক্রিয় করুন' }).click();
  await expect(page.getByRole('alert')).toContainText('পাসওয়ার্ড দুটি মেলেনি।');

  await page.getByLabel('পাসওয়ার্ড নিশ্চিত করুন').fill('FreshPassword123');
  await page.getByRole('button', { name: 'পাসওয়ার্ড সংরক্ষণ করে প্রবেশাধিকার সক্রিয় করুন' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'কর্মী সক্রিয়করণ আবার চেষ্টা করুন' }).click();
  await expect(page.getByRole('status')).toContainText('Employee invitation accepted for');
  const calls = await invitationCalls(page);
  expect(calls.filter(call => call.kind === 'password_saved')).toHaveLength(1);
  expect(calls.filter(call => call.kind === 'rpc' && call.name === 'hris_accept_employee_invitation')).toHaveLength(2);
});
