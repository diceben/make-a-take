/**
 * An artist is a word on a song, not a row in a table. Nothing stops two songs
 * from spelling the same name differently, and once they do they fall into two
 * groups that never come back together on their own.
 *
 * So the only defence is to offer the spellings that already exist while the
 * name is being typed. That matching lives here, pure and away from the input,
 * so it can be argued with in tests rather than through the UI.
 */

const norm = (value: string) => value.trim().toLowerCase();

/** Every artist named by at least one song, one entry per spelling that differs
 *  by more than case, in the order they should be offered. */
export function knownArtists(songs: { artist: string | null }[]): string[] {
  const bySpelling = new Map<string, string>();

  for (const song of songs) {
    const name = song.artist?.trim() ?? '';
    if (name === '') continue;
    // First spelling wins, so the list does not flicker between two casings.
    if (!bySpelling.has(name.toLowerCase())) bySpelling.set(name.toLowerCase(), name);
  }

  return [...bySpelling.values()].sort((a, b) => a.localeCompare(b));
}

/**
 * The existing spelling of a name that differs only in case, or the name as
 * typed. Two groups that differ by nothing but capitals are almost never meant,
 * and nobody would go looking for the cause in a list of songs.
 */
export function canonicalArtist(name: string, known: string[]): string {
  const trimmed = name.trim();
  return known.find((candidate) => norm(candidate) === norm(trimmed)) ?? trimmed;
}

/** Are the query's letters all present, in order, somewhere in the candidate? */
function isSubsequence(query: string, candidate: string): boolean {
  let index = 0;
  for (const character of candidate) {
    if (character === query[index]) index += 1;
    if (index === query.length) return true;
  }
  return false;
}

/** Levenshtein distance, two rows at a time. */
function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      const deletion = (previous[j] ?? 0) + 1;
      const insertion = (current[j - 1] ?? 0) + 1;
      current[j] = Math.min(substitution, deletion, insertion);
    }
    previous = current;
  }

  return previous[b.length] ?? 0;
}

/**
 * How well a name answers what has been typed, or null for not at all.
 *
 * The tiers are ordered by how deliberate the match looks: the whole name, then
 * the start of it, then the start of a word in it, then anywhere inside it,
 * then the letters in order, and only then a spelling mistake. Within a tier the
 * shorter name wins, because it is the one with less of it left unexplained.
 */
function score(candidate: string, query: string): number | null {
  const c = norm(candidate);
  const q = norm(query);
  if (q === '') return null;

  if (c === q) return 1000;
  if (c.startsWith(q)) return 900 - c.length;
  if (c.split(/\s+/).some((word) => word.startsWith(q))) return 800 - c.length;
  if (c.includes(q)) return 700 - c.length;

  // The other way round: what is being typed contains a name that already
  // exists, as "Sarah Kane Trio" contains "Sarah Kane". That is the near-miss
  // worth showing — the moment where somebody should see the shorter name and
  // decide, rather than find out later that there are two groups. Short names
  // are left out of this: two letters inside a longer name mean nothing.
  if (c.length >= 3 && q.includes(c)) return 650 - c.length;

  if (isSubsequence(q, c)) return 600 - c.length;

  // Typing mistakes, measured against the part of the name that has been
  // reached so far rather than all of it — otherwise every name stays wrong
  // until the last letter. Below three characters this is off: at that length
  // one edit reaches almost anything.
  if (q.length >= 3) {
    const allowed = q.length <= 4 ? 1 : 2;
    const reached = [c, ...c.split(/\s+/)].map((part) => part.slice(0, q.length));
    const closest = Math.min(...reached.map((part) => distance(part, q)));
    if (closest <= allowed) return 500 - closest;
  }

  return null;
}

/** The known artists that answer the query, best first. */
export function matchArtists(query: string, known: string[], limit = 5): string[] {
  return known
    .map((name) => ({ name, score: score(name, query) }))
    .filter((entry): entry is { name: string; score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((entry) => entry.name);
}
