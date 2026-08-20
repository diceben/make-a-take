import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { signedIn } from './fixtures';

/**
 * The signed-in views, driven entirely by faked responses — see ./fixtures.
 *
 * These exist mainly to check the parts unit tests cannot see: the contrast of
 * the five state colours, the popover that sets them, the checkpoint, and
 * whether a judgement can be made with the keyboard alone.
 */

/** The account panel is the one part of the page the checks would otherwise
 *  never see, so it is opened before axe looks. */
async function openAccount(page: Page) {
  await page.getByRole('button', { name: /^Account:/ }).click();
}

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

test.describe('the song list', () => {
  // Animations off: deterministic colours for the contrast checks, and it
  // proves the app honours prefers-reduced-motion.
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('names the phase each song is in and counts what is decided', async ({ page }) => {
    await signedIn(page);
    await page.goto('/songs');

    await expect(page.getByRole('heading', { name: 'Sarah Kane' })).toBeVisible();

    // The phase filter offers the same words, so this asks for the row's cell.
    await expect(page.locator('.song-list__phase', { hasText: 'Mix' })).toBeVisible();
    await expect(page.getByText('1 of 4 locked')).toBeVisible();
    await expect(page.getByText('not started')).toBeVisible();

    // The whole point of the rebuild: no song-wide percentage anywhere.
    await expect(page.locator('body')).not.toContainText(/\d+\s?%/);
  });

  test('is accessible, panel and all', async ({ page }) => {
    await signedIn(page);
    await page.goto('/songs');
    await expect(page.getByRole('heading', { name: 'Sarah Kane' })).toBeVisible();
    expect((await analyse(page)).violations).toEqual([]);

    await openAccount(page);
    expect((await analyse(page)).violations).toEqual([]);
  });
});

test.describe('a song', () => {
  // Animations off: deterministic colours for the contrast checks, and it
  // proves the app honours prefers-reduced-motion.
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('opens where the last judgement was made, and shows only that round', async ({ page }) => {
    await signedIn(page);
    await page.goto('/songs/s1');

    await expect(page.getByRole('heading', { level: 1, name: 'Opening Track' })).toBeVisible();
    // Write and track were judged earlier; the mix holds the most recent one.
    await expect(page.getByRole('heading', { level: 2, name: 'Mix', exact: true })).toBeVisible();
    await expect(page.getByText(/round 2/)).toBeVisible();

    const decisions = page.getByRole('list', { name: 'Decisions' });
    await expect(decisions.getByText('Vocal sits in mix')).toBeVisible();
    // Round one stays in the payload and stays readable elsewhere — just not here.
    await expect(decisions.getByText('First attempt')).toHaveCount(0);

    // A note waits in the phase it was aimed at, not the one it was written in.
    await expect(page.getByText('Snare needs another round')).toBeVisible();

    // Nothing that spans the whole song is a percentage. The one on the page is
    // the phase meter's, over decisions of the same kind.
    await expect(page.locator('.journey-page__head')).not.toContainText('%');
    await expect(page.getByRole('navigation', { name: 'Song journey' })).not.toContainText('%');
    await expect(page.locator('.journey-page__aside')).not.toContainText('%');
    await expect(page.locator('.meter')).toContainText('/ 2 decisions settled');
  });

  test('closes a phase that has no decisions, straight from the card', async ({ page }) => {
    await signedIn(page);
    // Capture is empty for this song, as it is for every song carried over.
    await page.goto('/songs/s1/capture');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Capture', exact: true }),
    ).toBeVisible();

    const card = page.getByRole('region', { name: 'Capture check' });
    await expect(card.getByText('No decisions in this round.')).toBeVisible();
    // Nothing to review, so the act is here rather than behind a check.
    await expect(card.getByRole('link', { name: /check/ })).toHaveCount(0);

    const close = card.getByRole('button', { name: 'Close capture' });
    await expect(close).toBeEnabled();
    expect((await analyse(page)).violations).toEqual([]);
  });

  test('goes into the check, and closes the round from it', async ({ page }) => {
    await signedIn(page);
    await page.goto('/songs/s1');
    await expect(page.getByRole('heading', { level: 2, name: 'Mix', exact: true })).toBeVisible();

    await page
      .getByRole('region', { name: 'Mix check' })
      .getByRole('link', { name: /Enter the mix check/ })
      .click();

    await expect(page).toHaveURL(/\/songs\/s1\/mix\/check$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Mix check' })).toBeVisible();
    // The round was reopened, so the check says what sent you back.
    await expect(
      page.getByText('Reopened because: The low end fell apart in the car'),
    ).toBeVisible();
    await expect(page.getByText('0 of 2 decisions locked')).toBeVisible();

    // The colours of the check are its own; axe has not seen them yet.
    expect((await analyse(page)).violations).toEqual([]);

    // Three calls per decision, and nothing written until the sitting is
    // committed — the point of a checkpoint is the sitting.
    const calls = page.getByRole('group', { name: 'Your call on Vocal sits in mix' });
    await calls.getByRole('button', { name: /Keep/ }).click();
    await expect(page.getByRole('button', { name: 'Lock 1 decision' })).toBeEnabled();

    // Closing is offered even with two open, and says so rather than refusing.
    await expect(page.getByRole('button', { name: /Close it anyway/ })).toBeEnabled();
  });

  test('is accessible, popover and panel and all', async ({ page }) => {
    await signedIn(page);
    await page.goto('/songs/s1');
    await expect(page.getByRole('heading', { level: 2, name: 'Mix', exact: true })).toBeVisible();
    expect((await analyse(page)).violations).toEqual([]);

    // The five state colours only exist together inside the popover, which is
    // where their contrast has to hold.
    await page.getByRole('button', { name: 'Vocal sits in mix: Not quite there' }).click();
    await expect(page.getByRole('listbox')).toBeVisible();
    expect((await analyse(page)).violations).toEqual([]);
    await page.keyboard.press('Escape');

    await openAccount(page);
    expect((await analyse(page)).violations).toEqual([]);
  });

  test('sets a judgement with the keyboard alone', async ({ page }) => {
    await signedIn(page);
    await page.goto('/songs/s1');
    await expect(page.getByRole('heading', { level: 2, name: 'Mix', exact: true })).toBeVisible();

    const badge = page.getByRole('button', { name: 'Vocal sits in mix: Not quite there' });
    await badge.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox')).toBeVisible();

    // Five fixed stages in a fixed order is exactly what number keys are for.
    await page.keyboard.press('5');

    await expect(page.getByRole('button', { name: 'Vocal sits in mix: Locked' })).toBeVisible();
    // Closing hands the focus back where it came from.
    await expect(page.getByRole('listbox')).toHaveCount(0);
  });
});

test.describe('the dashboard', () => {
  // Animations off: deterministic colours for the contrast checks, and it
  // proves the app honours prefers-reduced-motion.
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('answers what you have, what wants you, and what is next', async ({ page }) => {
    await signedIn(page);
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: /^Welcome back/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Opening Track' })).toBeVisible();

    // Every phase is named and stated, so the dots are never colour alone.
    const phases = page.getByRole('list', { name: 'Journey of Opening Track' });
    await expect(phases.getByRole('link')).toHaveCount(7);
    await expect(phases.getByRole('link', { name: 'Mix: Not quite there' })).toBeVisible();

    // No song-wide percentage. Counted instead.
    await expect(page.locator('body')).not.toContainText(/\d+\s?%/);
    await expect(page.getByText('2 / 4 decisions made')).toBeVisible();
  });

  test('filters, searches and is accessible throughout', async ({ page }) => {
    await signedIn(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: /^Welcome back/ })).toBeVisible();
    expect((await analyse(page)).violations).toEqual([]);

    const chips = page.getByRole('group', { name: 'Show only' });
    await chips.getByRole('button', { name: 'Needs a take' }).click();
    await expect(page.getByRole('heading', { name: 'Opening Track' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'The Slow One' })).toHaveCount(0);

    await chips.getByRole('button', { name: 'All songs' }).click();
    await page.getByPlaceholder('Search songs').fill('slow');
    await expect(page.getByRole('heading', { name: 'The Slow One' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Opening Track' })).toHaveCount(0);
  });

  test('opens the new-song dialog and is accessible inside it', async ({ page }) => {
    await signedIn(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: /^Welcome back/ })).toBeVisible();

    await page.getByRole('button', { name: 'New song' }).click();
    const dialog = page.getByRole('dialog', { name: 'What are we making?' });
    await expect(dialog).toBeVisible();
    // The colours of the dialog are its own; axe has not seen them yet.
    expect((await analyse(page)).violations).toEqual([]);

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
});
