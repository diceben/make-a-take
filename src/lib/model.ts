/**
 * What a song is, outside its journey.
 *
 * The journey — phases, rounds, decisions — lives in journey.ts. This is the
 * record itself: the handful of things that are true about a song whether or
 * not anybody has judged anything in it yet.
 *
 * Genre, tempo and key are optional on purpose. A song usually exists before
 * any of them are settled, and requiring them would only produce placeholders
 * that mean less than an empty field does.
 */

export type Song = {
  id: string;
  title: string;
  artist: string | null;
  genre: string | null;
  bpm: number | null;
  musical_key: string | null;
  deadline: string | null;
  notes: string;
  position: number;
  /** Set aside rather than deleted. Nothing here throws work away. */
  archived_at: string | null;
};
