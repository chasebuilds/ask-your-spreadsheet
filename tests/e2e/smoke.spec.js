import { test, expect } from '@playwright/test';

// Waits on the page's own ready signal (body[data-ready="true"]), never a fixed sleep.
test('loads the sample, embeds it and answers a query', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Try the sample job ledger' }).click();
  await page.waitForSelector('body[data-ready="true"]', { timeout: 180_000 });
  await expect(page.locator('#status')).toContainText('360 rows');
  await page.locator('#q').fill('customers in Pikeville who owe over $500');
  await page.getByRole('button', { name: 'Search' }).click();
  await page.waitForSelector('body[data-searching="false"]');
  const first = page.locator('#results tbody tr').first();
  await expect(first).toHaveClass(/hit/);
  await expect(first).toContainText('Pikeville');
  await expect(page.locator('#filters')).toContainText('City = pikeville');
  if (process.env.SCREENSHOT) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: 'docs/demo.png', fullPage: false });
  }
});
