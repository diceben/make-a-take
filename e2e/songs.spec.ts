import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * The signed-in views, driven entirely by faked responses: a fabricated session
 * in storage and stubbed REST replies. No real project is touched, and the run
 * stays deterministic.
 *
 * These exist mainly to check the parts unit tests cannot see — contrast of the
 * status colours and the progress bar in both themes, and keyboard reachability.
 */

const PHASES = [
  'writing',
  'arrangement',
  'preproduction',
  'tracking',
  'editing',
  'mixing',
  'mastering',
];
const TRACKS = ['drums', 'bass', 'guitars', 'keys', 'lead_vocals', 'backing_vocals'];

const song = (id: string, title: string, done: string[] = []) => ({
  id,
  title,
  artist: 'Sarah Kane',
  deadline: null,
  notes: '',
  position: 0,
  phase_states: PHASES.map((phase) => ({
    id: `p-${id}-${phase}`,
    song_id: id,
    phase,
    status: done.includes(phase) ? 'done' : 'todo',
    note: '',
  })),
  track_states: TRACKS.map((track) => ({
    id: `t-${id}-${track}`,
    song_id: id,
    track,
    status: done.includes(track) ? 'done' : 'todo',
    note: '',
  })),
});

const SONGS = [
  song('s1', 'Opening Track', ['writing', 'arrangement', 'drums']),
  song('s2', 'The Slow One'),
];

async function signedIn(page: Page) {
  // supabase-js reads its session straight out of storage, keyed by project ref.
  await page.addInitScript(() => {
    const session = {
      access_token: 'fake',
      refresh_token: 'fake',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'user-1', email: 'ben@example.com', aud: 'authenticated' },
    };
    localStorage.setItem('sb-e2e-auth-token', JSON.stringify(session));
  });

  await page.route('**/rest/v1/songs*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(route.request().url().includes('id=eq.s1') ? SONGS[0] : SONGS),
    }),
  );

  await page.route('**/rest/v1/phase_states*', (route) => route.fulfill({ status: 204, body: '' }));
  await page.route('**/rest/v1/track_states*', (route) => route.fulfill({ status: 204, body: '' }));
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
  test.use({ colorScheme: 'dark', contextOptions: { reducedMotion: 'reduce' } });

  test('shows each song with its phase and weighted progress', async ({ page }) => {
    await signedIn(page);
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Sarah Kane' })).toBeVisible();
    await expect(
      page.getByRole('progressbar', { name: 'Progress of Opening Track' }),
    ).toHaveAttribute(
      'aria-valuenow',
      '25', // writing 10 + arrangement 10 + one of six tracks of tracking's 30
    );
    await expect(page.getByText('Pre-production')).toBeVisible();
  });

  test('is accessible in both themes', async ({ page }) => {
    await signedIn(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Sarah Kane' })).toBeVisible();
    expect((await analyse(page)).violations).toEqual([]);

    await page.getByRole('button', { name: 'Light theme' }).click();
    expect((await analyse(page)).violations).toEqual([]);
  });
});

test.describe('a song', () => {
  // Animations off: deterministic colours for the contrast checks, and it
  // proves the app honours prefers-reduced-motion.
  test.use({ colorScheme: 'dark', contextOptions: { reducedMotion: 'reduce' } });

  test('lists every phase and track, and is accessible in both themes', async ({ page }) => {
    await signedIn(page);
    await page.goto('/songs/s1');

    await expect(page.getByRole('heading', { level: 1, name: 'Opening Track' })).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Mixing' })).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Lead vocals' })).toBeVisible();
    await expect(page.getByText(/from the tracks below/)).toBeVisible();

    expect((await analyse(page)).violations).toEqual([]);

    await page.getByRole('button', { name: 'Light theme' }).click();
    expect((await analyse(page)).violations).toEqual([]);
  });

  test('moves the bar when a phase is set with the keyboard alone', async ({ page }) => {
    await signedIn(page);
    await page.goto('/songs/s1');
    await expect(page.getByRole('heading', { level: 1, name: 'Opening Track' })).toBeVisible();

    const bar = page.getByRole('progressbar', { name: 'Progress of Opening Track' });
    await expect(bar).toHaveAttribute('aria-valuenow', '25');

    // Arrow keys move within a radio group, which is why real radios are used.
    const mixing = page.getByRole('radiogroup', { name: 'Mixing' });
    await mixing.getByRole('radio', { name: /To do/ }).focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');

    await expect(mixing.getByRole('radio', { name: /Done/ })).toBeChecked();
    await expect(bar).toHaveAttribute('aria-valuenow', '45'); // 25 + mixing's 20
  });
});
