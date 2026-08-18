import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { createSong, listSongs, setSongsArtist } from '../../lib/data';
import { PHASE_LABELS, type SongWithSteps } from '../../lib/model';
import { canonicalArtist, knownArtists } from '../../lib/artists';
import { currentPhase, songProgress } from '../../lib/progress';
import { ArtistField } from './ArtistField';
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

  /** Which group's heading is currently a text field, keyed by its name. */
  const [editing, setEditing] = useState<string | null>(null);

  // Renaming a group replaces the heading it was started from — and the group
  // may move, since the list is sorted by name. Without this the focus ring
  // would land back at the top of the document. Held in a ref so putting focus
  // somewhere does not itself cause a render.
  const editButtons = useRef(new Map<string, HTMLButtonElement | null>());
  const pendingFocus = useRef<string | null>(null);

  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    editButtons.current.get(target)?.focus();
  });

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

  // What the two fields offer while a name is being typed.
  const known = knownArtists(songs);

  const addSong = async (title: string, artist: string) => {
    if (!userId) return;
    const song = await createSong(client, {
      title,
      artist: canonicalArtist(artist, known),
      ownerId: userId,
    });
    setSongs((current) => [...current, song]);
  };

  /** Writes the new name to every song in the group, and reports where it landed. */
  const renameArtist = async (ids: string[], artist: string): Promise<string> => {
    const trimmed = canonicalArtist(artist, known);
    // Clearing the field is how a song stops naming anybody, so an empty field
    // is null rather than an empty string — one absence, one value.
    const value = trimmed === '' ? null : trimmed;

    await setSongsArtist(client, ids, value);
    setSongs((current) =>
      current.map((song) => (ids.includes(song.id) ? { ...song, artist: value } : song)),
    );
    return value ?? NO_ARTIST;
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

      <AddSong known={known} onSubmit={addSong} />

      {groupByArtist(songs).map((group) => (
        <section key={group.artist} className="artist">
          {editing === group.artist ? (
            <RenameArtist
              value={group.named ? group.artist : ''}
              // Its own name is no suggestion, and offering it would be the one
              // row that changes nothing.
              known={known.filter((name) => name !== group.artist)}
              onCancel={() => {
                pendingFocus.current = group.artist;
                setEditing(null);
              }}
              onSave={async (name) => {
                pendingFocus.current = await renameArtist(
                  group.songs.map((song) => song.id),
                  name,
                );
                setEditing(null);
              }}
            />
          ) : (
            <div className="artist__heading">
              <h2 className={group.named ? 'artist__name' : 'artist__name artist__name--none'}>
                {group.artist}
              </h2>
              <button
                type="button"
                className="artist__edit"
                aria-label={
                  group.named ? `Edit ${group.artist}` : 'Edit the artist for the songs without one'
                }
                ref={(node) => {
                  editButtons.current.set(group.artist, node);
                }}
                onClick={() => {
                  setEditing(group.artist);
                }}
              >
                Edit
              </button>
            </div>
          )}
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
 * Renaming an artist in place. Emptying the field is allowed on purpose: it is
 * the only way to take a name back off songs that should not carry it, and it
 * drops them into the group at the end rather than deleting anything.
 */
function RenameArtist({
  value: initial,
  known,
  onCancel,
  onSave,
}: {
  value: string;
  known: string[];
  onCancel: () => void;
  onSave: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave(value);
      // Saving unmounts this form, so there is deliberately nothing after the
      // await on the way out — only the failure path has state left to set.
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That name was not saved.');
      setBusy(false);
    }
  };

  return (
    <form className="rename-artist" onSubmit={(event) => void submit(event)}>
      <ArtistField
        label="Artist name"
        placeholder="Artist (leave empty for none)"
        value={value}
        known={known}
        onChange={setValue}
        // Escape backs out, which is what the key is for in a field that
        // replaced something already on screen — but only once the suggestions
        // are out of the way, since the first press belongs to them.
        onEscape={onCancel}
        focusOnMount
      />
      <button type="submit" disabled={busy}>
        {busy ? 'Saving…' : 'Save'}
      </button>
      <button type="button" onClick={onCancel} disabled={busy}>
        Cancel
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

/**
 * The one way into the app: a title, and optionally who it is for. The artist
 * is deliberately not required — a song usually exists before it is settled
 * whose it is, and demanding a name would only produce placeholders.
 */
function AddSong({
  known,
  onSubmit,
}: {
  known: string[];
  onSubmit: (title: string, artist: string) => Promise<void>;
}) {
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
      <ArtistField
        label="Artist (optional)"
        placeholder="Artist (optional)"
        value={artist}
        known={known}
        onChange={setArtist}
      />
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
