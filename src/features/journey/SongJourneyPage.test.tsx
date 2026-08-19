import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SongJourneyPage } from './SongJourneyPage';
import { AuthContext, type Auth } from '../auth/auth-context';
import { PHASE_KEYS, type Decision, type DecisionState, type Phase } from '../../lib/journey';
import * as data from '../../lib/data';

vi.mock('../../lib/data');

/**
 * The acceptance criteria the browser is answerable for. The database half —
 * confirmation only on a later day, a round leaving the one before it whole —
 * lives in supabase/tests/decisions.test.sql.
 */

let counter = 0;
const id = () => `id-${(counter += 1)}`;

const decision = (title: string, state: DecisionState = 'not_touched', extra = {}): Decision => ({
  id: id(),
  title,
  subtitle: null,
  position: 0,
  state,
  state_set_at: state === 'not_touched' ? null : '2026-08-10T21:00:00Z',
  state_confirmed_at: null,
  steps: [],
  ...extra,
});

const phase = (key: (typeof PHASE_KEYS)[number], decisions: Decision[] = [], round = 1): Phase => ({
  id: `phase-${key}`,
  key,
  position: PHASE_KEYS.indexOf(key) + 1,
  current_round: round,
  rounds: [{ id: `round-${key}`, number: round, closed_at: null, decisions }],
});

const auth = {
  status: 'signed-in',
  session: { user: { id: 'user-1' } },
  client: {} as SupabaseClient,
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
} as unknown as Auth;

const renderAt = (path = '/songs/s1') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthContext value={auth}>
        <Routes>
          <Route path="/songs/:id" element={<SongJourneyPage />} />
          <Route path="/songs/:id/:phase" element={<SongJourneyPage />} />
          <Route path="/" element={<h1>Your songs</h1>} />
        </Routes>
      </AuthContext>
    </MemoryRouter>,
  );

// Staggered on purpose: which phase is in hand is decided by which judgement
// is the most recent, so identical stamps would decide nothing.
const vocal = decision('Vocal sits in mix', 'not_quite_there', {
  state_set_at: '2026-08-12T21:00:00Z',
});
const automation = decision('Automation pass');

beforeEach(() => {
  vi.mocked(data.getSong).mockResolvedValue({
    id: 's1',
    title: 'Midnight Drive',
    artist: 'Sarah Kane',
    deadline: null,
    notes: '',
    position: 0,
    phase_states: [],
    track_states: [],
  });
  vi.mocked(data.getJourney).mockResolvedValue({
    phases: [
      phase('capture'),
      phase('write', [decision('Structure', 'locked', { state_set_at: '2026-08-10T21:00:00Z' })]),
      phase('produce'),
      phase('track', [decision('Drums', 'feels_right', { state_set_at: '2026-08-11T21:00:00Z' })]),
      phase('edit'),
      phase('mix', [vocal, automation], 2),
      phase('master'),
    ],
    notes: [
      {
        id: 'n1',
        body: 'Snare needs another round',
        created_at: '2026-08-14T10:00:00Z',
        origin_phase: 'track',
        target_phase: 'mix',
        for_next_song: false,
        resolved_at: null,
      },
    ],
  });
});

describe('the song journey', () => {
  it('shows no percentage anywhere', async () => {
    renderAt();
    await screen.findByRole('heading', { level: 1, name: 'Midnight Drive' });
    expect(document.body.textContent).not.toMatch(/\d+\s?%/);
  });

  it('opens where the last judgement was made, not at the first unfinished phase', async () => {
    renderAt();
    // Write and track are untouched-first by position; the mix holds the most
    // recent judgement, so that is the phase in hand.
    expect(await screen.findByRole('heading', { level: 2, name: 'Mix' })).toBeInTheDocument();
  });

  it('names what is open instead of how far along it is', async () => {
    renderAt();
    await screen.findByRole('heading', { level: 1, name: 'Midnight Drive' });
    const open = screen.getByText('Open:').closest('p');
    expect(
      within(open as HTMLElement).getByRole('link', { name: 'Vocal sits in mix' }),
    ).toBeInTheDocument();
  });

  it('lets every phase be opened, whatever has happened in the others', async () => {
    const user = userEvent.setup();
    renderAt();
    await screen.findByRole('heading', { level: 2, name: 'Mix' });

    await user.click(screen.getByRole('link', { name: /Master/ }));
    expect(screen.getByRole('heading', { level: 2, name: 'Master' })).toBeInTheDocument();
  });

  it('shows a note only in the phase it was aimed at', async () => {
    const user = userEvent.setup();
    renderAt();
    await screen.findByRole('heading', { level: 2, name: 'Mix' });

    expect(screen.getByText('Waiting for you in Mix')).toBeInTheDocument();
    expect(screen.getByText('Snare needs another round')).toBeInTheDocument();

    // It was written in tracking, and it is not there.
    await user.click(screen.getByRole('link', { name: /Track/ }));
    expect(screen.queryByText('Snare needs another round')).toBeNull();
  });

  it('says which round the phase is on, and counts what is locked', async () => {
    renderAt();
    await screen.findByRole('heading', { level: 2, name: 'Mix' });
    expect(screen.getByText(/round 2/)).toBeInTheDocument();
    expect(screen.getByText(/0 of 2 locked/)).toBeInTheDocument();
  });

  it('counts the song without a percentage', async () => {
    renderAt();
    await screen.findByRole('heading', { level: 1, name: 'Midnight Drive' });
    expect(screen.getByText(/1 decisions locked · 1 reopened/)).toBeInTheDocument();
  });
});

describe('the judgement picker', () => {
  it('opens only on a click, and shows every definition', async () => {
    const user = userEvent.setup();
    renderAt();
    await screen.findByRole('heading', { level: 2, name: 'Mix' });

    const badge = screen.getByRole('button', { name: 'Vocal sits in mix: Not quite there' });
    expect(badge).toHaveAttribute('aria-expanded', 'false');

    await user.hover(badge);
    expect(badge).toHaveAttribute('aria-expanded', 'false');

    await user.click(badge);
    expect(badge).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('I would play it to someone like this')).toBeInTheDocument();
    expect(screen.getByText('I would not touch it again, even with time')).toBeInTheDocument();
  });

  it('sets a stage with a number key', async () => {
    const user = userEvent.setup();
    vi.mocked(data.setDecisionState).mockResolvedValue({ ...vocal, state: 'locked' });
    renderAt();
    await screen.findByRole('heading', { level: 2, name: 'Mix' });

    await user.click(screen.getByRole('button', { name: 'Vocal sits in mix: Not quite there' }));
    await user.keyboard('5');

    await waitFor(() => {
      expect(data.setDecisionState).toHaveBeenCalledWith(auth.client, vocal.id, 'locked');
    });
  });

  it('closes on Escape without changing anything, and gives the badge back the focus', async () => {
    const user = userEvent.setup();
    renderAt();
    await screen.findByRole('heading', { level: 2, name: 'Mix' });

    const badge = screen.getByRole('button', { name: 'Vocal sits in mix: Not quite there' });
    await user.click(badge);
    await user.keyboard('{Escape}');

    expect(badge).toHaveAttribute('aria-expanded', 'false');
    expect(badge).toHaveFocus();
    expect(data.setDecisionState).not.toHaveBeenCalled();
  });

  it('says when a judgement was set, and that it was one of several that evening', async () => {
    const user = userEvent.setup();
    renderAt();
    await screen.findByRole('heading', { level: 2, name: 'Mix' });

    await user.click(screen.getByRole('button', { name: 'Vocal sits in mix: Not quite there' }));
    expect(screen.getByText(/^Set 12 Aug/)).toBeInTheDocument();
  });

  it('marks a judgement nobody has met a second time', async () => {
    renderAt('/songs/s1/track');
    await screen.findByRole('heading', { level: 2, name: 'Track' });

    // Scoped to the list: the sidebar carries the same words for the phases
    // that hold one, which is the point of it.
    const decisions = screen.getByRole('list', { name: 'Decisions' });
    expect(within(decisions).getByText('heard once')).toBeInTheDocument();
  });
});

describe('steps and judgements', () => {
  it('gives a decision with steps checkboxes, and the judgement a scale — never both on one thing', async () => {
    const user = userEvent.setup();
    const withSteps = decision('Vocal compression', 'direction_set', {
      steps: [
        { id: 'st1', label: 'Threshold', position: 0, done: true },
        { id: 'st2', label: 'Ratio', position: 1, done: false },
      ],
    });
    vi.mocked(data.getJourney).mockResolvedValue({
      phases: [phase('mix', [withSteps])],
      notes: [],
    });
    vi.mocked(data.setStepDone).mockResolvedValue(undefined);
    renderAt('/songs/s1/mix');
    await screen.findByRole('heading', { level: 2, name: 'Mix' });

    // The count is the way in; the checkboxes are not shown until asked for.
    expect(screen.queryByRole('checkbox')).toBeNull();
    await user.click(screen.getByRole('button', { name: '1 of 2 steps' }));

    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toBeChecked();

    // The decision itself carries no checkbox: it is judged, not ticked.
    expect(
      screen.getByRole('button', { name: 'Vocal compression: Direction set' }),
    ).toBeInTheDocument();

    await user.click(boxes[1] as HTMLElement);
    await waitFor(() => {
      expect(data.setStepDone).toHaveBeenCalledWith(auth.client, 'st2', true);
    });
  });
});
