import type { SongWithSteps } from './model';
import type { PhaseKey } from './journey';

/**
 * Narrowing a list of songs down to the ones being looked for, and putting them
 * in the order that answers the question being asked.
 *
 * Pure, and away from the page, so the rules can be argued with in tests rather
 * than by clicking through a filter.
 */

export type SortBy = 'artist' | 'progress' | 'title';

/** 'all', or one of the seven phases. */
export type PhaseFilter = 'all' | PhaseKey;

export const SORT_LABELS: Record<SortBy, string> = {
  artist: 'Artist',
  progress: 'Decided',
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

/**
 * The phase a song is in is where its last judgement was made, so it is worked
 * out from the journey and handed in here rather than dug for.
 */
export function matchesPhase(phase: PhaseKey, filter: PhaseFilter): boolean {
  return filter === 'all' || phase === filter;
}

/**
 * Sorting by artist keeps the page grouped, so it only settles the order inside
 * a group. The other two answer questions that cut across artists — what is
 * nearly done, where is a title — so the page shows one flat list for those and
 * this puts every song in one order.
 */
export function sortSongs(
  songs: SongWithSteps[],
  by: SortBy,
  /** How many decisions each song has locked — counted, never a percentage. */
  lockedOf: (song: SongWithSteps) => number = () => 0,
): SongWithSteps[] {
  const sorted = [...songs];

  if (by === 'progress') {
    // Most decided first: the question is what is nearly finished.
    sorted.sort((a, b) => lockedOf(b) - lockedOf(a) || a.title.localeCompare(b.title));
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
