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

const song = (id: string, title: string, artist: string | null, phaseOverrides = {}) => ({
  id,
  title,
  artist,
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

/** The fields are behind a button now, so every test that types opens them. */
const openAddSong = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('button', { name: 'Add new song' }));
};

beforeEach(() => {
  vi.mocked(data.listSongs).mockResolvedValue([
    song('s1', 'Opening Track', 'Sarah Kane', { writing: 'done', arrangement: 'done' }),
    song('s2', 'The Slow One', 'Sarah Kane'),
  ]);
});

describe('SongsPage', () => {
  it('groups the songs under the artist they name', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Sarah Kane' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Opening Track' })).toHaveAttribute(
      'href',
      '/songs/s1',
    );
    expect(screen.getByRole('link', { name: 'The Slow One' })).toBeInTheDocument();
  });

  it('gathers songs without an artist at the end, under their own heading', async () => {
    vi.mocked(data.listSongs).mockResolvedValue([
      song('s0', 'Untitled Idea', null),
      song('s1', 'Opening Track', 'Sarah Kane'),
      song('s2', 'Another One', 'Bell Foundry'),
    ]);
    renderPage();
    await screen.findByRole('link', { name: 'Untitled Idea' });

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['Bell Foundry', 'Sarah Kane', 'No artist yet']);
  });

  it('treats an artist of only spaces as no artist at all', async () => {
    vi.mocked(data.listSongs).mockResolvedValue([song('s1', 'Opening Track', '   ')]);
    renderPage();
    expect(await screen.findByRole('heading', { name: 'No artist yet' })).toBeInTheDocument();
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
    // The phase filter offers the same word, so this asks for the row's cell.
    expect(
      screen.getByText('Pre-production', { selector: '.song-list__phase' }),
    ).toBeInTheDocument();
  });

  it('says so when there is nothing at all', async () => {
    vi.mocked(data.listSongs).mockResolvedValue([]);
    renderPage();
    expect(
      await screen.findByText('Nothing here yet. Write down the first one.'),
    ).toBeInTheDocument();
  });

  it('adds a song and shows it without a reload', async () => {
    const user = userEvent.setup();
    vi.mocked(data.createSong).mockResolvedValue(song('s3', 'Third Song', 'Sarah Kane'));
    renderPage();
    await screen.findByRole('heading', { name: 'Sarah Kane' });
    await openAddSong(user);

    await user.type(screen.getByPlaceholderText('Song title'), 'Third Song');
    await user.type(screen.getByPlaceholderText('Artist (optional)'), 'Sarah Kane');
    await user.click(screen.getByRole('button', { name: 'Add song' }));

    expect(await screen.findByRole('link', { name: 'Third Song' })).toBeInTheDocument();
    expect(data.createSong).toHaveBeenCalledWith(auth.client, {
      title: 'Third Song',
      artist: 'Sarah Kane',
      ownerId: 'user-1',
    });
  });

  it('adds a song without an artist', async () => {
    const user = userEvent.setup();
    vi.mocked(data.createSong).mockResolvedValue(song('s3', 'Nameless', null));
    renderPage();
    await screen.findByRole('heading', { name: 'Sarah Kane' });
    await openAddSong(user);

    await user.type(screen.getByPlaceholderText('Song title'), 'Nameless');
    await user.click(screen.getByRole('button', { name: 'Add song' }));

    expect(await screen.findByRole('heading', { name: 'No artist yet' })).toBeInTheDocument();
    expect(data.createSong).toHaveBeenCalledWith(auth.client, {
      title: 'Nameless',
      artist: '',
      ownerId: 'user-1',
    });
  });

  it('renames an artist across every song that carries it', async () => {
    const user = userEvent.setup();
    vi.mocked(data.setSongsArtist).mockResolvedValue(undefined);
    renderPage();
    await screen.findByRole('heading', { name: 'Sarah Kane' });

    await user.click(screen.getByRole('button', { name: 'Edit Sarah Kane' }));
    const field = screen.getByLabelText('Artist name');
    await user.clear(field);
    await user.type(field, 'Sarah Kane Trio');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('heading', { name: 'Sarah Kane Trio' })).toBeInTheDocument();
    expect(data.setSongsArtist).toHaveBeenCalledWith(auth.client, ['s1', 's2'], 'Sarah Kane Trio');
  });

  it('drops the songs into the group at the end when the name is emptied', async () => {
    const user = userEvent.setup();
    vi.mocked(data.setSongsArtist).mockResolvedValue(undefined);
    renderPage();
    await screen.findByRole('heading', { name: 'Sarah Kane' });

    await user.click(screen.getByRole('button', { name: 'Edit Sarah Kane' }));
    await user.clear(screen.getByLabelText('Artist name'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('heading', { name: 'No artist yet' })).toBeInTheDocument();
    expect(data.setSongsArtist).toHaveBeenCalledWith(auth.client, ['s1', 's2'], null);
  });

  it('leaves the name alone when the edit is cancelled', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Sarah Kane' });

    await user.click(screen.getByRole('button', { name: 'Edit Sarah Kane' }));
    await user.clear(screen.getByLabelText('Artist name'));
    await user.type(screen.getByLabelText('Artist name'), 'Something Else');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('heading', { name: 'Sarah Kane' })).toBeInTheDocument();
    expect(data.setSongsArtist).not.toHaveBeenCalled();
  });

  it('backs out of a rename on Escape, once the suggestions are out of the way', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Sarah Kane' });

    await user.click(screen.getByRole('button', { name: 'Edit Sarah Kane' }));
    // "Sarah Kane Trio" is close enough to an existing name to open the list,
    // and the first Escape belongs to that list, not to the form behind it.
    await user.type(screen.getByLabelText('Artist name'), ' Trio');
    await user.keyboard('{Escape}');

    expect(screen.getByLabelText('Artist name')).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).toBeNull();

    await user.keyboard('{Escape}');

    expect(screen.getByRole('heading', { name: 'Sarah Kane' })).toBeInTheDocument();
    expect(data.setSongsArtist).not.toHaveBeenCalled();
  });

  it('reports a rename the database refused', async () => {
    const user = userEvent.setup();
    vi.mocked(data.setSongsArtist).mockRejectedValue(new Error('permission denied'));
    renderPage();
    await screen.findByRole('heading', { name: 'Sarah Kane' });

    await user.click(screen.getByRole('button', { name: 'Edit Sarah Kane' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('permission denied');
    expect(screen.getByLabelText('Artist name')).toBeInTheDocument();
  });

  it('suggests an artist that already exists while the name is typed', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Sarah Kane' });
    await openAddSong(user);

    await user.type(screen.getByPlaceholderText('Artist (optional)'), 'srh');

    const list = screen.getByRole('listbox', { name: 'Artist (optional) suggestions' });
    expect(within(list).getByRole('option', { name: 'Sarah Kane' })).toBeInTheDocument();
  });

  it('fills the field with the spelling that already exists when a suggestion is taken', async () => {
    const user = userEvent.setup();
    vi.mocked(data.createSong).mockResolvedValue(song('s3', 'Third Song', 'Sarah Kane'));
    renderPage();
    await screen.findByRole('heading', { name: 'Sarah Kane' });
    await openAddSong(user);

    await user.type(screen.getByPlaceholderText('Song title'), 'Third Song');
    await user.type(screen.getByPlaceholderText('Artist (optional)'), 'sarah kan');
    await user.click(screen.getByRole('option', { name: 'Sarah Kane' }));
    await user.click(screen.getByRole('button', { name: 'Add song' }));

    expect(data.createSong).toHaveBeenCalledWith(auth.client, {
      title: 'Third Song',
      artist: 'Sarah Kane',
      ownerId: 'user-1',
    });
  });

  it('still lets a near-miss become its own artist', async () => {
    const user = userEvent.setup();
    vi.mocked(data.createSong).mockResolvedValue(song('s3', 'Third Song', 'Sarah Kane Trio'));
    renderPage();
    await screen.findByRole('heading', { name: 'Sarah Kane' });
    await openAddSong(user);

    await user.type(screen.getByPlaceholderText('Song title'), 'Third Song');
    await user.type(screen.getByPlaceholderText('Artist (optional)'), 'Sarah Kane Trio');

    // The existing name is offered, and so is keeping what was typed.
    expect(screen.getByRole('option', { name: 'Sarah Kane' })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: /as a new artist/ }));
    await user.click(screen.getByRole('button', { name: 'Add song' }));

    expect(data.createSong).toHaveBeenCalledWith(auth.client, {
      title: 'Third Song',
      artist: 'Sarah Kane Trio',
      ownerId: 'user-1',
    });
  });

  it('offers no way to create a name that is already there', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Sarah Kane' });
    await openAddSong(user);

    await user.type(screen.getByPlaceholderText('Artist (optional)'), 'Sarah Kane');

    expect(screen.getByRole('option', { name: 'Sarah Kane' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /as a new artist/ })).not.toBeInTheDocument();
  });

  it('takes a suggestion with the arrow keys and Enter', async () => {
    const user = userEvent.setup();
    vi.mocked(data.createSong).mockResolvedValue(song('s3', 'Third Song', 'Sarah Kane'));
    renderPage();
    await screen.findByRole('heading', { name: 'Sarah Kane' });
    await openAddSong(user);

    await user.type(screen.getByPlaceholderText('Song title'), 'Third Song');
    await user.type(screen.getByPlaceholderText('Artist (optional)'), 'sar');
    await user.keyboard('{ArrowDown}{Enter}');

    expect(screen.getByPlaceholderText('Artist (optional)')).toHaveValue('Sarah Kane');
    // Enter landed on the suggestion; it must not also have sent the form.
    expect(data.createSong).not.toHaveBeenCalled();
  });

  it('writes a name that differs only in case under the spelling already in use', async () => {
    const user = userEvent.setup();
    vi.mocked(data.createSong).mockResolvedValue(song('s3', 'Third Song', 'Sarah Kane'));
    renderPage();
    await screen.findByRole('heading', { name: 'Sarah Kane' });
    await openAddSong(user);

    await user.type(screen.getByPlaceholderText('Song title'), 'Third Song');
    // Typed, never picked from the list.
    await user.type(screen.getByPlaceholderText('Artist (optional)'), 'SARAH KANE');
    await user.click(screen.getByRole('button', { name: 'Add song' }));

    expect(data.createSong).toHaveBeenCalledWith(auth.client, {
      title: 'Third Song',
      artist: 'Sarah Kane',
      ownerId: 'user-1',
    });
  });

  it('searches over titles and artists at once', async () => {
    const user = userEvent.setup();
    vi.mocked(data.listSongs).mockResolvedValue([
      song('s1', 'Opening Track', 'Sarah Kane'),
      song('s2', 'Bell Tower', 'Bell Foundry'),
    ]);
    renderPage();
    await screen.findByRole('link', { name: 'Opening Track' });

    await user.type(screen.getByPlaceholderText('Search songs and artists'), 'foundry');

    expect(screen.getByRole('link', { name: 'Bell Tower' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Opening Track' })).toBeNull();
    expect(screen.getByText('1 of 2 songs')).toBeInTheDocument();
  });

  it('keeps only the songs sitting on the chosen phase', async () => {
    const user = userEvent.setup();
    vi.mocked(data.listSongs).mockResolvedValue([
      song('s1', 'Opening Track', 'Sarah Kane', { writing: 'done', arrangement: 'done' }),
      song('s2', 'The Slow One', 'Sarah Kane'),
    ]);
    renderPage();
    await screen.findByRole('link', { name: 'Opening Track' });

    await user.selectOptions(screen.getByLabelText('Phase'), 'preproduction');

    expect(screen.getByRole('link', { name: 'Opening Track' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'The Slow One' })).toBeNull();
  });

  it('drops the headings and names the artist in the row for the other orders', async () => {
    const user = userEvent.setup();
    vi.mocked(data.listSongs).mockResolvedValue([
      song('s1', 'Opening Track', 'Sarah Kane', { writing: 'done' }),
      song('s2', 'Bell Tower', 'Bell Foundry'),
    ]);
    renderPage();
    await screen.findByRole('link', { name: 'Opening Track' });

    await user.selectOptions(screen.getByLabelText('Sort'), 'progress');

    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
    const links = screen.getAllByRole('link').map((link) => link.textContent);
    expect(links).toEqual(['Opening Track', 'Bell Tower']);
    expect(screen.getByText('Sarah Kane')).toBeInTheDocument();
  });

  it('offers a way out when a filter leaves nothing', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Sarah Kane' });

    await user.type(screen.getByPlaceholderText('Search songs and artists'), 'nothing like this');
    expect(screen.getByText(/Nothing matches that/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear the filters' }));
    expect(screen.getByRole('link', { name: 'Opening Track' })).toBeInTheDocument();
  });

  it('renames every song of an artist, including the ones a filter is hiding', async () => {
    const user = userEvent.setup();
    vi.mocked(data.setSongsArtist).mockResolvedValue(undefined);
    renderPage();
    await screen.findByRole('heading', { name: 'Sarah Kane' });

    // Only one of Sarah Kane's two songs survives this search.
    await user.type(screen.getByPlaceholderText('Search songs and artists'), 'Opening');
    expect(screen.queryByRole('link', { name: 'The Slow One' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Edit Sarah Kane' }));
    const field = screen.getByLabelText('Artist name');
    await user.clear(field);
    await user.type(field, 'Sarah Kane Trio');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(data.setSongsArtist).toHaveBeenCalledWith(
        auth.client,
        ['s1', 's2'],
        'Sarah Kane Trio',
      );
    });
  });

  it('will not submit an empty title', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Sarah Kane' });
    await openAddSong(user);

    expect(screen.getByRole('button', { name: 'Add song' })).toBeDisabled();
  });

  it('keeps the fields out of the way until they are asked for', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Sarah Kane' });

    expect(screen.queryByPlaceholderText('Song title')).toBeNull();

    await openAddSong(user);
    expect(screen.getByPlaceholderText('Song title')).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByPlaceholderText('Song title')).toBeNull();
  });

  it('stays open after a song is added, ready for the next one', async () => {
    const user = userEvent.setup();
    vi.mocked(data.createSong).mockResolvedValue(song('s3', 'Third Song', 'Sarah Kane'));
    renderPage();
    await screen.findByRole('heading', { name: 'Sarah Kane' });
    await openAddSong(user);

    await user.type(screen.getByPlaceholderText('Song title'), 'Third Song');
    await user.click(screen.getByRole('button', { name: 'Add song' }));

    await screen.findByRole('link', { name: 'Third Song' });
    const field = screen.getByPlaceholderText('Song title');
    expect(field).toHaveValue('');
    expect(field).toHaveFocus();
  });

  it('closes the rename when the click lands somewhere else, without saving', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Sarah Kane' });

    await user.click(screen.getByRole('button', { name: 'Edit Sarah Kane' }));
    await user.type(screen.getByLabelText('Artist name'), ' Trio');
    await user.click(screen.getByRole('heading', { level: 1, name: 'Your songs' }));

    expect(screen.getByRole('heading', { name: 'Sarah Kane' })).toBeInTheDocument();
    expect(data.setSongsArtist).not.toHaveBeenCalled();
  });

  it('reports a failed load and offers to retry', async () => {
    const user = userEvent.setup();
    vi.mocked(data.listSongs).mockRejectedValueOnce(new Error('network is down'));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('network is down');

    vi.mocked(data.listSongs).mockResolvedValue([song('s1', 'Opening Track', 'Sarah Kane')]);
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: 'Sarah Kane' })).toBeInTheDocument();
  });

  it('reports a failed save without losing what was typed', async () => {
    const user = userEvent.setup();
    vi.mocked(data.createSong).mockRejectedValue(new Error('permission denied'));
    renderPage();
    await screen.findByRole('heading', { name: 'Sarah Kane' });
    await openAddSong(user);

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
