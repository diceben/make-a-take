import type { Phase, SongWithSteps } from './model';
import { currentPhase, songProgress } from './progress';

/**
 * Narrowing a list of songs down to the ones being looked for, and putting them
 * in the order that answers the question being asked.
 *
 * Pure, and away from the page, so the rules can be argued with in tests rather
 * than by clicking through a filter.
 */

export type SortBy = 'artist' | 'progress' | 'title';

/** 'all', one of the seven phases, or the songs with nothing left to do. */
export type PhaseFilter = 'all' | 'finished' | Phase;

export const SORT_LABELS: Record<SortBy, string> = {
  artist: 'Artist',
  progress: 'Progress',
  title: 'Title',
};

/**
 * Plain substring matching over the title and the artist, not the fuzzy
 * matching the artist field uses. A search box is a filter: a result you cannot
 * see the reason for is worse than no result, and a typo you can see is easy to
 * fix. Fuzziness earns its place when suggesting, not when hiding things.
 */
export function matchesSearch(song: SongWithSteps, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;

  const haystack = `${song.title} ${song.artist ?? ''}`.toLowerCase();
  return haystack.includes(needle);
}

/** Which phase a song is sitting on now — the first one that is not finished. */
export function matchesPhase(song: SongWithSteps, filter: PhaseFilter): boolean {
  if (filter === 'all') return true;

  const phase = currentPhase(song.phase_states, song.track_states);
  if (filter === 'finished') return phase === null;
  return phase === filter;
}

/**
 * Sorting by artist keeps the page grouped, so it only settles the order inside
 * a group. The other two answer questions that cut across artists — what is
 * nearly done, where is a title — so the page shows one flat list for those and
 * this puts every song in one order.
 */
export function sortSongs(songs: SongWithSteps[], by: SortBy): SongWithSteps[] {
  const sorted = [...songs];

  if (by === 'progress') {
    // Furthest along first: the question is what is nearly finished.
    sorted.sort(
      (a, b) =>
        songProgress(b.phase_states, b.track_states) -
          songProgress(a.phase_states, a.track_states) || a.title.localeCompare(b.title),
    );
  } else if (by === 'title') {
    sorted.sort((a, b) => a.title.localeCompare(b.title));
  }

  return sorted;
}

/** How many of the songs are being shown, said in words rather than a fraction. */
export function resultSummary(shown: number, total: number): string {
  if (shown === total) return total === 1 ? '1 song' : `${total} songs`;
  return `${shown} of ${total} songs`;
}
