import { describe, expect, it } from 'vitest';
import { matchesPhase, matchesSearch, resultSummary, sortSongs } from './browse';
import { PHASE_KEYS } from './journey';

const song = (id: string, title: string, artist: string | null = null) => ({
  id,
  title,
  artist,
  genre: null,
  bpm: null,
  musical_key: null,
  deadline: null,
  notes: '',
  position: 0,
  archived_at: null,
});

describe('matchesSearch', () => {
  const opening = song('s1', 'Opening Track', 'Sarah Kane');

  it('keeps everything when nothing is typed', () => {
    expect(matchesSearch(opening, '')).toBe(true);
    expect(matchesSearch(opening, '   ')).toBe(true);
  });

  it('finds a song by part of its title, whatever the case', () => {
    expect(matchesSearch(opening, 'open')).toBe(true);
    expect(matchesSearch(opening, 'TRACK')).toBe(true);
  });

  it('finds a song by its artist', () => {
    expect(matchesSearch(opening, 'kane')).toBe(true);
  });

  it('says no when neither matches', () => {
    expect(matchesSearch(opening, 'mastering')).toBe(false);
  });

  it('does not match a song with no artist on an empty-looking query', () => {
    expect(matchesSearch(song('s2', 'Untitled', null), 'kane')).toBe(false);
  });
});

describe('matchesPhase', () => {
  it('keeps everything on "all"', () => {
    expect(matchesPhase('write', 'all')).toBe(true);
    expect(matchesPhase('master', 'all')).toBe(true);
  });

  it('keeps only the phase asked for', () => {
    expect(matchesPhase('mix', 'mix')).toBe(true);
    expect(matchesPhase('write', 'mix')).toBe(false);
  });

  it('knows the seven of the decision model', () => {
    for (const key of PHASE_KEYS) expect(matchesPhase(key, key)).toBe(true);
  });
});

describe('sortSongs', () => {
  const a = song('s1', 'Bravo');
  const b = song('s2', 'Alpha');
  const c = song('s3', 'Charlie');

  // How much is decided is counted from the journey and handed in, so the rule
  // itself never has to know what a decision is.
  const locked: Record<string, number> = { Alpha: 0, Bravo: 1, Charlie: 9 };
  const lockedOf = (s: { title: string }) => locked[s.title] ?? 0;

  it('puts the most decided first', () => {
    expect(sortSongs([b, a, c], 'progress', lockedOf).map((s) => s.title)).toEqual([
      'Charlie',
      'Bravo',
      'Alpha',
    ]);
  });

  it('falls back to the title when two are equally far', () => {
    const x = song('s4', 'Zulu', null);
    expect(sortSongs([x, b], 'progress', lockedOf).map((s) => s.title)).toEqual(['Alpha', 'Zulu']);
  });

  it('sorts by title when asked', () => {
    expect(sortSongs([a, c, b], 'title').map((s) => s.title)).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
    ]);
  });

  it('leaves the order alone for artist, which the grouping settles', () => {
    expect(sortSongs([b, a, c], 'artist').map((s) => s.title)).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
    ]);
  });

  it('does not touch the list it was given', () => {
    const list = [b, a, c];
    sortSongs(list, 'title');
    expect(list.map((s) => s.title)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });
});

describe('resultSummary', () => {
  it('counts plainly when nothing is filtered away', () => {
    expect(resultSummary(4, 4)).toBe('4 songs');
    expect(resultSummary(1, 1)).toBe('1 song');
  });

  it('says how many of how many once something is', () => {
    expect(resultSummary(2, 9)).toBe('2 of 9 songs');
    expect(resultSummary(0, 9)).toBe('0 of 9 songs');
  });
});
