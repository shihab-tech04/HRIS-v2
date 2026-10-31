import { expect, test } from '@playwright/test';

const widths = [375, 768, 1280, 1920] as const;
const languages = ['EN', 'BN'] as const;

for (const width of widths) {
  for (const language of languages) {
    test(`shared audit dialog returns focus and traps Tab at ${width}px in ${language}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
      await page.goto('/?preview=true');

      if (language === 'BN') {
        await page.getByRole('button', { name: 'Toggle language between English and Bengali' }).click();
      }
      const triggerLabel = language === 'BN'
        ? (width < 640 ? 'অডিট' : 'পর্যায় ১ অডিট রিপোর্ট')
        : (width < 640 ? 'Audit' : 'Phase 1 Audit Report');
      const trigger = page.getByRole('button', { name: triggerLabel, exact: true });
      await expect(trigger).toBeVisible();
      await trigger.click();

      const dialog = page.getByRole('dialog', { name: 'Phase 1 Preview Checks — Not Certification' });
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAttribute('aria-describedby', /.+/);

      const closeButton = dialog.getByRole('button', { name: 'Close dialog' });
      await expect(closeButton).toBeFocused();

      // Shift+Tab at the first button must wrap to the last enabled dialog button.
      const lastButton = dialog.locator('button:not([disabled])').last();
      await page.keyboard.press('Shift+Tab');
      await expect(lastButton).toBeFocused();

      // Tab at the last button must wrap back to the first, never the page underneath.
      await page.keyboard.press('Tab');
      await expect(closeButton).toBeFocused();

      // Escape closes and restores focus to the original trigger.
      if ((width === 375 && language === 'EN') || (width === 1280 && language === 'BN')) {
        await test.info().attach(`shared-modal-${width}-${language}`, {
          body: await page.screenshot(),
          contentType: 'image/png',
        });
      }
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
    });
  }
}
