import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { createSong, listSongs } from '../../lib/data';
import { PHASE_LABELS, type SongWithSteps } from '../../lib/model';
import { currentPhase, songProgress } from '../../lib/progress';
import { ProgressBar } from './ProgressBar';
import './SongsPage.css';

/** The heading for songs that do not name an artist. */
const NO_ARTIST = 'No artist yet';

type Group = { artist: string; named: boolean; songs: SongWithSteps[] };

/**
 * Songs group under the artist they name. An artist is a word on the song, not
 * a row somewhere, so the grouping is derived on every render rather than
 * stored — there is nothing that could drift out of step with it.
 *
 * Named artists come first in alphabetical order; the songs that name nobody
 * gather at the end, where they read as something still to do.
 */
function groupByArtist(songs: SongWithSteps[]): Group[] {
  const groups = new Map<string, Group>();

  for (const song of songs) {
    const name = song.artist?.trim() ?? '';
    const named = name !== '';
    const artist = named ? name : NO_ARTIST;
    const group = groups.get(artist) ?? { artist, named, songs: [] };
    group.songs.push(song);
    groups.set(artist, group);
  }

  return [...groups.values()].sort((a, b) => {
    if (a.named !== b.named) return a.named ? -1 : 1;
    return a.artist.localeCompare(b.artist);
  });
}

export function SongsPage() {
  const auth = useAuth();
  const { client } = auth;
  const userId = auth.status === 'signed-in' ? auth.session.user.id : null;

  const [songs, setSongs] = useState<SongWithSteps[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSongs(await listSongs(client));
      setState('ready');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your songs.');
      setState('failed');
    }
  }, [client]);

  useEffect(() => {
    // The rule flags any call that can reach setState. Here every setState in
    // load() happens after an await, which is the asynchronous pattern the rule
    // is meant to permit — it simply cannot see through the function call.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const addSong = async (title: string, artist: string) => {
    if (!userId) return;
    const song = await createSong(client, { title, artist, ownerId: userId });
    setSongs((current) => [...current, song]);
  };

  if (state === 'loading') return <p role="status">Loading your songs…</p>;

  if (state === 'failed') {
    return (
      <>
        <h1>Your songs</h1>
        <p className="error" role="alert">
          {error}
        </p>
        <button type="button" onClick={() => void load()}>
          Try again
        </button>
      </>
    );
  }

  return (
    <>
      <h1>Your songs</h1>

      {songs.length === 0 && (
        <p className="app-lead">Nothing here yet. Write down the first one.</p>
      )}

      <AddSong onSubmit={addSong} />

      {groupByArtist(songs).map((group) => (
        <section key={group.artist} className="artist">
          <h2 className={group.named ? 'artist__name' : 'artist__name artist__name--none'}>
            {group.artist}
          </h2>
          <SongTable songs={group.songs} />
        </section>
      ))}
    </>
  );
}

function SongTable({ songs }: { songs: SongWithSteps[] }) {
  return (
    <ul className="song-list">
      {songs.map((song) => {
        const progress = songProgress(song.phase_states, song.track_states);
        const phase = currentPhase(song.phase_states, song.track_states);
        return (
          <li key={song.id} className="song-list__row">
            <Link className="song-list__title" to={`/songs/${song.id}`}>
              {song.title}
            </Link>
            <span className="song-list__phase">{phase ? PHASE_LABELS[phase] : 'Finished'}</span>
            <ProgressBar progress={progress} label={`Progress of ${song.title}`} />
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The one way into the app: a title, and optionally who it is for. The artist
 * is deliberately not required — a song usually exists before it is settled
 * whose it is, and demanding a name would only produce placeholders.
 */
function AddSong({ onSubmit }: { onSubmit: (title: string, artist: string) => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (trimmed === '') return;

    setBusy(true);
    setError(null);
    try {
      await onSubmit(trimmed, artist);
      setTitle('');
      setArtist('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="add-song" onSubmit={(event) => void submit(event)}>
      <label className="add-song__label">
        <span className="visually-hidden">Song title</span>
        <input
          type="text"
          placeholder="Song title"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
        />
      </label>
      <label className="add-song__label">
        <span className="visually-hidden">Artist (optional)</span>
        <input
          type="text"
          placeholder="Artist (optional)"
          value={artist}
          onChange={(event) => {
            setArtist(event.target.value);
          }}
        />
      </label>
      <button type="submit" disabled={busy || title.trim() === ''}>
        {busy ? 'Saving…' : 'Add song'}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
