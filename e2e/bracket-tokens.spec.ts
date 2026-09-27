import { test, expect } from '@playwright/test';
import { mockAiApis, mockAuditFlow } from './helpers/mocks';

/**
 * Bracket chrome tokens (`[ ZAP ]`, `[ DL ]`) are single-line dressing.
 *
 * They used to break whenever the container was narrower than the token —
 * most visibly the 40px header badges, where `[ ZAP ]` stacked into three
 * lines — and BracketTag used to stack the brackets on purpose below the
 * `sm` breakpoint. These specs pin the token to one line at both desktop and
 * phone width: three stacked lines are ~3x the line-height tall, so the
 * bounding box is a direct signal.
 */
test.describe('Bracket tokens never break', () => {
  for (const width of [1280, 390]) {
    test(`[ ZAP ] and [ DL ] render inline at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await mockAiApis(page);
      await mockAuditFlow(page);
      await page.goto('/');

      await page
        .getByPlaceholder(/Paste study material/)
        .fill('Acid-base equilibria and the electron transport chain.');
      await page.getByRole('button', { name: /segregate and export/i }).click();
      await expect(page.getByText(/Segregation Complete/i)).toBeVisible();
      await page.getByRole('button', { name: /\.APKG \+ SM-2/ }).click();
      await expect(page.getByText('Anki & SM-2 Spaced Repetition Exporter')).toBeVisible();

      for (const token of ['[ ZAP ]', '[ DL ]']) {
        const el = page.getByText(token, { exact: true }).first();
        await expect(el).toBeVisible();
        const box = await el.boundingBox();
        const styles = await el.evaluate((node) => {
          const cs = getComputedStyle(node as HTMLElement);
          return { lineHeight: cs.lineHeight, fontSize: cs.fontSize };
        });
        const lineHeight = parseFloat(styles.lineHeight) || parseFloat(styles.fontSize) || 16;
        // One line (plus a little slack), never the three-line bracket stack.
        expect(box!.height).toBeLessThan(lineHeight * 1.6);
      }
    });
  }
});
