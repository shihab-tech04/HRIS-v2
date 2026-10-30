import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const viewports = [375, 768, 1280, 1920];
const locales = ['en', 'bn'] as const;
const tabs = [
  'Personal & Educational Information',
  'Work Experience',
  'Training & certification',
  'Bank',
  'Family & Nominee',
];
const captureDirectory = path.resolve(process.env.WS06_CAPTURE_DIRECTORY || path.join(process.cwd(), 'docs/evidence/ws06-profile-20261021'));

test('all five profile panels render in EN/BN at the requested widths without viewport overflow', async ({ page }) => {
  for (const width of viewports) {
    await page.setViewportSize({ width, height: 900 });
    for (const locale of locales) {
      await page.goto(`/tests/browser/employee-profile-harness.html?state=sparse&locale=${locale}`);
      await expect(page.locator('[data-employee-figma-profile]')).toBeVisible();

      for (let index = 0; index < tabs.length; index += 1) {
        const translated = locale === 'en' ? tabs[index] : [
          'ব্যক্তিগত ও শিক্ষাগত তথ্য', 'কর্ম-অভিজ্ঞতা', 'প্রশিক্ষণ ও সনদ', 'ব্যাংক', 'পরিবার ও মনোনীত ব্যক্তি',
        ][index];
        const tab = page.getByRole('tab', { name: translated });
        await tab.click();
        await expect(tab).toHaveAttribute('aria-selected', 'true');
        const panel = page.getByRole('tabpanel', { name: translated });
        await expect(panel).toBeVisible();
        if (index === 0) {
          await expect(panel.getByText(locale === 'en' ? 'Official Phone Number' : 'অফিসিয়াল ফোন নম্বর', { exact: true })).toBeVisible();
        }
        if (width === 1920 && locale === 'en' && index === 0) {
          const geometry = await page.evaluate(() => {
            const bounds = (selector: string) => {
              const element = document.querySelector(selector);
              if (!element) throw new Error(`Missing geometry target: ${selector}`);
              const rect = element.getBoundingClientRect();
              return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
            };
            const tab = bounds('[data-figma-node="66:72092"] [role="tab"]');
            const content = bounds('section[aria-labelledby="employee-figma-content-title"]');
            const title = bounds('#employee-figma-content-title');
            const detail = bounds('section[aria-labelledby="employee-figma-personal-title"]');
            return { tab, content, title, detail, titleToDetail: detail.y - title.y - title.height };
          });
          // Figma node 66:72042 places this row at y=329; the submitted screenshot already matches that anchor.
          expect([geometry.tab.x, geometry.tab.y, geometry.tab.width, geometry.tab.height]).toEqual([326, 329, 313, 56]);
          expect(geometry.content.y).toBe(408);
          expect(geometry.detail.y).toBe(520);
          expect(geometry.titleToDetail).toBe(52);
        }
        const enabledActions = await panel.getByRole('button').evaluateAll(buttons =>
          buttons.filter(button => !(button as HTMLButtonElement).disabled).map(button => button.textContent?.trim() || 'unnamed'),
        );
        expect(enabledActions, `${translated} should expose its approved profile actions`).not.toHaveLength(0);

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        expect(overflow, `horizontal document overflow at ${width}px / ${locale} / ${translated}`).toBe(false);

        const shouldCapture = process.env.WS06_CAPTURE_PROFILE_SCREENSHOTS === '1'
          && ((index === 0 && (width === 375 || width === 1920)) || (index > 0 && locale === 'en' && width === 1920));
        if (shouldCapture) {
          await mkdir(captureDirectory, { recursive: true });
          await page.locator('[data-employee-figma-profile]').screenshot({
            path: path.join(captureDirectory, `${['personal-education', 'work-experience', 'training-certification', 'bank', 'family-nominee'][index]}-${locale}-${width}.png`),
            animations: 'disabled',
          });
          if (index === 0 && locale === 'en' && width === 1920) {
            await page.setViewportSize({ width: 1920, height: 2063 });
            await page.screenshot({ path: path.join(captureDirectory, 'profile-main-frame-en-1920x2063.png'), animations: 'disabled' });
            const avatar = await page.locator('[data-figma-node="66:72046"] > div').first().boundingBox();
            expect(avatar).not.toBeNull();
            expect([Math.round(avatar!.x), Math.round(avatar!.y), Math.round(avatar!.width), Math.round(avatar!.height)])
              .toEqual([326, 102, 203, 203]);
          }
        }
      }
    }
  }
});

test('profile read states, authorized profile actions, tenant mismatch, and tab keyboard controls stay safe', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/tests/browser/employee-profile-harness.html?state=synthetic&locale=en');
  await expect(page.getByRole('img', { name: 'Employee Name: Synthetic QA Employee' })).toBeVisible();
  await expect(page.getByRole('tabpanel', { name: tabs[0] }).getByText('Synthetic QA Employee')).toBeVisible();
  await expect(page.locator('[data-employee-figma-profile]')).not.toContainText('Nadia Sultana');
  await expect(page.getByText('qa.employee@example.invalid')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit Personal Details' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Edit Contact Details' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Add' }).first()).toBeEnabled();

  const selected = page.getByRole('tab', { name: tabs[0] });
  await selected.focus();
  await selected.press('ArrowRight');
  await expect(page.getByRole('tab', { name: tabs[1] })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: tabs[1] }).press('ArrowLeft');
  await expect(selected).toHaveAttribute('aria-selected', 'true');
  await selected.press('End');
  await expect(page.getByRole('tab', { name: tabs[4] })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: tabs[4] }).press('Home');
  await expect(selected).toHaveAttribute('aria-selected', 'true');

  await page.goto('/tests/browser/employee-profile-harness.html?state=empty&locale=bn');
  await expect(page.getByRole('status')).toContainText('এই প্রতিষ্ঠানে আপনার কর্মী প্রোফাইল পাওয়া যায়নি।');

  await page.goto('/tests/browser/employee-profile-harness.html?state=error&locale=en');
  await expect(page.getByRole('alert')).toContainText('Your employee profile could not be loaded.');
  await page.getByRole('button', { name: /Retry/ }).click();
  await expect(page.getByRole('alert')).toBeVisible();

  await page.goto('/tests/browser/employee-profile-harness.html?state=loading&locale=en');
  await expect(page.getByRole('status')).toContainText('Loading your profile');

  await page.goto('/tests/browser/employee-profile-harness.html?state=tenant-mismatch&locale=en');
  await expect(page.getByRole('alert')).toContainText('could not be loaded');
  await page.goto('/tests/browser/employee-profile-harness.html?state=employee-tenant-mismatch&locale=en');
  await expect(page.getByRole('alert')).toContainText('could not be loaded');

  await page.goto('/tests/browser/employee-profile-harness.html?state=tenant-switch&locale=en');
  await expect(page.getByRole('tabpanel', { name: tabs[0] }).getByText('Synthetic QA Employee')).toBeVisible();
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await expect(page.getByRole('tabpanel', { name: tabs[0] })).toContainText('synthetic-nid-0123456789');
  await page.getByRole('button', { name: 'Switch local fixture tenant' }).click();
  await expect(page.getByRole('status')).toContainText('Loading your profile');
  await expect(page.locator('[data-employee-figma-profile]').getByText('Synthetic QA Employee')).toHaveCount(0);
  await expect(page.getByRole('tabpanel', { name: tabs[0] }).getByText('Synthetic QA Employee')).toBeVisible();
  await expect(page.getByRole('tabpanel', { name: tabs[0] })).not.toContainText('synthetic-nid-0123456789');
});

test('profile correction forms validate, submit the tenant-scoped RPC, and show RPC errors inline', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/tests/browser/employee-profile-harness.html?state=save-error&locale=en');
  await page.getByRole('button', { name: 'Edit Personal Details' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const beforeInvalid = await page.evaluate(() => window.__profileFixtureCalls.filter(call =>
    call.name === 'employee_submit_profile_change_request',
  ).length);
  await dialog.getByRole('button', { name: 'Submit request' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Check the highlighted fields and try again.');
  const afterInvalid = await page.evaluate(() => window.__profileFixtureCalls.filter(call =>
    call.name === 'employee_submit_profile_change_request',
  ).length);
  expect(afterInvalid).toBe(beforeInvalid);

  await dialog.getByLabel('Proposed value').fill('Updated synthetic employee name');
  await dialog.getByLabel('Reason for this correction').fill('Synthetic browser acceptance.');
  await dialog.getByRole('button', { name: 'Submit request' }).click();
  await expect(dialog.getByRole('alert')).toContainText('The change could not be saved.');
  const rejectedCall = await page.evaluate(() => window.__profileFixtureCalls
    .filter(call => call.name === 'employee_submit_profile_change_request').at(-1));
  expect(rejectedCall).toMatchObject({
    args: {
      p_tenant_id: 'local-visual-tenant',
      p_field_key: 'full_name',
      p_requested_value: 'Updated synthetic employee name',
      p_reason: 'Synthetic browser acceptance.',
    },
  });

  await page.goto('/tests/browser/employee-profile-harness.html?state=synthetic&locale=en');
  await page.getByRole('button', { name: 'Edit Contact Details' }).click();
  const successDialog = page.getByRole('dialog');
  await successDialog.getByLabel('Profile field').selectOption('official_email');
  await successDialog.getByLabel('Proposed value').fill('corrected.employee@example.invalid');
  await successDialog.getByLabel('Reason for this correction').fill('Synthetic email correction.');
  await successDialog.getByRole('button', { name: 'Submit request' }).click();
  await expect(page.getByRole('status')).toContainText('Your correction request was submitted for HR review.');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const acceptedCall = await page.evaluate(() => window.__profileFixtureCalls
    .filter(call => call.name === 'employee_submit_profile_change_request').at(-1));
  expect(acceptedCall).toMatchObject({
    args: {
      p_tenant_id: 'local-visual-tenant',
      p_field_key: 'official_email',
      p_requested_value: 'corrected.employee@example.invalid',
      p_reason: 'Synthetic email correction.',
    },
  });
});

test('profile sections display fixture values and keep identity and bank numbers masked by default', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/tests/browser/employee-profile-harness.html?state=synthetic&locale=en');
  const personal = page.getByRole('tabpanel', { name: tabs[0] });
  await expect(personal).toContainText('Synthetic father');
  await expect(personal).toContainText('Synthetic University');
  await expect(personal).toContainText('Synthetic design award');
  await expect(personal).not.toContainText('synthetic-nid-0123456789');
  await page.getByRole('button', { name: 'View', exact: true }).first().click();
  await expect(personal).toContainText('synthetic-nid-0123456789');

  await page.getByRole('tab', { name: tabs[1] }).click();
  await expect(page.getByRole('tabpanel', { name: tabs[1] })).toContainText('Synthetic Studio');
  await page.getByRole('tab', { name: tabs[2] }).click();
  await expect(page.getByRole('tabpanel', { name: tabs[2] })).toContainText('Synthetic training');
  await expect(page.getByRole('tabpanel', { name: tabs[2] })).toContainText('Synthetic certification');
  await page.getByRole('tab', { name: tabs[3] }).click();
  const bank = page.getByRole('tabpanel', { name: tabs[3] });
  await expect(bank).toContainText('Synthetic Bank');
  await expect(bank).not.toContainText('synthetic-bank-secret-123456');
  await bank.getByRole('button', { name: 'View Account Number' }).click();
  await expect(bank).toContainText('synthetic-bank-secret-123456');
  await bank.getByRole('button', { name: 'Hide Account Number' }).click();
  await expect(bank).not.toContainText('synthetic-bank-secret-123456');
  await page.getByRole('tab', { name: tabs[4] }).click();
  await expect(page.getByRole('tabpanel', { name: tabs[4] })).toContainText('Synthetic family member');
  await expect(page.getByRole('tabpanel', { name: tabs[4] })).toContainText('Synthetic emergency contact');
});

test('family editor validates required fields and submits only the active-tenant family payload', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto('/tests/browser/employee-profile-harness.html?state=synthetic&locale=en');
  await page.getByRole('tab', { name: tabs[4] }).click();
  await page.getByRole('button', { name: 'Add' }).click();
  const dialog = page.getByRole('dialog');
  const countBefore = await page.evaluate(() => window.__profileFixtureCalls.filter(call =>
    call.name === 'employee_save_my_family_member_v1',
  ).length);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Check the highlighted fields and try again.');
  expect(await page.evaluate(() => window.__profileFixtureCalls.filter(call =>
    call.name === 'employee_save_my_family_member_v1',
  ).length)).toBe(countBefore);

  await dialog.getByLabel('Family member name').fill('Synthetic family contact');
  await dialog.getByLabel('Phone number').fill('+880 1700 000222');
  await dialog.getByLabel('NID number').fill('SYNTHETIC-FAMILY-222');
  await dialog.getByLabel('Date of birth').fill('1995-02-03');
  await dialog.getByLabel('Relationship').fill('Sibling');
  await dialog.getByLabel('Present address').fill('Synthetic present address');
  await dialog.getByLabel('Permanent address').fill('Synthetic permanent address');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toContainText('Your profile information was saved.');
  const savedCall = await page.evaluate(() => window.__profileFixtureCalls
    .filter(call => call.name === 'employee_save_my_family_member_v1').at(-1));
  expect(savedCall).toMatchObject({
    args: {
      p_tenant_id: 'local-visual-tenant',
      p_payload: {
        name: 'Synthetic family contact', phone: '+880 1700 000222',
        nid_number: 'SYNTHETIC-FAMILY-222', date_of_birth: '1995-02-03',
        relationship: 'Sibling', present_address: 'Synthetic present address',
        permanent_address: 'Synthetic permanent address', is_nominee: false,
      },
    },
  });
});


test('E02-09 displays the authorized employee work details without leaking private records', async ({ page }) => {
  for (const locale of locales) {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(`/tests/browser/employee-profile-harness.html?state=employment-details&locale=${locale}`);
    await expect(page.getByText('Synthetic QA Employee').first()).toBeVisible();
    for (const detail of ['2022-05-01', 'Permanent', 'Synthetic Dhaka HQ', 'Synthetic Manager', 'Synthetic Grade 7']) {
      await expect(page.getByText(detail, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText(locale === 'en' ? 'Grade' : 'গ্রেড', { exact: true })).toBeVisible();
    await expect(page.locator('[data-employee-figma-profile]')).not.toContainText('synthetic-bank-secret');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  }
});


test('profile delete confirms, cancels and refreshes only the selected education, experience or family record', async ({ page }) => {
  const cases = [
    { tab: tabs[0], action: 'Delete Education Information 1', kind: 'education', id: 'synthetic-education-id', value: 'Synthetic University', width: 375 },
    { tab: tabs[1], action: 'Delete Work Experience 1', kind: 'experience', id: 'synthetic-experience-id', value: 'Synthetic Studio', width: 768 },
    { tab: tabs[4], action: 'Delete Family & Nominee Information 1', kind: 'family', id: 'synthetic-family-id', value: 'Synthetic family member', width: 1280 },
  ] as const;

  for (const entry of cases) {
    await page.setViewportSize({ width: entry.width, height: 900 });
    await page.goto('/tests/browser/employee-profile-harness.html?state=synthetic&locale=en');
    await page.getByRole('tab', { name: entry.tab }).click();
    const panel = page.getByRole('tabpanel', { name: entry.tab });
    await expect(panel).toContainText(entry.value);
    await panel.getByRole('button', { name: entry.action }).click();
    const confirmation = page.getByRole('alertdialog');
    await expect(confirmation).toContainText('Delete this profile record?');

    // Cancel must not call SQL or remove the row.
    await confirmation.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(panel).toContainText(entry.value);
    expect(await page.evaluate(() => window.__profileFixtureCalls
      .filter(call => call.name === 'employee_delete_my_profile_record_v1').length)).toBe(0);

    // Confirm must target exactly the active tenant, allowed record type and selected row.
    await panel.getByRole('button', { name: entry.action }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByText('The profile record was deleted.', { exact: true })).toBeVisible();
    await expect(panel).not.toContainText(entry.value);
    const deletes = await page.evaluate(() => window.__profileFixtureCalls
      .filter(call => call.name === 'employee_delete_my_profile_record_v1'));
    expect(deletes).toHaveLength(1);
    expect(deletes[0]).toMatchObject({
      args: { p_tenant_id: 'local-visual-tenant', p_kind: entry.kind, p_record_id: entry.id },
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  }
});

test('profile delete retains the record and exposes recovery when its RPC fails, including Bengali confirmation', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/tests/browser/employee-profile-harness.html?state=synthetic&locale=bn&delete=error');
  await page.getByRole('tab', { name: 'পরিবার ও মনোনীত ব্যক্তি' }).click();
  const family = page.getByRole('tabpanel', { name: 'পরিবার ও মনোনীত ব্যক্তি' });
  await expect(family).toContainText('Synthetic family member');
  await family.getByRole('button', { name: /^মুছুন / }).click();
  const confirmation = page.getByRole('alertdialog');
  await expect(confirmation).toContainText('প্রোফাইলের এই তথ্যটি মুছে ফেলবেন?');
  await confirmation.getByRole('button', { name: 'মুছুন', exact: true }).click();
  await expect(confirmation.getByRole('alert')).toContainText('আবার চেষ্টা করুন');
  await expect(family).toContainText('Synthetic family member');
  const rejectedCalls = await page.evaluate(() => window.__profileFixtureCalls
    .filter(call => call.name === 'employee_delete_my_profile_record_v1'));
  expect(rejectedCalls).toHaveLength(1);
  expect(rejectedCalls[0]).toMatchObject({
    args: { p_tenant_id: 'local-visual-tenant', p_kind: 'family', p_record_id: 'synthetic-family-id' },
  });
  await confirmation.getByRole('button', { name: 'বাতিল' }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(family).toContainText('Synthetic family member');
});

test('profile delete retry succeeds after a transient Bengali RPC error', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/tests/browser/employee-profile-harness.html?state=synthetic&locale=bn&delete=error-once');
  await page.getByRole('tab', { name: 'পরিবার ও মনোনীত ব্যক্তি' }).click();
  const family = page.getByRole('tabpanel', { name: 'পরিবার ও মনোনীত ব্যক্তি' });
  await expect(family).toContainText('Synthetic family member');
  await family.getByRole('button', { name: /^মুছুন / }).click();
  const confirmation = page.getByRole('alertdialog');
  await confirmation.getByRole('button', { name: 'মুছুন', exact: true }).click();
  await expect(confirmation.getByRole('alert')).toContainText('আবার চেষ্টা করুন');
  await expect(family).toContainText('Synthetic family member');

  await confirmation.getByRole('button', { name: 'মুছুন', exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(page.getByText('প্রোফাইলের তথ্য মুছে ফেলা হয়েছে।', { exact: true })).toBeVisible();
  await expect(family).not.toContainText('Synthetic family member');
  const calls = await page.evaluate(() => window.__profileFixtureCalls
    .filter(call => call.name === 'employee_delete_my_profile_record_v1'));
  expect(calls).toHaveLength(2);
  expect(calls.every(call => (call.args as { p_tenant_id?: string; p_kind?: string; p_record_id?: string })
    .p_tenant_id === 'local-visual-tenant'
    && (call.args as { p_kind?: string }).p_kind === 'family'
    && (call.args as { p_record_id?: string }).p_record_id === 'synthetic-family-id')).toBe(true);
});

test('family address copy supports selection, unselection and EN/BN save without an extra SQL field', async ({ page }) => {
  for (const locale of locales) {
    for (const shouldKeepCopy of [true, false]) {
      await page.setViewportSize({ width: 375, height: 900 });
      await page.goto(`/tests/browser/employee-profile-harness.html?state=synthetic&locale=${locale}`);
      await page.getByRole('tab', { name: locale === 'en' ? tabs[4] : 'পরিবার ও মনোনীত ব্যক্তি' }).click();
      const editName = locale === 'en' ? 'Edit Family & Nominee Information 1' : 'সম্পাদনা পরিবার ও মনোনীত ব্যক্তির তথ্য 1';
      await page.getByRole('button', { name: editName }).click();
      const dialog = page.getByRole('dialog');
      const present = dialog.getByLabel(locale === 'en' ? 'Present address' : 'বর্তমান ঠিকানা');
      const permanent = dialog.getByLabel(locale === 'en' ? 'Permanent address' : 'স্থায়ী ঠিকানা');
      const copy = dialog.getByRole('checkbox', { name: locale === 'en' ? 'Same as present address' : 'বর্তমান ঠিকানার মতোই' });

      await expect(copy).not.toBeChecked();
      await copy.check();
      await expect(permanent).toBeDisabled();
      await expect(permanent).toHaveValue('Synthetic family present address');
      await present.fill('Changed synthetic present address');
      await expect(permanent).toHaveValue('Changed synthetic present address');

      if (!shouldKeepCopy) {
        await copy.uncheck();
        await expect(permanent).toBeEnabled();
        await permanent.fill('Different synthetic permanent address');
      }
      await dialog.getByRole('button', { name: locale === 'en' ? 'Save' : 'সংরক্ষণ' }).click();
      await expect(dialog).toHaveCount(0);
      const saved = await page.evaluate(() => window.__profileFixtureCalls
        .filter(call => call.name === 'employee_save_my_family_member_v1').at(-1));
      expect(saved).toMatchObject({ args: {
        p_tenant_id: 'local-visual-tenant',
        p_payload: {
          present_address: 'Changed synthetic present address',
          permanent_address: shouldKeepCopy ? 'Changed synthetic present address' : 'Different synthetic permanent address',
        },
      } });
      expect((saved?.args as { p_payload?: Record<string, unknown> })?.p_payload)
        .not.toHaveProperty('same_as_present_address');
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    }
  }
});
