import { describe, expect, it } from 'vitest';
import { canonicalArtist, knownArtists, matchArtists } from './artists';

const song = (artist: string | null) => ({ artist });

describe('knownArtists', () => {
  it('lists each artist once, alphabetically', () => {
    expect(knownArtists([song('Sarah Kane'), song('Bell Foundry'), song('Sarah Kane')])).toEqual([
      'Bell Foundry',
      'Sarah Kane',
    ]);
  });

  it('ignores songs that name nobody', () => {
    expect(knownArtists([song(null), song('   '), song('Sarah Kane')])).toEqual(['Sarah Kane']);
  });

  it('keeps one spelling when two differ only in case', () => {
    expect(knownArtists([song('Sarah Kane'), song('sarah kane')])).toEqual(['Sarah Kane']);
  });

  it('keeps both when they differ by more than case', () => {
    expect(knownArtists([song('Sarah Kane'), song('Sarah Kane Trio')])).toEqual([
      'Sarah Kane',
      'Sarah Kane Trio',
    ]);
  });
});

describe('canonicalArtist', () => {
  const known = ['Bell Foundry', 'Sarah Kane'];

  it('answers with the spelling that already exists', () => {
    expect(canonicalArtist('sarah kane', known)).toBe('Sarah Kane');
    expect(canonicalArtist('  SARAH KANE ', known)).toBe('Sarah Kane');
  });

  it('leaves a name nobody uses yet exactly as typed', () => {
    expect(canonicalArtist('Sarah Kane Trio', known)).toBe('Sarah Kane Trio');
    expect(canonicalArtist('  The Bells  ', known)).toBe('The Bells');
  });
});

describe('matchArtists', () => {
  const known = ['Bell Foundry', 'Bellamy', 'Sarah Kane', 'Sarah Kane Trio', 'The Slow Band'];

  it('suggests nothing for an empty query', () => {
    expect(matchArtists('', known)).toEqual([]);
    expect(matchArtists('   ', known)).toEqual([]);
  });

  it('puts the name that starts with the query first, shortest first', () => {
    expect(matchArtists('bell', known)).toEqual(['Bellamy', 'Bell Foundry']);
  });

  it('ignores case', () => {
    expect(matchArtists('SARAH', known)).toEqual(['Sarah Kane', 'Sarah Kane Trio']);
  });

  it('matches the start of a later word', () => {
    expect(matchArtists('kane', known)).toEqual(['Sarah Kane', 'Sarah Kane Trio']);
  });

  it('matches letters that appear in order', () => {
    expect(matchArtists('srhkane', known)).toContain('Sarah Kane');
  });

  it('shows the shorter name a longer one is being built on top of', () => {
    // The case the whole list exists for: without this you find out about the
    // two groups afterwards, in the list of songs.
    expect(matchArtists('Sarah Kane Quartet', known)).toContain('Sarah Kane');
    expect(matchArtists('The Bell Foundry Sessions', known)).toContain('Bell Foundry');
  });

  it('forgives a typo', () => {
    expect(matchArtists('sarha', known)).toContain('Sarah Kane');
    expect(matchArtists('bellamu', known)).toContain('Bellamy');
  });

  it('does not forgive a typo in one or two letters, where anything would match', () => {
    expect(matchArtists('xz', known)).toEqual([]);
  });

  it('answers nothing when nothing is close', () => {
    expect(matchArtists('orchestra', known)).toEqual([]);
  });

  it('offers the exact name too, so an existing artist can be confirmed', () => {
    expect(matchArtists('Sarah Kane', known)[0]).toBe('Sarah Kane');
  });

  it('holds to the limit', () => {
    expect(matchArtists('a', known, 2)).toHaveLength(2);
  });
});
