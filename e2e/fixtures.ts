import type { Page } from '@playwright/test';

/**
 * The faked signed-in world: a fabricated session in storage and stubbed REST
 * replies. No real project is touched, and every run sees the same song.
 *
 * Shared because the screenshots need exactly the world the assertions run
 * against — a picture of different data would be a picture of nothing.
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
type RoundSpec = {
  number: number;
  closed_at: string | null;
  decisions: Decision[];
  opened_at?: string;
  reopen_reason?: string | null;
};

const phase = (
  songId: string,
  key: string,
  rounds: RoundSpec[] = [{ number: 1, closed_at: null, decisions: [] }],
) => ({
  song_id: songId,
  id: `${songId}-${key}`,
  key,
  position: PHASE_KEYS.indexOf(key) + 1,
  current_round: rounds[rounds.length - 1]?.number ?? 1,
  rounds: rounds.map((round) => ({
    id: `${songId}-${key}-r${String(round.number)}`,
    opened_at: '2026-08-01T10:00:00Z',
    reopen_reason: null,
    ...round,
  })),
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
      opened_at: '2026-08-08T10:00:00Z',
      reopen_reason: 'The low end fell apart in the car',
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

export async function signedIn(page: Page) {
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

  await page.route('**/rest/v1/rounds*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 's1-mix-r2' }]),
    }),
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
