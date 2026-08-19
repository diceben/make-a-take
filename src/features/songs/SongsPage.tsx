import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { createSong, listJourneys, listSongs, setSongsArtist } from '../../lib/data';
import { type SongWithSteps } from '../../lib/model';
import { canonicalArtist, knownArtists } from '../../lib/artists';
import {
  SORT_LABELS,
  matchesPhase,
  matchesSearch,
  resultSummary,
  sortSongs,
  type PhaseFilter,
  type SortBy,
} from '../../lib/browse';
import {
  PHASE_KEYS,
  PHASE_LABELS,
  currentPhase,
  lockedCount,
  songTotals,
  type Phase,
} from '../../lib/journey';
import { ArtistField } from './ArtistField';
import './SongsPage.css';

/** The heading for songs that do not name an artist. */
const NO_ARTIST = 'No artist yet';

type Group = { artist: string; named: boolean; songs: SongWithSteps[] };

/** Every song under a heading, filtered or not — see the rename that uses it. */
function idsOfArtist(songs: SongWithSteps[], heading: string): string[] {
  const wanted = heading === NO_ARTIST ? '' : heading;
  return songs.filter((song) => (song.artist?.trim() ?? '') === wanted).map((song) => song.id);
}

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
  /** Every song's phases, for the phase in hand and the count of what is locked. */
  const [journeys, setJourneys] = useState<Map<string, Phase[]>>(new Map());
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [error, setError] = useState<string | null>(null);

  /** Which group's heading is currently a text field, keyed by its name. */
  const [editing, setEditing] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortBy>('artist');
  const [phase, setPhase] = useState<PhaseFilter>('all');

  const clearFilters = () => {
    setQuery('');
    setPhase('all');
  };

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
      const [loadedSongs, loadedJourneys] = await Promise.all([
        listSongs(client),
        listJourneys(client),
      ]);
      setSongs(loadedSongs);
      setJourneys(loadedJourneys);
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

  // What the two fields offer while a name is being typed. Always every artist,
  // never only the ones a filter left standing.
  const known = knownArtists(songs);

  const phasesOf = (song: SongWithSteps) => journeys.get(song.id) ?? [];
  const phaseOf = (song: SongWithSteps) => currentPhase(phasesOf(song));
  const lockedOf = (song: SongWithSteps) => songTotals(phasesOf(song)).locked;

  const visible = songs.filter(
    (song) => matchesSearch(song, query) && matchesPhase(phaseOf(song), phase),
  );

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

      {songs.length > 0 && (
        <Toolbar
          query={query}
          sort={sort}
          phase={phase}
          summary={resultSummary(visible.length, songs.length)}
          onQuery={setQuery}
          onSort={setSort}
          onPhase={setPhase}
        />
      )}

      {songs.length > 0 && visible.length === 0 && (
        <p className="app-lead">
          Nothing matches that.{' '}
          <button type="button" className="browse__clear" onClick={clearFilters}>
            Clear the filters
          </button>
        </p>
      )}

      {/* Grouping is the artist sort. Asked for the furthest along or for a
          title, the question cuts across artists, so the headings would only be
          in the way — the artist moves into the row instead. */}
      {sort !== 'artist' && (
        <SongTable songs={sortSongs(visible, sort, lockedOf)} showArtist phasesOf={phasesOf} />
      )}

      {sort === 'artist' &&
        groupByArtist(visible).map((group) => (
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
                  // Every song of that artist, not only the ones on screen. A
                  // rename under a filter must not split the group in two.
                  pendingFocus.current = await renameArtist(idsOfArtist(songs, group.artist), name);
                  setEditing(null);
                }}
              />
            ) : (
              <div className="artist__heading">
                <h2 className={group.named ? 'artist__name' : 'artist__name artist__name--none'}>
                  {group.artist}
                </h2>
                {/* Present the whole time — it has to be, or the keyboard could
                  never reach it — but only visible for the heading being
                  pointed at or focused. A button on every heading at once said
                  "edit me" about the entire page. */}
                <button
                  type="button"
                  className="artist__edit"
                  aria-label={
                    group.named
                      ? `Edit ${group.artist}`
                      : 'Edit the artist for the songs without one'
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
            <SongTable songs={group.songs} phasesOf={phasesOf} />
          </section>
        ))}
    </>
  );
}

/**
 * Sorting by artist keeps the headings, so the row says nothing about who it is
 * by. Any other order flattens the page, and then it has to.
 */
function SongTable({
  songs,
  showArtist = false,
  phasesOf,
}: {
  songs: SongWithSteps[];
  showArtist?: boolean;
  phasesOf: (song: SongWithSteps) => Phase[];
}) {
  return (
    <ul className="song-list">
      {songs.map((song) => {
        const phases = phasesOf(song);
        const phase = currentPhase(phases);
        const locked = songTotals(phases).locked;
        const decisions = phases.reduce((sum, one) => sum + lockedCount(one).total, 0);
        return (
          <li key={song.id} className="song-list__row">
            <span className="song-list__song">
              <Link className="song-list__title" to={`/songs/${song.id}`}>
                {song.title}
              </Link>
              {showArtist && (
                <span className="song-list__artist">{song.artist?.trim() || NO_ARTIST}</span>
              )}
            </span>
            <span className="song-list__phase">{PHASE_LABELS[phase]}</span>
            {/* Counted, never a percentage — the figure that mixed six tracking
                sub-items with one mixing toggle is what this replaces. With
                nothing to count, "0 of 0" would read as a failure rather than
                as a song that has not started. */}
            <span className="song-list__locked">
              {decisions === 0 ? 'not started' : `${locked} of ${decisions} locked`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Search, order and phase, in one line above the list. All three are held in
 * the page rather than in the address bar: they are a way of looking at what is
 * already loaded, not a place to come back to.
 */
function Toolbar({
  query,
  sort,
  phase,
  summary,
  onQuery,
  onSort,
  onPhase,
}: {
  query: string;
  sort: SortBy;
  phase: PhaseFilter;
  summary: string;
  onQuery: (value: string) => void;
  onSort: (value: SortBy) => void;
  onPhase: (value: PhaseFilter) => void;
}) {
  return (
    <div className="browse">
      <label className="browse__field">
        <span className="visually-hidden">Search songs and artists</span>
        <input
          type="search"
          placeholder="Search songs and artists"
          value={query}
          onChange={(event) => {
            onQuery(event.target.value);
          }}
        />
      </label>

      <label className="browse__field">
        <span className="browse__label">Sort</span>
        <select
          value={sort}
          onChange={(event) => {
            onSort(event.target.value as SortBy);
          }}
        >
          {(Object.keys(SORT_LABELS) as SortBy[]).map((value) => (
            <option key={value} value={value}>
              {SORT_LABELS[value]}
            </option>
          ))}
        </select>
      </label>

      <label className="browse__field">
        <span className="browse__label">Phase</span>
        <select
          value={phase}
          onChange={(event) => {
            onPhase(event.target.value as PhaseFilter);
          }}
        >
          <option value="all">All</option>
          {PHASE_KEYS.map((name) => (
            <option key={name} value={name}>
              {PHASE_LABELS[name]}
            </option>
          ))}
        </select>
      </label>

      {/* Said out loud, because filtering a list is a change nobody sees happen
          if the only sign of it is fewer rows further down. */}
      <p className="browse__summary" role="status">
        {summary}
      </p>
    </div>
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
  const form = useRef<HTMLFormElement>(null);

  // Clicking away closes the field, and closes it without writing: a rename
  // nobody confirmed is not a rename. Save is right there, and the name on the
  // page is unchanged until it is pressed.
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (busy) return;
      if (form.current && !form.current.contains(event.target as Node)) onCancel();
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [busy, onCancel]);

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
    <form className="rename-artist" ref={form} onSubmit={(event) => void submit(event)}>
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
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);

  if (!open) {
    return (
      <button
        type="button"
        ref={opener}
        className="add-song__open"
        onClick={() => {
          setOpen(true);
        }}
      >
        Add new song
      </button>
    );
  }

  return (
    <AddSongForm
      known={known}
      onSubmit={onSubmit}
      onClose={() => {
        setOpen(false);
        // Focus goes back where it came from, not to the top of the page.
        window.requestAnimationFrame(() => opener.current?.focus());
      }}
    />
  );
}

/**
 * Split out so it mounts fresh each time the form is opened — that is what puts
 * the cursor in the title field without an effect watching a boolean.
 */
function AddSongForm({
  known,
  onSubmit,
  onClose,
}: {
  known: string[];
  onSubmit: (title: string, artist: string) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    field.current?.focus();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (trimmed === '') return;

    setBusy(true);
    setError(null);
    try {
      await onSubmit(trimmed, artist);
      // The form stays open with the fields cleared. A record is a list of
      // songs, and closing after each one would mean reopening for the next.
      setTitle('');
      setArtist('');
      field.current?.focus();
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
          ref={field}
          type="text"
          placeholder="Song title"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !busy) onClose();
          }}
        />
      </label>
      <ArtistField
        label="Artist (optional)"
        placeholder="Artist (optional)"
        value={artist}
        known={known}
        onChange={setArtist}
        // Escape here belongs to the suggestions first; the field only passes
        // it on once they are out of the way.
        onEscape={() => {
          if (!busy) onClose();
        }}
      />
      <button type="submit" disabled={busy || title.trim() === ''}>
        {busy ? 'Saving…' : 'Add song'}
      </button>
      <button type="button" className="add-song__close" onClick={onClose} disabled={busy}>
        Done
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
