import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/auth-context';
import { createSong, listJourneys, listNotes, listSongs } from '../../lib/data';
import {
  creditsThisMonth,
  decidedOf,
  nextTake,
  recentActivity,
  songsByStage,
  summarise,
} from '../../lib/dashboard';
import { decisionsOf, type Note, type Phase } from '../../lib/journey';
import { canonicalArtist, knownArtists } from '../../lib/artists';
import type { Song } from '../../lib/model';
import {
  FILTER_LABELS,
  SORT_LABELS,
  matchesFilter,
  matchesQuery,
  sortSongs,
  type SongFilter,
  type SongSort,
} from './filters';
import { NewSongModal, type NewSong } from './NewSongModal';
import { NextTake, NoTake } from './NextTake';
import { DecisionLog, EmptyList, NoMatches, RecentActivity, SongsByStage } from './Panels';
import { SongCard } from './SongCard';
import { SummaryCards } from './SummaryCards';
import './DashboardPage.css';

/**
 * The home screen: every song, and what each one wants.
 *
 * It is built to answer five questions in about the time it takes to read it —
 * what have I got, what am I on, what needs me, how far along, what is next —
 * and to answer them without a song-wide percentage. Everything on it is worked
 * out from decisions that already exist, so there is nothing here that could
 * quietly disagree with the song pages.
 */
export function DashboardPage() {
  const auth = useAuth();
  const { client } = auth;
  const userId = auth.status === 'signed-in' ? auth.session.user.id : null;
  const displayName = auth.status === 'signed-in' ? (auth.session.user.email ?? '') : '';

  const [songs, setSongs] = useState<Song[]>([]);
  const [journeys, setJourneys] = useState<Map<string, Phase[]>>(new Map());
  const [notes, setNotes] = useState<Map<string, Note[]>>(new Map());
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SongFilter>('all');
  const [sort, setSort] = useState<SongSort>('modified');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const [loadedSongs, loadedJourneys, loadedNotes] = await Promise.all([
        listSongs(client),
        listJourneys(client),
        listNotes(client),
      ]);
      setSongs(loadedSongs);
      setJourneys(loadedJourneys);
      setNotes(loadedNotes);
      setState('ready');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your songs.');
      setState('failed');
    }
  }, [client]);

  useEffect(() => {
    // Every setState in load() happens after an await, which the rule cannot
    // see through the function call.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const phasesOf = useCallback((song: Song) => journeys.get(song.id) ?? [], [journeys]);

  /** When a song was last judged. The only "modified" a song really has. */
  const modifiedOf = useCallback(
    (song: Song): string | null => {
      const stamps = phasesOf(song)
        .flatMap(decisionsOf)
        .map((decision) => decision.state_set_at)
        .filter((at): at is string => at !== null);
      return stamps.length === 0 ? null : stamps.reduce((a, b) => (a > b ? a : b));
    },
    [phasesOf],
  );

  const summary = useMemo(() => summarise(songs, phasesOf), [songs, phasesOf]);

  const visible = useMemo(() => {
    const kept = songs.filter(
      (song) => matchesQuery(song, query) && matchesFilter(song, phasesOf(song), filter),
    );
    return sortSongs(kept, sort, (song) => ({
      modified: modifiedOf(song),
      settled: decidedOf(phasesOf(song)).settled,
    }));
  }, [songs, query, filter, sort, phasesOf, modifiedOf]);

  const live = useMemo(() => songs.filter((song) => song.archived_at === null), [songs]);

  const activity = useMemo(
    () =>
      recentActivity(
        live.map((song) => ({
          song,
          phases: phasesOf(song),
          notes: notes.get(song.id) ?? [],
        })),
      ),
    [live, phasesOf, notes],
  );

  const credits = useMemo(() => {
    const all = live.map(phasesOf);
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, index) => {
      const when = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - index), 1));
      const next = new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth() + 1, 1));
      // Everything up to the end of that month, less everything up to its start.
      const count = creditsThisMonth(all, when) - creditsThisMonth(all, next);
      return {
        label: when.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
        count: Math.max(0, count),
      };
    });
    return { thisMonth: creditsThisMonth(all, now), months };
  }, [live, phasesOf]);

  const stages = useMemo(() => songsByStage(live, phasesOf), [live, phasesOf]);

  // The one offer. Worked out over everything, because "what next" is a question
  // about the catalogue, not about whichever song happens to be on top.
  const take = useMemo(
    () => nextTake(songs.map((song) => ({ song, phases: phasesOf(song) }))),
    [songs, phasesOf],
  );
  const known = useMemo(() => knownArtists(songs), [songs]);

  const create = async (draft: NewSong) => {
    if (!userId) return;
    const parsed = Number.parseInt(draft.bpm, 10);
    const song = await createSong(client, {
      title: draft.title,
      artist: canonicalArtist(draft.artist, known),
      ownerId: userId,
      genre: draft.genre,
      bpm: Number.isNaN(parsed) ? null : parsed,
      musicalKey: draft.key,
    });

    setSongs((current) => [...current, song]);
    // The trigger made seven phases; without them the new card would claim the
    // song has none rather than that it has not started.
    try {
      setJourneys(await listJourneys(client));
    } catch {
      // The card reads as untouched until the next load, which it is.
    }
    setAdding(false);
  };

  if (state === 'loading') return <p role="status">Loading your songs…</p>;

  if (state === 'failed') {
    return (
      <>
        <h1>Dashboard</h1>
        <p className="error" role="alert">
          {error}
        </p>
        <button type="button" onClick={() => void load()}>
          Try again
        </button>
      </>
    );
  }

  const clear = () => {
    setQuery('');
    setFilter('all');
  };

  return (
    <div className="dash">
      <header className="dash__head">
        <div>
          <h1 className="dash__hello">
            Welcome back{displayName ? `, ${firstName(displayName)}` : ''}
          </h1>
          <p className="dash__under">Here&rsquo;s what&rsquo;s happening with your songs.</p>
        </div>

        <div className="dash__tools">
          <label className="dash__search">
            <span className="visually-hidden">Search songs</span>
            <Magnifier />
            <input
              type="search"
              placeholder="Search songs"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
            />
          </label>

          <button
            type="button"
            className="dash__new"
            onClick={() => {
              setAdding(true);
            }}
          >
            <span aria-hidden="true">+</span> New song
          </button>
        </div>
      </header>

      {/* Above the figures on purpose. The counts answer "how am I doing"; this
          answers "what now", and that is the question somebody opens the app
          with. */}
      {take === null ? (
        <NoTake
          hasSongs={songs.length > 0}
          onNew={() => {
            setAdding(true);
          }}
        />
      ) : (
        <NextTake take={take} />
      )}

      <SummaryCards summary={summary} filter={filter} onFilter={setFilter} />

      <div className="dash__browse">
        <div className="dash__chips" role="group" aria-label="Show only">
          {(Object.keys(FILTER_LABELS) as SongFilter[]).map((key) => (
            <button
              key={key}
              type="button"
              className="dash__chip"
              aria-pressed={filter === key}
              onClick={() => {
                setFilter(key);
              }}
            >
              {FILTER_LABELS[key]}
            </button>
          ))}
        </div>

        <label className="dash__sort">
          <span className="dash__sort-label">Sort</span>
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as SongSort);
            }}
          >
            {(Object.keys(SORT_LABELS) as SongSort[]).map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <h2 className="dash__legend" id="songs-heading">
        Your songs
      </h2>

      <p className="dash__count" role="status">
        {visible.length === songs.length
          ? `${String(songs.length)} ${songs.length === 1 ? 'song' : 'songs'}`
          : `${String(visible.length)} of ${String(songs.length)} songs`}
      </p>

      {songs.length === 0 ? (
        <EmptyList
          onNew={() => {
            setAdding(true);
          }}
        />
      ) : visible.length === 0 ? (
        <NoMatches onClear={clear} />
      ) : (
        <ul className="dash__songs" aria-labelledby="songs-heading">
          {visible.map((song) => (
            <SongCard
              key={song.id}
              song={song}
              phases={phasesOf(song)}
              updatedAt={modifiedOf(song)}
            />
          ))}
        </ul>
      )}

      <div className="dash__panels">
        <RecentActivity activity={activity} />
        <SongsByStage counts={stages} />
        <DecisionLog thisMonth={credits.thisMonth} months={credits.months} />
      </div>

      {adding && (
        <NewSongModal
          known={known}
          onClose={() => {
            setAdding(false);
          }}
          onCreate={create}
        />
      )}
    </div>
  );
}

/** The part of an address before the @, which is usually a name. */
function firstName(email: string): string {
  const local = email.split('@')[0] ?? '';
  const first = local.split(/[.\-_]/)[0] ?? local;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function Magnifier() {
  return (
    <svg
      className="dash__glass"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}
