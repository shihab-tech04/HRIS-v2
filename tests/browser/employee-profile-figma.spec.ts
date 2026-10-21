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
        const enabledActions = await panel.getByRole('button').evaluateAll(buttons =>
          buttons.filter(button => !(button as HTMLButtonElement).disabled).map(button => button.textContent?.trim() || 'unnamed'),
        );
        expect(enabledActions, `${translated} must not expose an unapproved write action`).toEqual([]);

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

test('profile read states, disabled writes, tenant mismatch, and tab keyboard controls stay safe', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/tests/browser/employee-profile-harness.html?state=synthetic&locale=en');
  await expect(page.getByRole('img', { name: 'Employee Name: Synthetic QA Employee' })).toBeVisible();
  await expect(page.getByRole('tabpanel', { name: tabs[0] }).getByText('Synthetic QA Employee')).toBeVisible();
  await expect(page.locator('[data-employee-figma-profile]')).not.toContainText('Nadia Sultana');
  await expect(page.getByText('qa.employee@example.invalid')).toBeVisible();
  await expect(page.getByRole('button', { name: /Edit:/ }).first()).toBeDisabled();
  await expect(page.getByRole('button', { name: /Add:/ }).first()).toBeDisabled();

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
  await page.getByRole('button', { name: 'Switch local fixture tenant' }).click();
  await expect(page.getByRole('status')).toContainText('Loading your profile');
  await expect(page.locator('[data-employee-figma-profile]').getByText('Synthetic QA Employee')).toHaveCount(0);
  await expect(page.getByRole('tabpanel', { name: tabs[0] }).getByText('Synthetic QA Employee')).toBeVisible();
});
