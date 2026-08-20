import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DashboardPage } from './DashboardPage';
import { AuthContext, type Auth } from '../auth/auth-context';
import {
  PHASE_KEYS,
  type Decision,
  type DecisionState,
  type Phase,
  type Round,
} from '../../lib/journey';
import type { Song } from '../../lib/model';
import * as data from '../../lib/data';

vi.mock('../../lib/data');

let counter = 0;

const decision = (
  state: DecisionState,
  at: string | null = null,
  title = 'Structure',
): Decision => ({
  id: `d-${(counter += 1)}`,
  title,
  subtitle: null,
  position: counter,
  state,
  state_set_at: at,
  state_confirmed_at: null,
  steps: [],
});

const round = (over: Partial<Round> = {}): Round => ({
  id: `r-${(counter += 1)}`,
  number: 1,
  opened_at: '2026-08-01T10:00:00Z',
  closed_at: null,
  reopen_reason: null,
  decisions: [],
  ...over,
});

/** Seven phases, with whatever was given for the ones named. */
const journey = (given: Partial<Record<(typeof PHASE_KEYS)[number], Round[]>> = {}): Phase[] =>
  PHASE_KEYS.map((key) => {
    const rounds = given[key] ?? [round()];
    return {
      id: `p-${key}-${(counter += 1)}`,
      key,
      position: PHASE_KEYS.indexOf(key) + 1,
      current_round: rounds[rounds.length - 1]?.number ?? 1,
      rounds,
    };
  });

const song = (id: string, title: string, over: Partial<Song> = {}): Song => ({
  id,
  title,
  artist: 'Sarah Kane',
  genre: 'Indie',
  bpm: 112,
  musical_key: 'A minor',
  deadline: null,
  notes: '',
  position: Number(id.slice(1)),
  archived_at: null,
  ...over,
});

const auth = {
  status: 'signed-in',
  session: { user: { id: 'user-1', email: 'ben@example.com' } },
  client: {} as SupabaseClient,
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
} as unknown as Auth;

const renderPage = () =>
  render(
    <MemoryRouter>
      <AuthContext value={auth}>
        <DashboardPage />
      </AuthContext>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.mocked(data.listSongs).mockResolvedValue([
    song('s1', 'Midnight Drive'),
    song('s2', 'Fading Light'),
    song('s3', 'Ocean Eyes'),
    song('s4', 'Desert Road', { archived_at: '2026-08-01T10:00:00Z' }),
  ]);

  vi.mocked(data.listJourneys).mockResolvedValue(
    new Map([
      // Judged in the mix and not convincing: this is the one asking for you.
      [
        's1',
        journey({
          mix: [
            round({
              decisions: [decision('not_quite_there', '2026-08-18T21:00:00Z', 'Vocal sits in mix')],
            }),
          ],
        }),
      ],
      // Under way, nothing wanting.
      [
        's2',
        journey({ write: [round({ decisions: [decision('locked', '2026-08-10T21:00:00Z')] })] }),
      ],
      // Every phase signed off.
      [
        's3',
        journey(
          PHASE_KEYS.reduce<Partial<Record<(typeof PHASE_KEYS)[number], Round[]>>>(
            (all, key) => ({ ...all, [key]: [round({ closed_at: '2026-08-12T10:00:00Z' })] }),
            {},
          ),
        ),
      ],
      ['s4', journey()],
    ]),
  );

  vi.mocked(data.listNotes).mockResolvedValue(
    new Map([
      [
        's1',
        [
          {
            id: 'n1',
            body: 'Snare needs another round',
            created_at: '2026-08-17T10:00:00Z',
            origin_phase: 'track',
            target_phase: 'mix',
            for_next_song: false,
            resolved_at: null,
          },
        ],
      ],
    ]),
  );
});

describe('the dashboard', () => {
  it('greets you and says what it is for', async () => {
    renderPage();
    expect(
      await screen.findByRole('heading', { level: 1, name: /^Welcome back/ }),
    ).toBeInTheDocument();
  });

  it('shows no song-wide percentage anywhere', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 1, name: /^Welcome back/ });
    // The rule that survived the rebuild. The bar on a card is a picture; the
    // figure beside it is counted.
    expect(document.body.textContent).not.toMatch(/\d+\s?%/);
    expect(screen.getByText('0 / 1 decisions made')).toBeInTheDocument();
  });

  it('counts what is live, what wants you and what is finished', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 1, name: /^Welcome back/ });

    const tiles = screen.getAllByRole('button', { name: /Songs|works|take|Finished/i });
    const active = tiles.find((one) => one.textContent?.includes('Songs'));
    expect(active?.textContent).toContain('3');
    expect(active?.textContent).toContain('1 set aside');

    const attention = tiles.find((one) => one.textContent?.includes('Needs a take'));
    expect(attention?.textContent).toContain('1');
  });

  it('keeps archived songs out of every view but their own', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { level: 1, name: /^Welcome back/ });

    expect(screen.queryByRole('heading', { name: 'Desert Road' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Set aside' }));
    expect(screen.getByRole('heading', { name: 'Desert Road' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Midnight Drive' })).toBeNull();
  });

  it('filters from a summary card, not only from the chips', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { level: 1, name: /^Welcome back/ });

    const attention = screen
      .getAllByRole('button')
      .find((one) => one.textContent?.includes('Needs a take'));
    await user.click(attention as HTMLElement);

    expect(screen.getByRole('heading', { name: 'Midnight Drive' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Fading Light' })).toBeNull();
  });

  it('searches over the title, the artist and the sound of a song', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { level: 1, name: /^Welcome back/ });

    await user.type(screen.getByPlaceholderText('Search songs'), 'ocean');
    expect(screen.getByRole('heading', { name: 'Ocean Eyes' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Midnight Drive' })).toBeNull();
    expect(screen.getByText('1 of 4 songs')).toBeInTheDocument();
  });

  it('offers a way out when a filter leaves nothing', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { level: 1, name: /^Welcome back/ });

    await user.type(screen.getByPlaceholderText('Search songs'), 'nothing like this');
    await user.click(screen.getByRole('button', { name: 'Clear the filters' }));
    expect(screen.getByRole('heading', { name: 'Midnight Drive' })).toBeInTheDocument();
  });

  it('reorders the list, and by what is decided rather than by a share of it', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { level: 1, name: /^Welcome back/ });

    await user.selectOptions(screen.getByLabelText('Sort'), 'title');
    const titles = () => screen.getAllByRole('heading', { level: 3 }).map((one) => one.textContent);
    expect(titles()).toEqual(['Fading Light', 'Midnight Drive', 'Ocean Eyes']);

    await user.selectOptions(screen.getByLabelText('Sort'), 'decided');
    // Ocean Eyes has seven signed-off but empty rounds, so nothing is settled
    // in it; Fading Light has one locked decision.
    expect(titles()[0]).toBe('Fading Light');
  });

  it('gives every song its seven phases, each one named and stated', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 1, name: /^Welcome back/ });

    const phases = screen.getByRole('list', { name: 'Journey of Midnight Drive' });
    expect(within(phases).getAllByRole('listitem')).toHaveLength(7);
    // The colour is never the only thing saying what a dot is.
    expect(within(phases).getByRole('link', { name: 'Mix: Not quite there' })).toHaveAttribute(
      'href',
      '/songs/s1/mix',
    );
    expect(within(phases).getByRole('link', { name: 'Capture: Not touched' })).toBeInTheDocument();
  });

  it('names one next take, and only one', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 1, name: /^Welcome back/ });

    const take = screen.getByRole('region', { name: 'Your next take' });
    // Judged and unconvincing beats everything merely unstarted: it is the
    // thing you already know is wrong.
    expect(within(take).getByText('Vocal sits in mix')).toBeInTheDocument();
    expect(within(take).getByText('Midnight Drive', { exact: false })).toBeInTheDocument();
    expect(within(take).getByRole('link', { name: /Back to mixing/ })).toHaveAttribute(
      'href',
      '/songs/s1/mix',
    );
  });

  it('builds the activity out of judgements, notes and closed rounds', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 1, name: /^Welcome back/ });

    const feed = screen.getByRole('region', { name: 'Recent activity' });
    expect(
      within(feed).getByText(/You judged "Vocal sits in mix" in Midnight Drive/),
    ).toBeInTheDocument();
    expect(within(feed).getByText(/You added a note in Midnight Drive/)).toBeInTheDocument();
    expect(
      within(feed).getByText(/You closed the Capture check in Ocean Eyes/),
    ).toBeInTheDocument();
  });

  it('says how many songs are at each stage, in words as well as in a ring', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 1, name: /^Welcome back/ });

    const stages = screen.getByRole('region', { name: 'Songs by stage' });
    // Ocean Eyes has no judgement at all, so it counts as capture.
    expect(within(stages).getByText('Capture')).toBeInTheDocument();
    expect(within(stages).getByText('Mix')).toBeInTheDocument();
  });

  it('counts decisions made, and never calls them points', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 1, name: /^Welcome back/ });

    const credits = screen.getByRole('region', { name: 'Decision log' });
    expect(within(credits).getByText('decisions made')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\bXP\b|points|streak|level/i);
  });
});

describe('adding a song', () => {
  it('asks for a title and nothing else, then shows it without a reload', async () => {
    const user = userEvent.setup();
    vi.mocked(data.createSong).mockResolvedValue(song('s5', 'New One', { genre: null, bpm: null }));
    renderPage();
    await screen.findByRole('heading', { level: 1, name: /^Welcome back/ });

    await user.click(screen.getByRole('button', { name: 'New song' }));
    const dialog = screen.getByRole('dialog', { name: 'What are we making?' });

    expect(within(dialog).getByRole('button', { name: 'Create song' })).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Title'), 'New One');
    await user.type(within(dialog).getByLabelText('BPM'), '128');
    await user.click(within(dialog).getByRole('button', { name: 'Create song' }));

    await waitFor(() => {
      expect(data.createSong).toHaveBeenCalledWith(auth.client, {
        title: 'New One',
        artist: '',
        ownerId: 'user-1',
        genre: '',
        bpm: 128,
        musicalKey: '',
      });
    });
    expect(await screen.findByRole('heading', { name: 'New One' })).toBeInTheDocument();
  });

  it('closes on Escape without saving', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { level: 1, name: /^Welcome back/ });

    await user.click(screen.getByRole('button', { name: 'New song' }));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(data.createSong).not.toHaveBeenCalled();
  });

  it('reports a refused save without losing what was typed', async () => {
    const user = userEvent.setup();
    vi.mocked(data.createSong).mockRejectedValue(new Error('permission denied'));
    renderPage();
    await screen.findByRole('heading', { level: 1, name: /^Welcome back/ });

    await user.click(screen.getByRole('button', { name: 'New song' }));
    const dialog = screen.getByRole('dialog', { name: 'What are we making?' });
    await user.type(within(dialog).getByLabelText('Title'), 'Doomed');
    await user.click(within(dialog).getByRole('button', { name: 'Create song' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('permission denied');
    expect(within(dialog).getByLabelText('Title')).toHaveValue('Doomed');
  });
});

describe('when nothing loads', () => {
  it('says so and offers to try again', async () => {
    const user = userEvent.setup();
    vi.mocked(data.listSongs).mockRejectedValueOnce(new Error('network is down'));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('network is down');

    vi.mocked(data.listSongs).mockResolvedValue([song('s1', 'Midnight Drive')]);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Midnight Drive' })).toBeInTheDocument();
  });

  it('says what to do when there are no songs at all', async () => {
    vi.mocked(data.listSongs).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('Nothing here yet.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Add your first song/ }).length).toBeGreaterThan(
      0,
    );
  });
});

describe('the figures and the filters', () => {
  /**
   * The invariant worth pinning: a tile is a question and its filter is the
   * answer. If the two ever disagree, one of them is lying, and there is no way
   * to tell from the screen which.
   */
  it.each([
    ['In the works', 'In the works'],
    ['Needs a take', 'Needs a take'],
    ['Finished', 'Finished'],
  ])('shows exactly as many songs under %s as the tile claims', async (tileText, chipName) => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { level: 1, name: /^Welcome back/ });

    const tile = screen.getAllByRole('button').find((one) => one.textContent?.includes(tileText));
    const claimed = Number(/\d+/.exec(tile?.textContent ?? '')?.[0] ?? '-1');

    await user.click(screen.getByRole('button', { name: chipName }));
    const list = screen.queryByRole('list', { name: 'Your songs' });
    expect(list === null ? 0 : within(list).queryAllByRole('heading', { level: 3 })).toHaveLength(
      claimed,
    );
  });
});
