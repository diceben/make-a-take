import type { SupabaseClient } from '@supabase/supabase-js';
import type { Song } from './model';
import type { Decision, DecisionState, Journey, Note, Phase, PhaseKey } from './journey';

/**
 * Every read and write against the database goes through here, so there is one
 * place to look when the shape of a query matters — and one place for stage 7
 * to put an offline queue behind.
 *
 * None of these functions filter by user: row level security already limits
 * every query to what the caller may see. Adding a client-side filter on top
 * would only invite the belief that it is what protects the data.
 */

const SONG_COLUMNS = `
  id, title, artist, genre, bpm, musical_key,
  deadline, notes, position, archived_at
`;

/** Supabase returns errors in the payload rather than throwing. */
function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error('The database returned nothing.');
  return data;
}

/**
 * The account's own profile row. A trigger creates one for every new user, but
 * an account made before that trigger existed would have none — so a missing
 * row is a normal answer here, not a failure.
 */
export async function getProfile(
  client: SupabaseClient,
  id: string,
): Promise<{ display_name: string | null } | null> {
  const { data, error } = await client
    .from('profiles')
    .select('display_name')
    .eq('id', id)
    .maybeSingle<{ display_name: string | null }>();

  if (error) throw new Error(error.message);
  return data;
}

export async function setDisplayName(
  client: SupabaseClient,
  id: string,
  name: string,
): Promise<string | null> {
  const trimmed = name.trim();
  const value = trimmed === '' ? null : trimmed;

  // Upsert rather than update: it also covers the account with no profile row.
  const { data, error } = await client
    .from('profiles')
    .upsert({ id, display_name: value })
    .select('id');

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('That name was not saved.');
  return value;
}

export async function listSongs(client: SupabaseClient): Promise<Song[]> {
  return unwrap(
    await client
      .from('songs')
      .select(SONG_COLUMNS)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true }),
  );
}

export async function getSong(client: SupabaseClient, id: string): Promise<Song> {
  return unwrap(await client.from('songs').select(SONG_COLUMNS).eq('id', id).single());
}

export async function createSong(
  client: SupabaseClient,
  input: {
    title: string;
    artist: string;
    ownerId: string;
    genre?: string;
    bpm?: number | null;
    musicalKey?: string;
  },
): Promise<Song> {
  // Every one of these is optional, and an empty field is null rather than an
  // empty string: one absence, one value.
  const blankToNull = (value: string | undefined) => {
    const trimmed = value?.trim() ?? '';
    return trimmed === '' ? null : trimmed;
  };

  const created = unwrap<{ id: string }>(
    await client
      .from('songs')
      .insert({
        title: input.title.trim(),
        artist: blankToNull(input.artist),
        genre: blankToNull(input.genre),
        bpm: input.bpm ?? null,
        musical_key: blankToNull(input.musicalKey),
        owner_id: input.ownerId,
      })
      .select('id')
      .single(),
  );
  // The seven phases are created by a trigger, so the inserted row alone does
  // not tell you what the song now is. Read it back.
  return getSong(client, created.id);
}

/**
 * The artist is a word on each song rather than a row of its own, so renaming
 * one means writing to every song that carries it. The ids come from what is on
 * screen: matching on the name instead would also catch songs the list is not
 * showing.
 */
export async function setSongsArtist(
  client: SupabaseClient,
  ids: string[],
  artist: string | null,
): Promise<void> {
  const { error } = await client.from('songs').update({ artist }).in('id', ids);
  if (error) throw new Error(error.message);
}

/**
 * A write that row level security refuses is not an error — the statement runs
 * and touches nothing. For a status that is survivable; for renaming and
 * deleting it is not, because the screen would go on showing something the
 * database never accepted. So both ask for the row back and treat an empty
 * answer as the refusal it is.
 */
export async function setSongTitle(
  client: SupabaseClient,
  id: string,
  title: string,
): Promise<void> {
  const { data, error } = await client
    .from('songs')
    .update({ title: title.trim() })
    .eq('id', id)
    .select('id');

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error('That title was not saved. You may only be able to view this song.');
  }
}

export async function deleteSong(client: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await client.from('songs').delete().eq('id', id).select('id');

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error('That song was not deleted. Only its owner can delete it.');
  }
}

export async function setSongNotes(
  client: SupabaseClient,
  id: string,
  notes: string,
): Promise<void> {
  const { error } = await client.from('songs').update({ notes }).eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------- the journey

const JOURNEY_COLUMNS = `
  id, key, position, current_round,
  rounds (
    id, number, opened_at, closed_at, reopen_reason,
    decisions (
      id, title, subtitle, position, state, state_set_at, state_confirmed_at,
      steps (id, label, position, done)
    )
  )
`;

/**
 * A song's whole journey in one request. Every phase with every round, because
 * the sidebar has to say something about all seven and going back must leave the
 * earlier rounds readable.
 */
export async function getJourney(client: SupabaseClient, songId: string): Promise<Journey> {
  const [phases, notes] = await Promise.all([
    client.from('phases').select(JOURNEY_COLUMNS).eq('song_id', songId).order('position'),
    client
      .from('notes')
      .select('id, body, created_at, origin_phase, target_phase, for_next_song, resolved_at')
      .eq('song_id', songId)
      .order('created_at', { ascending: false }),
  ]);

  return { phases: unwrap<Phase[]>(phases), notes: unwrap<Note[]>(notes) };
}

/**
 * Writing a judgement, including writing the one already there — which is how a
 * judgement is confirmed. The database decides whether that counts: only a later
 * calendar day does. The row comes back so the client learns what it decided
 * rather than guessing.
 */
export async function setDecisionState(
  client: SupabaseClient,
  id: string,
  state: DecisionState,
): Promise<Decision> {
  const { data, error } = await client
    .from('decisions')
    .update({ state })
    .eq('id', id)
    .select(
      'id, title, subtitle, position, state, state_set_at, state_confirmed_at, steps (id, label, position, done)',
    )
    .maybeSingle<Decision>();

  if (error) throw new Error(error.message);
  if (!data)
    throw new Error('That judgement was not saved. You may only be able to view this song.');
  return data;
}

export async function setStepDone(
  client: SupabaseClient,
  id: string,
  done: boolean,
): Promise<void> {
  const { data, error } = await client.from('steps').update({ done }).eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error('That step was not saved. You may only be able to view this song.');
  }
}

export async function addNote(
  client: SupabaseClient,
  input: {
    songId: string;
    body: string;
    authorId: string;
    originPhase: PhaseKey;
    /** null means it waits where it was written. */
    targetPhase: PhaseKey | null;
    forNextSong: boolean;
  },
): Promise<Note> {
  const { data, error } = await client
    .from('notes')
    .insert({
      song_id: input.songId,
      body: input.body.trim(),
      author_id: input.authorId,
      origin_phase: input.originPhase,
      target_phase: input.forNextSong ? null : input.targetPhase,
      for_next_song: input.forNextSong,
    })
    .select('id, body, created_at, origin_phase, target_phase, for_next_song, resolved_at')
    .single<Note>();

  if (error) throw new Error(error.message);
  return data;
}

export async function resolveNote(client: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await client
    .from('notes')
    .update({ resolved_at: new Date().toISOString() })
    .eq('id', id)
    .select('id');

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('That note was not put away.');
}

/**
 * Closing a round: the checkpoint, written down.
 *
 * It is allowed with decisions still open — a pass can end with something
 * unsettled, and the round records that it did. What it must not do is happen
 * without the writer having seen them, which is the checkpoint's job, not this
 * one's.
 */
export async function closeRound(client: SupabaseClient, id: string): Promise<string> {
  const closed = new Date().toISOString();
  const { data, error } = await client
    .from('rounds')
    .update({ closed_at: closed })
    .eq('id', id)
    .select('id');

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error('That round was not closed. You may only be able to view this song.');
  }
  return closed;
}

/** Going back. A new round, filled from the template, leaving the old one whole. */
export async function reopenPhase(
  client: SupabaseClient,
  phase: { id: string; current_round: number },
  reason: string,
): Promise<void> {
  const next = phase.current_round + 1;

  const opened = await client
    .from('rounds')
    .insert({
      phase_id: phase.id,
      number: next,
      reopen_reason: reason.trim() === '' ? null : reason.trim(),
    })
    .select('id');

  if (opened.error) throw new Error(opened.error.message);
  if (!opened.data || opened.data.length === 0) {
    throw new Error('That phase was not reopened. You may only be able to view this song.');
  }

  const moved = await client
    .from('phases')
    .update({ current_round: next })
    .eq('id', phase.id)
    .select('id');

  if (moved.error) throw new Error(moved.error.message);
}

/**
 * Every phase of every song the caller can see, for the list. One request
 * rather than one per song: row level security already limits it to what they
 * may read, and a musician's catalogue is not big enough to page.
 */
export async function listJourneys(client: SupabaseClient): Promise<Map<string, Phase[]>> {
  const rows = unwrap<(Phase & { song_id: string })[]>(
    await client.from('phases').select(`song_id, ${JOURNEY_COLUMNS}`).order('position'),
  );

  const bySong = new Map<string, Phase[]>();
  for (const row of rows) {
    const list = bySong.get(row.song_id) ?? [];
    list.push(row);
    bySong.set(row.song_id, list);
  }
  return bySong;
}

/** Setting a song aside, and taking it back out. Never a delete. */
export async function setSongArchived(
  client: SupabaseClient,
  id: string,
  archived: boolean,
): Promise<string | null> {
  const at = archived ? new Date().toISOString() : null;
  const { data, error } = await client
    .from('songs')
    .update({ archived_at: at })
    .eq('id', id)
    .select('id');

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error('That song was not changed. You may only be able to view it.');
  }
  return at;
}

/**
 * Every note of every song the caller can see, for the dashboard's activity.
 *
 * One request rather than one per song. Row level security already limits it to
 * what they may read, and a catalogue of songs is not long enough to page.
 */
export async function listNotes(client: SupabaseClient): Promise<Map<string, Note[]>> {
  const rows = unwrap<(Note & { song_id: string })[]>(
    await client
      .from('notes')
      .select(
        'song_id, id, body, created_at, origin_phase, target_phase, for_next_song, resolved_at',
      )
      .order('created_at', { ascending: false }),
  );

  const bySong = new Map<string, Note[]>();
  for (const row of rows) {
    const list = bySong.get(row.song_id) ?? [];
    list.push(row);
    bySong.set(row.song_id, list);
  }
  return bySong;
}
