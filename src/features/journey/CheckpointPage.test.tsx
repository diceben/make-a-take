import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CheckpointPage } from './CheckpointPage';
import { AuthContext, type Auth } from '../auth/auth-context';
import {
  PHASE_KEYS,
  type Decision,
  type DecisionState,
  type Phase,
  type Round,
} from '../../lib/journey';
import * as data from '../../lib/data';

vi.mock('../../lib/data');

let counter = 0;

const decision = (title: string, state: DecisionState = 'not_touched', extra = {}): Decision => ({
  id: `d-${(counter += 1)}`,
  title,
  subtitle: null,
  position: counter,
  state,
  state_set_at: state === 'not_touched' ? null : '2026-08-10T21:00:00Z',
  state_confirmed_at: null,
  steps: [],
  ...extra,
});

const round = (over: Partial<Round> = {}): Round => ({
  id: 'round-mix-1',
  number: 1,
  opened_at: '2026-08-01T10:00:00Z',
  closed_at: null,
  reopen_reason: null,
  decisions: [],
  ...over,
});

const phase = (key: (typeof PHASE_KEYS)[number], rounds: Round[], current = 1): Phase => ({
  id: `phase-${key}`,
  key,
  position: PHASE_KEYS.indexOf(key) + 1,
  current_round: current,
  rounds,
});

const auth = {
  status: 'signed-in',
  session: { user: { id: 'user-1' } },
  client: {} as SupabaseClient,
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
} as unknown as Auth;

const renderAt = (path = '/songs/s1/mix/check') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthContext value={auth}>
        <Routes>
          <Route path="/songs/:id/:phase/check" element={<CheckpointPage />} />
          <Route path="/songs/:id/:phase" element={<h1>The phase</h1>} />
        </Routes>
      </AuthContext>
    </MemoryRouter>,
  );

const withRounds = (rounds: Round[], current = 1) => {
  vi.mocked(data.getJourney).mockResolvedValue({
    phases: [phase('mix', rounds, current)],
    notes: [],
  });
};

beforeEach(() => {
  vi.mocked(data.getSong).mockResolvedValue({
    id: 's1',
    title: 'Midnight Drive',
    artist: 'Sarah Kane',
    deadline: null,
    genre: 'Indie',
    bpm: 112,
    musical_key: 'A minor',
    notes: '',
    position: 0,
    archived_at: null,
  });
  withRounds([
    round({
      decisions: [
        decision('Static balance', 'locked'),
        decision('Vocal compression', 'not_quite_there'),
        decision('Automation pass'),
      ],
    }),
  ]);
});

describe('the check on an open round', () => {
  it('says what the round has cost so far', async () => {
    renderAt();
    await screen.findByRole('heading', { level: 1, name: 'Mix check' });

    expect(screen.getByText(/Round 1/)).toBeInTheDocument();
    expect(screen.getByText(/1 sitting/)).toBeInTheDocument();
    expect(screen.getByText('1 of 3 decisions locked')).toBeInTheDocument();
  });

  it('asks three things about each decision, and writes none of them yet', async () => {
    const user = userEvent.setup();
    vi.mocked(data.setDecisionState).mockResolvedValue(decision('Automation pass', 'locked'));
    renderAt();
    await screen.findByRole('heading', { level: 1, name: 'Mix check' });

    const list = screen.getByRole('list', { name: 'Decisions to call' });
    // Everything in the round, locked ones included — they are the ground held.
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(within(list).getByText('Locked')).toBeInTheDocument();

    const vocal = within(list).getByRole('group', { name: 'Your call on Vocal compression' });
    await user.click(within(vocal).getByRole('button', { name: /Keep/ }));

    // The point of a sitting is that nothing lands until you say so.
    expect(data.setDecisionState).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Lock 1 decision' })).toBeEnabled();
  });

  it('commits the whole sitting at once, and says what it will do first', async () => {
    const user = userEvent.setup();
    vi.mocked(data.setDecisionState).mockResolvedValue(decision('Automation pass', 'locked'));
    renderAt();
    await screen.findByRole('heading', { level: 1, name: 'Mix check' });

    const list = screen.getByRole('list', { name: 'Decisions to call' });
    const vocal = within(list).getByRole('group', { name: 'Your call on Vocal compression' });
    const auto = within(list).getByRole('group', { name: 'Your call on Automation pass' });

    await user.click(within(vocal).getByRole('button', { name: /Rework/ }));
    await user.click(within(auto).getByRole('button', { name: /Keep/ }));

    expect(screen.getByRole('button', { name: 'Lock 1, send 1 back' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Lock 1, send 1 back' }));

    await waitFor(() => {
      expect(data.setDecisionState).toHaveBeenCalledTimes(2);
    });
    expect(data.setDecisionState).toHaveBeenCalledWith(auth.client, expect.any(String), 'locked');
    expect(data.setDecisionState).toHaveBeenCalledWith(
      auth.client,
      expect.any(String),
      'not_quite_there',
    );
  });

  it('writes nothing at all for a decision you are not sure about', async () => {
    const user = userEvent.setup();
    renderAt();
    await screen.findByRole('heading', { level: 1, name: 'Mix check' });

    const list = screen.getByRole('list', { name: 'Decisions to call' });
    const vocal = within(list).getByRole('group', { name: 'Your call on Vocal compression' });
    await user.click(within(vocal).getByRole('button', { name: /Not sure/ }));

    // "Not sure" is a way of moving past something, not a state to go into, so
    // there is nothing to commit and the button stays out of reach.
    expect(screen.getByRole('button', { name: 'Make a call first' })).toBeDisabled();
  });

  it('takes a call back when the same one is pressed again', async () => {
    const user = userEvent.setup();
    renderAt();
    await screen.findByRole('heading', { level: 1, name: 'Mix check' });

    const list = screen.getByRole('list', { name: 'Decisions to call' });
    const vocal = within(list).getByRole('group', { name: 'Your call on Vocal compression' });
    const keep = within(vocal).getByRole('button', { name: /Keep/ });

    await user.click(keep);
    expect(keep).toHaveAttribute('aria-pressed', 'true');
    await user.click(keep);
    expect(keep).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Make a call first' })).toBeDisabled();
  });

  it('never refuses to close — it only says what closing would leave open', async () => {
    const user = userEvent.setup();
    vi.mocked(data.closeRound).mockResolvedValue('2026-08-13T10:00:00Z');
    renderAt();
    await screen.findByRole('heading', { level: 1, name: 'Mix check' });

    const button = screen.getByRole('button', { name: 'Close it anyway — 2 still open' });
    expect(button).toBeEnabled();

    await user.click(button);
    await waitFor(() => {
      expect(data.closeRound).toHaveBeenCalledWith(auth.client, 'round-mix-1');
    });
  });

  it('changes the words on the button when nothing is left open', async () => {
    withRounds([round({ decisions: [decision('Static balance', 'locked')] })]);
    renderAt();
    await screen.findByRole('heading', { level: 1, name: 'Mix check' });

    expect(screen.getByRole('button', { name: 'Close this round' })).toBeInTheDocument();
  });

  it('names what was judged well but heard only once', async () => {
    withRounds([
      round({
        decisions: [decision('Static balance', 'locked'), decision('Vocal sits in mix')],
      }),
    ]);
    renderAt();
    await screen.findByRole('heading', { level: 1, name: 'Mix check' });

    const once = screen.getByRole('heading', { name: 'Heard once' }).closest('section');
    expect(within(once as HTMLElement).getByText('Static balance')).toBeInTheDocument();
  });

  it('closes a phase that has nothing in it, without calling it unfinished', async () => {
    const user = userEvent.setup();
    withRounds([round()]);
    vi.mocked(data.closeRound).mockResolvedValue('2026-08-13T10:00:00Z');
    renderAt();
    await screen.findByRole('heading', { level: 1, name: 'Mix check' });

    expect(screen.getByRole('heading', { name: 'Nothing to decide here' })).toBeInTheDocument();
    // Not "0 still open": nothing is open, there is simply nothing there.
    await user.click(screen.getByRole('button', { name: 'Close this round' }));

    await waitFor(() => {
      expect(data.closeRound).toHaveBeenCalledWith(auth.client, 'round-mix-1');
    });
  });

  it('shows no percentage', async () => {
    renderAt();
    await screen.findByRole('heading', { level: 1, name: 'Mix check' });
    expect(document.body.textContent).not.toMatch(/\d+\s?%/);
  });
});

describe('the check on a closed round', () => {
  beforeEach(() => {
    withRounds([
      round({
        closed_at: '2026-08-09T10:00:00Z',
        decisions: [decision('Static balance', 'locked'), decision('Automation pass')],
      }),
    ]);
  });

  it('reports the pass rather than offering to close it again', async () => {
    renderAt();
    await screen.findByRole('heading', { level: 1, name: 'Mix check' });

    expect(screen.getByText(/Round 1 closed/)).toBeInTheDocument();
    expect(screen.getByText(/1 of 2 decisions locked/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Close/ })).toBeNull();

    const left = screen.getByRole('heading', { name: 'Left open' }).closest('section');
    expect(within(left as HTMLElement).getByText('Automation pass')).toBeInTheDocument();
  });

  it('asks what sent you back before opening the next round', async () => {
    const user = userEvent.setup();
    vi.mocked(data.reopenPhase).mockResolvedValue(undefined);
    renderAt();
    await screen.findByRole('heading', { level: 1, name: 'Mix check' });

    await user.click(screen.getByRole('button', { name: 'Go back in — start round 2' }));
    await user.type(screen.getByLabelText('What sent you back?'), 'Low end fell apart in the car');
    await user.click(screen.getByRole('button', { name: 'Start round 2' }));

    await waitFor(() => {
      expect(data.reopenPhase).toHaveBeenCalledWith(
        auth.client,
        { id: 'phase-mix', current_round: 1 },
        'Low end fell apart in the car',
      );
    });
  });

  it('carries the reason of the round being read', async () => {
    withRounds(
      [
        round({ id: 'r1', closed_at: '2026-08-05T10:00:00Z' }),
        round({
          id: 'r2',
          number: 2,
          opened_at: '2026-08-06T10:00:00Z',
          reopen_reason: 'The low end fell apart in the car',
          decisions: [decision('Low-end check')],
        }),
      ],
      2,
    );
    renderAt();
    await screen.findByRole('heading', { level: 1, name: 'Mix check' });

    expect(
      screen.getByText('Reopened because: The low end fell apart in the car'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Round 2/)).toBeInTheDocument();
  });
});

describe('an address that means nothing', () => {
  it('says so instead of showing an empty check', async () => {
    renderAt('/songs/s1/nonsense/check');
    expect(await screen.findByRole('alert')).toHaveTextContent('There is no checkpoint here');
  });
});
