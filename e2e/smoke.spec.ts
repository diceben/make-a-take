import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * These run against a build configured with a throwaway Supabase URL, so the
 * app renders the signed-out state and never talks to a real project.
 *
 * `color-contrast-enhanced` is the AAA (7:1) rule and is off by default in axe.
 * Make a Take holds itself to it, so we turn it on explicitly.
 */
const analyse = (page: Page) =>
  new AxeBuilder({ page })
    .options({ rules: { 'color-contrast-enhanced': { enabled: true } } })
    .analyze();

test('an unauthenticated visitor lands on the sign-in form', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
});

test('the form refuses an obviously wrong address', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('nonsense');
  await page.getByLabel('Password').fill('longenough');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('status')).toContainText('does not look like an email address');
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

  test('the sign-up form is accessible too', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Create one/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Create an account' })).toBeVisible();
    expect((await analyse(page)).violations).toEqual([]);
  });

  test('remembers the theme across a reload', async ({ page }) => {
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

test('the keyboard reaches the skip link first, then the form', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();

  await page.getByLabel('Email').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Password')).toBeFocused();
});
