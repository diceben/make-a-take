import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SongsPage } from './SongsPage';
import { AuthContext, type Auth } from '../auth/auth-context';
import { PHASES, TRACKS, type PhaseState, type StepStatus, type TrackState } from '../../lib/model';
import * as data from '../../lib/data';

vi.mock('../../lib/data');

const phases = (overrides: Partial<Record<string, StepStatus>> = {}): PhaseState[] =>
  PHASES.map((phase) => ({
    id: `p-${phase}`,
    song_id: 's1',
    phase,
    status: overrides[phase] ?? 'todo',
    note: '',
  }));

const tracks = (status: StepStatus = 'todo'): TrackState[] =>
  TRACKS.map((track) => ({ id: `t-${track}`, song_id: 's1', track, status, note: '' }));

const song = (id: string, title: string, projectId: string, phaseOverrides = {}) => ({
  id,
  project_id: projectId,
  title,
  artist: null,
  deadline: null,
  notes: '',
  position: 0,
  phase_states: phases(phaseOverrides),
  track_states: tracks(),
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
    <MemoryRouter>
      <AuthContext value={auth}>
        <SongsPage />
      </AuthContext>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.mocked(data.listProjects).mockResolvedValue([
    { id: 'proj-1', name: 'Debut EP', artist: null, deadline: null },
  ]);
  vi.mocked(data.listSongs).mockResolvedValue([
    song('s1', 'Opening Track', 'proj-1', { writing: 'done', arrangement: 'done' }),
    song('s2', 'The Slow One', 'proj-1'),
  ]);
});

describe('SongsPage', () => {
  it('lists the songs of each project', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Debut EP' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Opening Track' })).toHaveAttribute(
      'href',
      '/songs/s1',
    );
    expect(screen.getByRole('link', { name: 'The Slow One' })).toBeInTheDocument();
  });

  it('shows weighted progress, not a count of finished steps', async () => {
    renderPage();
    // writing (10) and arrangement (10) of 100 total
    const bar = await screen.findByRole('progressbar', { name: 'Progress of Opening Track' });
    expect(bar).toHaveAttribute('aria-valuenow', '20');

    const untouched = screen.getByRole('progressbar', { name: 'Progress of The Slow One' });
    expect(untouched).toHaveAttribute('aria-valuenow', '0');
  });

  it('names the phase each song is sitting on', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Opening Track' });
    expect(screen.getByText('Pre-production')).toBeInTheDocument();
  });

  it('says so when a project has no songs', async () => {
    vi.mocked(data.listSongs).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('No songs in here yet.')).toBeInTheDocument();
  });

  it('adds a project and shows it without a reload', async () => {
    const user = userEvent.setup();
    vi.mocked(data.createProject).mockResolvedValue({
      id: 'proj-2',
      name: 'Second Record',
      artist: null,
      deadline: null,
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Debut EP' });

    await user.type(screen.getByPlaceholderText('Project name'), 'Second Record');
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    expect(await screen.findByRole('heading', { name: 'Second Record' })).toBeInTheDocument();
    expect(data.createProject).toHaveBeenCalledWith(auth.client, {
      name: 'Second Record',
      ownerId: 'user-1',
    });
  });

  it('adds a song to the right project', async () => {
    const user = userEvent.setup();
    vi.mocked(data.createSong).mockResolvedValue(song('s3', 'Third Song', 'proj-1'));
    renderPage();
    await screen.findByRole('heading', { name: 'Debut EP' });

    await user.type(screen.getByPlaceholderText('Song title'), 'Third Song');
    await user.click(screen.getByRole('button', { name: 'Add song' }));

    expect(await screen.findByRole('link', { name: 'Third Song' })).toBeInTheDocument();
    expect(data.createSong).toHaveBeenCalledWith(auth.client, {
      projectId: 'proj-1',
      title: 'Third Song',
    });
  });

  it('will not submit an empty title', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Debut EP' });
    expect(screen.getByRole('button', { name: 'Add song' })).toBeDisabled();
  });

  it('reports a failed load and offers to retry', async () => {
    const user = userEvent.setup();
    vi.mocked(data.listProjects).mockRejectedValueOnce(new Error('network is down'));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('network is down');

    vi.mocked(data.listProjects).mockResolvedValue([
      { id: 'proj-1', name: 'Debut EP', artist: null, deadline: null },
    ]);
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: 'Debut EP' })).toBeInTheDocument();
  });

  it('reports a failed save without losing what was typed', async () => {
    const user = userEvent.setup();
    vi.mocked(data.createSong).mockRejectedValue(new Error('permission denied'));
    renderPage();
    await screen.findByRole('heading', { name: 'Debut EP' });

    const field = screen.getByPlaceholderText('Song title');
    await user.type(field, 'Doomed Song');
    await user.click(screen.getByRole('button', { name: 'Add song' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('permission denied')).toBeInTheDocument();
    await waitFor(() => {
      expect(field).toHaveValue('Doomed Song');
    });
  });
});
