import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * The signed-in views, driven entirely by faked responses: a fabricated session
 * in storage and stubbed REST replies. No real project is touched, and the run
 * stays deterministic.
 *
 * These exist mainly to check the parts unit tests cannot see — the contrast of
 * the five state colours, the popover that sets them, and whether a judgement
 * can be made with the keyboard alone.
 */

const PHASE_KEYS = ['capture', 'write', 'produce', 'track', 'edit', 'mix', 'master'];

type Decision = {
  id: string;
  title: string;
  subtitle: string | null;
  position: number;
  state: string;
  state_set_at: string | null;
  state_confirmed_at: string | null;
  steps: { id: string; label: string; position: number; done: boolean }[];
};

const decision = (id: string, title: string, state = 'not_touched', at: string | null = null) => ({
  id,
  title,
  subtitle: null,
  position: 0,
  state,
  state_set_at: at,
  state_confirmed_at: null,
  steps: [],
});

/** One phase of one song, with the rounds it has been through. */
const phase = (
  songId: string,
  key: string,
  rounds: { number: number; closed_at: string | null; decisions: Decision[] }[] = [
    { number: 1, closed_at: null, decisions: [] },
  ],
) => ({
  song_id: songId,
  id: `${songId}-${key}`,
  key,
  position: PHASE_KEYS.indexOf(key) + 1,
  current_round: rounds[rounds.length - 1]?.number ?? 1,
  rounds: rounds.map((round) => ({ id: `${songId}-${key}-r${String(round.number)}`, ...round })),
});

const song = (id: string, title: string) => ({
  id,
  title,
  artist: 'Sarah Kane',
  deadline: null,
  notes: '',
  position: 0,
  phase_states: [],
  track_states: [],
});

const SONGS = [song('s1', 'Opening Track'), song('s2', 'The Slow One')];

// Stamps are staggered on purpose: which phase is in hand is decided by which
// judgement is the most recent, so identical stamps would decide nothing.
const PHASES = [
  phase('s1', 'capture'),
  phase('s1', 'write', [
    {
      number: 1,
      closed_at: null,
      decisions: [decision('d-write', 'Structure', 'locked', '2026-08-10T21:00:00Z')],
    },
  ]),
  phase('s1', 'produce'),
  phase('s1', 'track', [
    {
      number: 1,
      closed_at: null,
      decisions: [decision('d-track', 'Drums', 'feels_right', '2026-08-11T21:00:00Z')],
    },
  ]),
  phase('s1', 'edit'),
  // Been round twice. The first round stays in the payload and must not show.
  phase('s1', 'mix', [
    {
      number: 1,
      closed_at: '2026-08-01T21:00:00Z',
      decisions: [decision('d-mix-old', 'First attempt', 'locked', '2026-08-01T20:00:00Z')],
    },
    {
      number: 2,
      closed_at: null,
      decisions: [
        decision('d-mix-vocal', 'Vocal sits in mix', 'not_quite_there', '2026-08-12T21:00:00Z'),
        decision('d-mix-auto', 'Automation pass'),
      ],
    },
  ]),
  phase('s1', 'master'),
  ...PHASE_KEYS.map((key) => phase('s2', key)),
];

const NOTES = [
  {
    id: 'n1',
    body: 'Snare needs another round',
    created_at: '2026-08-14T10:00:00Z',
    origin_phase: 'track',
    target_phase: 'mix',
    for_next_song: false,
    resolved_at: null,
  },
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

  await page.route('**/rest/v1/profiles*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );

  // The list asks for every song's phases; a song asks for its own. Same table,
  // told apart by the filter PostgREST puts in the query string.
  await page.route('**/rest/v1/phases*', (route) => {
    const url = route.request().url();
    const match = /song_id=eq\.([^&]+)/.exec(url);
    const body = match ? PHASES.filter((one) => one.song_id === match[1]) : PHASES;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  await page.route('**/rest/v1/notes*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(NOTES) }),
  );

  // Writing a judgement. The row comes back so the page learns what the database
  // decided rather than guessing — including whether it counted as a confirmation.
  await page.route('**/rest/v1/decisions*', (route) => {
    const request = route.request();
    const id = /id=eq\.([^&]+)/.exec(request.url())?.[1] ?? 'd-mix-vocal';
    const sent = request.postDataJSON() as { state?: string } | null;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        decision(id, 'Vocal sits in mix', sent?.state ?? 'not_touched', '2026-08-12T21:00:00Z'),
      ),
    });
  });
}

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
    await page.goto('/');

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
    await page.goto('/');
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

    await expect(page.locator('body')).not.toContainText(/\d+\s?%/);
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
