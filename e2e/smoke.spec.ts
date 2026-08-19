import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * These run against a build configured with a throwaway Supabase URL, so the
 * app renders the signed-out state and never talks to a real project.
 *
 * `color-contrast-enhanced` is the AAA (7:1) rule and is off by default in axe.
 * Make a Take holds itself to it, so we turn it on explicitly.
 */
async function analyse(page: Page) {
  // Wait for any colour transition to finish. Sampling mid-fade reports blends
  // that no token defines, and axe judges what is on screen at that instant.
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => {
          setTimeout(resolve, 200);
        });
      }),
  );
  return new AxeBuilder({ page })
    .options({ rules: { 'color-contrast-enhanced': { enabled: true } } })
    .analyze();
}

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

test.describe('the signed-out page', () => {
  // Animations off: deterministic colours for the contrast checks, and it
  // proves the app honours prefers-reduced-motion.
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('is accessible', async ({ page }) => {
    await page.goto('/');
    expect((await analyse(page)).violations).toEqual([]);
  });

  test('the sign-up form is accessible too', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Create one/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Create an account' })).toBeVisible();
    expect((await analyse(page)).violations).toEqual([]);
  });

  // One palette now, so there is nothing to remember across a reload and no
  // system preference to follow. The page looks the same either way.
  test('ignores what the system asks for', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    expect((await analyse(page)).violations).toEqual([]);
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
