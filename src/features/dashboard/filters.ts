import { standingOf } from '../../lib/dashboard';
import type { Phase } from '../../lib/journey';
import type { Song } from '../../lib/model';

/**
 * Narrowing and ordering the dashboard's list.
 *
 * Kept out of the page so the rules can be argued with in a test rather than by
 * clicking a chip and squinting at what is left.
 */

export type SongFilter = 'all' | 'in-progress' | 'needs-attention' | 'completed' | 'archived';

export const FILTER_LABELS: Record<SongFilter, string> = {
  all: 'All songs',
  'in-progress': 'In the works',
  'needs-attention': 'Needs a take',
  completed: 'Finished',
  archived: 'Set aside',
};

export type SongSort = 'modified' | 'created' | 'decided' | 'title';

export const SORT_LABELS: Record<SongSort, string> = {
  modified: 'Last touched',
  created: 'Newest first',
  decided: 'Most decided',
  title: 'By title',
};

/**
 * Archived songs appear under their own filter and nowhere else — including
 * "all songs", which means all the songs you are working on. A list that quietly
 * mixed retired work into every view would make the retiring pointless.
 */
export function matchesFilter(song: Song, phases: Phase[], filter: SongFilter): boolean {
  const archived = song.archived_at !== null;
  if (filter === 'archived') return archived;
  if (archived) return false;
  if (filter === 'all') return true;

  // Exactly what the tile above it counts, and nothing more. A filter that was
  // more generous than the figure naming it would make one of the two a lie —
  // and an untouched song is not in progress, it is waiting.
  return standingOf(phases) === filter;
}

export function matchesQuery(song: Song, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;

  // Plain substring, over everything on the card. A search box is a filter, and
  // a result you cannot see the reason for is worse than no result.
  const hay = [song.title, song.artist, song.genre, song.musical_key]
    .filter((one): one is string => one !== null)
    .join(' ')
    .toLowerCase();
  return hay.includes(needle);
}

export function sortSongs(
  songs: Song[],
  by: SongSort,
  facts: (song: Song) => { modified: string | null; settled: number },
): Song[] {
  const sorted = [...songs];

  if (by === 'title') {
    sorted.sort((a, b) => a.title.localeCompare(b.title));
  } else if (by === 'decided') {
    sorted.sort((a, b) => facts(b).settled - facts(a).settled || a.title.localeCompare(b.title));
  } else if (by === 'modified') {
    // Never judged sorts last: it has no date, not an old one.
    sorted.sort((a, b) => {
      const left = facts(a).modified;
      const right = facts(b).modified;
      if (left === right) return a.title.localeCompare(b.title);
      if (left === null) return 1;
      if (right === null) return -1;
      return left < right ? 1 : -1;
    });
  } else {
    // Recently created. `position` rises with each song added, and it is the
    // only ordering the list query already guarantees.
    sorted.sort((a, b) => b.position - a.position || a.title.localeCompare(b.title));
  }

  return sorted;
}
