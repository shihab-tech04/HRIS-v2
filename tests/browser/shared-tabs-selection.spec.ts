import { expect, test } from '@playwright/test';

const widths = [375, 768, 1280, 1920] as const;
const locales = ['EN', 'BN'] as const;

for (const width of widths) {
  for (const locale of locales) {
    test(`shared section buttons announce selection at ${width}px in ${locale}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 1024 ? 812 : 960 });
      await page.goto('/?preview=true');
      if (locale === 'BN') {
        await page.getByRole('button', { name: 'Toggle language between English and Bengali' }).click();
      }
      await page.getByRole('button', { name: 'Admin View' }).click();
      if (width < 1024) {
        await page.getByRole('button', { name: 'Open navigation menu' }).click();
        await page.getByRole('dialog', { name: 'Mobile Navigation' })
          .getByRole('button', { name: 'Org Structure & Roles' }).click();
      } else {
        await page.getByTestId('app-sidebar')
          .getByRole('button', { name: 'Org Structure & Roles' }).click();
      }

      const roles = page.getByRole('button', { name: /Configurable Roles/ });
      const departments = page.getByRole('button', { name: /Departments & Cost Centers/ });
      await expect(roles).toHaveAttribute('aria-pressed', 'true');
      await expect(departments).toHaveAttribute('aria-pressed', 'false');
      await expect(page.getByText('Tenant Dynamic Roles')).toBeVisible();

      await roles.focus();
      await page.keyboard.press('Tab');
      await expect(departments).toBeFocused();
      expect(await departments.evaluate(el => el.matches(':focus-visible'))).toBe(true);

      await page.keyboard.press('Enter');
      await expect(departments).toHaveAttribute('aria-pressed', 'true');
      await expect(roles).toHaveAttribute('aria-pressed', 'false');
      await expect(page.getByText('Configured Departments')).toBeVisible();

      await page.keyboard.press('Shift+Tab');
      await expect(roles).toBeFocused();
      await page.keyboard.press('Space');
      await expect(roles).toHaveAttribute('aria-pressed', 'true');
      await expect(departments).toHaveAttribute('aria-pressed', 'false');

      const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(documentWidth).toBeLessThanOrEqual(width + 1);

      if (width === 375 && locale === 'BN') {
        await test.info().attach('shared-tabs-bn-375', {
          body: await page.screenshot(),
          contentType: 'image/png',
        });
      }
    });
  }
}
