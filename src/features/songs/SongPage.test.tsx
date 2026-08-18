import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SongPage } from './SongPage';
import { AuthContext, type Auth } from '../auth/auth-context';
import { PHASES, TRACKS, type SongWithSteps, type StepStatus } from '../../lib/model';
import * as data from '../../lib/data';

vi.mock('../../lib/data');

const makeSong = (overrides: Partial<Record<string, StepStatus>> = {}): SongWithSteps => ({
  id: 's1',
  title: 'Opening Track',
  artist: null,
  deadline: null,
  notes: '',
  position: 0,
  phase_states: PHASES.map((phase) => ({
    id: `p-${phase}`,
    song_id: 's1',
    phase,
    status: overrides[phase] ?? 'todo',
    note: '',
  })),
  track_states: TRACKS.map((track) => ({
    id: `t-${track}`,
    song_id: 's1',
    track,
    status: overrides[track] ?? 'todo',
    note: '',
  })),
});

const auth = {
  status: 'signed-in',
  session: { user: { id: 'user-1' } },
  client: {} as SupabaseClient,
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
} as unknown as Auth;

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/songs/s1']}>
      <AuthContext value={auth}>
        <Routes>
          <Route path="/songs/:id" element={<SongPage />} />
          <Route path="/" element={<h1>Your songs</h1>} />
        </Routes>
      </AuthContext>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.mocked(data.getSong).mockResolvedValue(makeSong());
  vi.mocked(data.setPhaseStatus).mockResolvedValue(undefined);
  vi.mocked(data.setTrackStatus).mockResolvedValue(undefined);
  vi.mocked(data.setSongNotes).mockResolvedValue(undefined);
  vi.mocked(data.setSongTitle).mockResolvedValue(undefined);
  vi.mocked(data.deleteSong).mockResolvedValue(undefined);
});

describe('SongPage', () => {
  it('shows every phase and every track', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Opening Track' });

    for (const label of ['Writing', 'Arrangement', 'Pre-production', 'Mixing', 'Mastering']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    for (const label of ['Drums', 'Bass', 'Guitars', 'Keys', 'Lead vocals', 'Backing vocals']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('offers no status picker for tracking, which is derived from the tracks', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Opening Track' });

    expect(screen.getByText(/from the tracks below/)).toBeInTheDocument();
    // Six tracks plus six phases that carry their own status — tracking has none.
    expect(screen.getAllByRole('radiogroup').length).toBe(PHASES.length - 1 + TRACKS.length);
  });

  it('updates the bar as soon as a phase is set, before the server answers', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Opening Track' });

    const bar = screen.getByRole('progressbar', { name: 'Progress of Opening Track' });
    expect(bar).toHaveAttribute('aria-valuenow', '0');

    const writing = screen.getByRole('radiogroup', { name: 'Writing' });
    await user.click(within(writing).getByRole('radio', { name: /Done/ }));

    expect(bar).toHaveAttribute('aria-valuenow', '10');
    expect(data.setPhaseStatus).toHaveBeenCalledWith(auth.client, 'p-writing', 'done');
  });

  it('moves tracking forward when a track is finished', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Opening Track' });

    const drums = screen.getByRole('radiogroup', { name: 'Drums' });
    await user.click(within(drums).getByRole('radio', { name: /Done/ }));

    // one of six tracks, tracking is worth 30 -> 5% of the song
    expect(screen.getByRole('progressbar', { name: 'Progress of Opening Track' })).toHaveAttribute(
      'aria-valuenow',
      '5',
    );
    expect(data.setTrackStatus).toHaveBeenCalledWith(auth.client, 't-drums', 'done');
  });

  it('rolls the change back and says so when the write fails', async () => {
    const user = userEvent.setup();
    vi.mocked(data.setPhaseStatus).mockRejectedValue(new Error('permission denied'));
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Opening Track' });

    const mixing = screen.getByRole('radiogroup', { name: 'Mixing' });
    await user.click(within(mixing).getByRole('radio', { name: /Done/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('permission denied');
    await waitFor(() => {
      expect(
        screen.getByRole('progressbar', { name: 'Progress of Opening Track' }),
      ).toHaveAttribute('aria-valuenow', '0');
    });
    expect(within(mixing).getByRole('radio', { name: /To do/ })).toBeChecked();
  });

  it('resets a phase that has been carried too far', async () => {
    const user = userEvent.setup();
    vi.mocked(data.getSong).mockResolvedValue(makeSong({ writing: 'done' }));
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Opening Track' });

    const bar = screen.getByRole('progressbar', { name: 'Progress of Opening Track' });
    expect(bar).toHaveAttribute('aria-valuenow', '10');

    await user.click(screen.getByRole('button', { name: 'Reset Writing' }));

    expect(bar).toHaveAttribute('aria-valuenow', '0');
    expect(data.setPhaseStatus).toHaveBeenCalledWith(auth.client, 'p-writing', 'todo');
  });

  it('offers no reset on a phase that is already back at the start', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Opening Track' });
    expect(screen.getByRole('button', { name: 'Reset Mixing' })).toBeDisabled();
  });

  it('resets tracking by resetting all six tracks in one write', async () => {
    const user = userEvent.setup();
    vi.mocked(data.setTrackStatuses).mockResolvedValue(undefined);
    vi.mocked(data.getSong).mockResolvedValue(makeSong({ drums: 'done', bass: 'review' }));
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Opening Track' });

    await user.click(screen.getByRole('button', { name: 'Reset Tracking' }));

    expect(data.setTrackStatuses).toHaveBeenCalledWith(
      auth.client,
      TRACKS.map((track) => `t-${track}`),
      'todo',
    );
    expect(screen.getByRole('progressbar', { name: 'Progress of Opening Track' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
  });

  it('rolls a failed tracking reset back', async () => {
    const user = userEvent.setup();
    vi.mocked(data.setTrackStatuses).mockRejectedValue(new Error('permission denied'));
    vi.mocked(data.getSong).mockResolvedValue(makeSong({ drums: 'done' }));
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Opening Track' });

    await user.click(screen.getByRole('button', { name: 'Reset Tracking' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('permission denied');
    const drums = screen.getByRole('radiogroup', { name: 'Drums' });
    await waitFor(() => {
      expect(within(drums).getByRole('radio', { name: /Done/ })).toBeChecked();
    });
  });

  it('names the phase the song is sitting on', async () => {
    vi.mocked(data.getSong).mockResolvedValue(
      makeSong({ writing: 'done', arrangement: 'done', preproduction: 'done' }),
    );
    renderPage();
    expect(await screen.findByText('Currently in Tracking')).toBeInTheDocument();
  });

  it('saves notes when the field loses focus, not on every keystroke', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Opening Track' });

    const notes = screen.getByLabelText(/Notes about/);
    await user.type(notes, 'Snare again');
    expect(data.setSongNotes).not.toHaveBeenCalled();

    await user.tab();
    await waitFor(() => {
      expect(data.setSongNotes).toHaveBeenCalledWith(auth.client, 's1', 'Snare again');
    });
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
  });

  it('renames the song in place', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Opening Track' });

    await user.click(screen.getByRole('button', { name: 'Edit Opening Track' }));
    const field = screen.getByLabelText('Song title');
    await user.clear(field);
    await user.type(field, 'Opening Track (take 2)');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Opening Track (take 2)' }),
    ).toBeInTheDocument();
    expect(data.setSongTitle).toHaveBeenCalledWith(auth.client, 's1', 'Opening Track (take 2)');
  });

  it('will not rename a song to nothing', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Opening Track' });

    await user.click(screen.getByRole('button', { name: 'Edit Opening Track' }));
    await user.clear(screen.getByLabelText('Song title'));

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('says so when a rename is refused, and keeps the field open', async () => {
    const user = userEvent.setup();
    vi.mocked(data.setSongTitle).mockRejectedValue(new Error('You may only be able to view this'));
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Opening Track' });

    await user.click(screen.getByRole('button', { name: 'Edit Opening Track' }));
    await user.type(screen.getByLabelText('Song title'), ' again');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('You may only be able to view this');
    expect(screen.getByLabelText('Song title')).toBeInTheDocument();
  });

  it('asks before deleting, and names what else goes', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Opening Track' });

    await user.click(screen.getByRole('button', { name: 'Delete this song' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Its seven phases and six tracks go with it',
    );
    expect(data.deleteSong).not.toHaveBeenCalled();
  });

  it('deletes the song and goes back to the list', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Opening Track' });

    await user.click(screen.getByRole('button', { name: 'Delete this song' }));
    await user.click(screen.getByRole('button', { name: 'Delete Opening Track' }));

    expect(data.deleteSong).toHaveBeenCalledWith(auth.client, 's1');
    expect(await screen.findByRole('heading', { name: 'Your songs' })).toBeInTheDocument();
  });

  it('leaves the song alone when the question is answered with Cancel', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Opening Track' });

    await user.click(screen.getByRole('button', { name: 'Delete this song' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(data.deleteSong).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Delete this song' })).toBeInTheDocument();
  });

  it('stays put and says so when the delete is refused', async () => {
    const user = userEvent.setup();
    vi.mocked(data.deleteSong).mockRejectedValue(new Error('Only its owner can delete it.'));
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Opening Track' });

    await user.click(screen.getByRole('button', { name: 'Delete this song' }));
    await user.click(screen.getByRole('button', { name: 'Delete Opening Track' }));

    expect(await screen.findByText('Only its owner can delete it.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Opening Track' })).toBeInTheDocument();
  });

  it('reports a song that cannot be loaded', async () => {
    vi.mocked(data.getSong).mockRejectedValue(new Error('not found'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('not found');
  });
});
