import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * `color-contrast-enhanced` is the AAA (7:1) rule and is off by default in axe.
 * Make a Take holds itself to it, so we turn it on explicitly.
 */
const analyse = (page: Page) =>
  new AxeBuilder({ page })
    .options({ rules: { 'color-contrast-enhanced': { enabled: true } } })
    .analyze();

test('the page loads and says what it is', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Track every recording step of a song.',
  );
});

test.describe('a system asking for dark', () => {
  test.use({ colorScheme: 'dark' });

  test('starts dark and stays accessible in both themes', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect((await analyse(page)).violations).toEqual([]);

    await page.getByRole('button', { name: 'Light theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect((await analyse(page)).violations).toEqual([]);
  });

  test('remembers the choice across a reload', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Light theme' }).click();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});

test.describe('a system asking for light', () => {
  test.use({ colorScheme: 'light' });

  test('starts light', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});

test('the keyboard reaches the skip link first', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
});
