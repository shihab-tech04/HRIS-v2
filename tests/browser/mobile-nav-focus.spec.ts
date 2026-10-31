import { expect, test } from '@playwright/test';

const widths = [375, 768, 1280, 1920] as const;
const locales = ['EN', 'BN'] as const;

for (const width of widths) {
  for (const locale of locales) {
    test(`mobile navigation keyboard accessibility at ${width}px in ${locale}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 1024 ? 812 : 960 });
      await page.goto('/?preview=true');
      if (locale === 'BN') {
        await page.getByRole('button', { name: 'Toggle language between English and Bengali' }).click();
      }

      const openMenu = page.getByRole('button', { name: 'Open navigation menu' });
      if (width >= 1024) {
        await expect(openMenu).toBeHidden();
        await expect(page.getByTestId('app-sidebar')).toBeVisible();
        await expect(page.getByRole('dialog', { name: 'Mobile Navigation' })).toHaveCount(0);
        return;
      }

      await expect(openMenu).toBeVisible();
      await openMenu.click();
      const drawer = page.getByRole('dialog', { name: 'Mobile Navigation' });
      await expect(drawer).toBeVisible();
      await expect(drawer.getByRole('combobox', { name: 'Active Tenant' })).toBeVisible();

      const closeMenu = drawer.getByRole('button', { name: 'Close navigation menu' });
      await expect(closeMenu).toBeFocused();
      const lastButton = drawer.locator('button:not([disabled])').last();

      await page.keyboard.press('Shift+Tab');
      await expect(lastButton).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(closeMenu).toBeFocused();

      if (width === 375 && locale === 'EN') {
        await test.info().attach('mobile-nav-keyboard-375-en', {
          body: await page.screenshot(),
          contentType: 'image/png',
        });
      }

      await page.keyboard.press('Escape');
      await expect(drawer).toBeHidden();
      await expect(openMenu).toBeFocused();

      await openMenu.click();
      await expect(closeMenu).toBeFocused();
      await closeMenu.click();
      await expect(drawer).toBeHidden();
      await expect(openMenu).toBeFocused();
    });
  }
}
