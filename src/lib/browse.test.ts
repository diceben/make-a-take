import { describe, expect, it } from 'vitest';
import { matchesPhase, matchesSearch, resultSummary, sortSongs } from './browse';
import { PHASES, TRACKS, type SongWithSteps, type StepStatus } from './model';

const song = (
  id: string,
  title: string,
  artist: string | null,
  done: Partial<Record<string, StepStatus>> = {},
): SongWithSteps => ({
  id,
  title,
  artist,
  deadline: null,
  notes: '',
  position: 0,
  phase_states: PHASES.map((phase) => ({
    id: `p-${id}-${phase}`,
    song_id: id,
    phase,
    status: done[phase] ?? 'todo',
    note: '',
  })),
  track_states: TRACKS.map((track) => ({
    id: `t-${id}-${track}`,
    song_id: id,
    track,
    status: done[track] ?? 'todo',
    note: '',
  })),
});

const everything: Partial<Record<string, StepStatus>> = {};
for (const phase of PHASES) everything[phase] = 'done';
for (const track of TRACKS) everything[track] = 'done';

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
  const fresh = song('s1', 'Fresh', null);
  const mixing = song('s2', 'In the mix', null, {
    writing: 'done',
    arrangement: 'done',
    preproduction: 'done',
    drums: 'done',
    bass: 'done',
    guitars: 'done',
    keys: 'done',
    lead_vocals: 'done',
    backing_vocals: 'done',
    editing: 'done',
  });
  const finished = song('s3', 'Out', null, everything);

  it('keeps everything on "all"', () => {
    expect(matchesPhase(fresh, 'all')).toBe(true);
    expect(matchesPhase(finished, 'all')).toBe(true);
  });

  it('matches the phase a song is actually sitting on', () => {
    expect(matchesPhase(fresh, 'writing')).toBe(true);
    expect(matchesPhase(fresh, 'mixing')).toBe(false);
    expect(matchesPhase(mixing, 'mixing')).toBe(true);
  });

  it('has a place for the songs with nothing left', () => {
    expect(matchesPhase(finished, 'finished')).toBe(true);
    expect(matchesPhase(fresh, 'finished')).toBe(false);
    expect(matchesPhase(finished, 'mastering')).toBe(false);
  });
});

describe('sortSongs', () => {
  const a = song('s1', 'Bravo', null, { writing: 'done' });
  const b = song('s2', 'Alpha', null);
  const c = song('s3', 'Charlie', null, everything);

  it('puts the furthest along first', () => {
    expect(sortSongs([b, a, c], 'progress').map((s) => s.title)).toEqual([
      'Charlie',
      'Bravo',
      'Alpha',
    ]);
  });

  it('falls back to the title when two are equally far', () => {
    const x = song('s4', 'Zulu', null);
    expect(sortSongs([x, b], 'progress').map((s) => s.title)).toEqual(['Alpha', 'Zulu']);
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
