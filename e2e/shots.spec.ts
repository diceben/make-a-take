import { expect, test } from '@playwright/test';
import { signedIn } from './fixtures';

/**
 * Not an assertion, a look. These write full-page images so the design can be
 * judged by eye rather than by whether the selectors still resolve.
 *
 * Skipped unless SHOTS is set: a screenshot proves nothing on its own, and
 * making CI produce artefacts nobody opens is how a suite gets slow.
 */
test.skip(!process.env['SHOTS'], 'set SHOTS=1 to write the images');

test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1400, height: 1200 } });

test('the phase', async ({ page }) => {
  await signedIn(page);
  await page.goto('/songs/s1');
  await expect(page.getByRole('heading', { level: 2, name: 'Mix', exact: true })).toBeVisible();
  await page.screenshot({ path: 'shots/phase.png', fullPage: true });
});

test('the check', async ({ page }) => {
  await signedIn(page);
  await page.goto('/songs/s1/mix/check');
  await expect(page.getByRole('heading', { level: 1, name: 'Mix check' })).toBeVisible();
  await page.screenshot({ path: 'shots/check.png', fullPage: true });
});

test('the list', async ({ page }) => {
  await signedIn(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sarah Kane' })).toBeVisible();
  await page.screenshot({ path: 'shots/list.png', fullPage: true });
});

test('an empty phase', async ({ page }) => {
  await signedIn(page);
  await page.goto('/songs/s1/capture');
  await expect(page.getByRole('heading', { level: 2, name: 'Capture', exact: true })).toBeVisible();
  await page.screenshot({ path: 'shots/empty-phase.png', fullPage: true });
});
