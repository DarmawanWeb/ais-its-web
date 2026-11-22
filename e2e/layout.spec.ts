import { expect, test } from '@playwright/test';

import { login, navigationPaths } from './fixtures';

/** Every page of the sidebar fits the viewport: no horizontal page scroll (390 px and desktop). */
test('no page scrolls horizontally', async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  const paths = await navigationPaths(page);
  expect(paths.length).toBeGreaterThan(20);

  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of paths) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => {
        const root = document.documentElement;
        return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth };
      });
      expect(overflow.scrollWidth, `${path} at ${width}px`).toBeLessThanOrEqual(
        overflow.clientWidth,
      );
    }
  }
});
