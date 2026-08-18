import type { SupabaseClient } from '@supabase/supabase-js';
import type { Project, SongWithSteps, StepStatus } from './model';

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
  id, project_id, title, artist, deadline, notes, position,
  phase_states (id, song_id, phase, status, note),
  track_states (id, song_id, track, status, note)
`;

/** Supabase returns errors in the payload rather than throwing. */
function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error('The database returned nothing.');
  return data;
}

export async function listProjects(client: SupabaseClient): Promise<Project[]> {
  return unwrap(
    await client
      .from('projects')
      .select('id, name, artist, deadline')
      .order('created_at', { ascending: true }),
  );
}

export async function createProject(
  client: SupabaseClient,
  input: { name: string; ownerId: string },
): Promise<Project> {
  return unwrap(
    await client
      .from('projects')
      .insert({ name: input.name.trim(), owner_id: input.ownerId })
      .select('id, name, artist, deadline')
      .single(),
  );
}

export async function listSongs(client: SupabaseClient): Promise<SongWithSteps[]> {
  return unwrap(
    await client
      .from('songs')
      .select(SONG_COLUMNS)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true }),
  );
}

export async function getSong(client: SupabaseClient, id: string): Promise<SongWithSteps> {
  return unwrap(await client.from('songs').select(SONG_COLUMNS).eq('id', id).single());
}

export async function createSong(
  client: SupabaseClient,
  input: { projectId: string; title: string },
): Promise<SongWithSteps> {
  const created = unwrap<{ id: string }>(
    await client
      .from('songs')
      .insert({ project_id: input.projectId, title: input.title.trim() })
      .select('id')
      .single(),
  );
  // The seven phases and six tracks are created by a trigger, so the inserted
  // row alone is incomplete. Read it back to get the whole song.
  return getSong(client, created.id);
}

export async function setPhaseStatus(
  client: SupabaseClient,
  id: string,
  status: StepStatus,
): Promise<void> {
  const { error } = await client.from('phase_states').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function setTrackStatus(
  client: SupabaseClient,
  id: string,
  status: StepStatus,
): Promise<void> {
  const { error } = await client.from('track_states').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function setSongNotes(
  client: SupabaseClient,
  id: string,
  notes: string,
): Promise<void> {
  const { error } = await client.from('songs').update({ notes }).eq('id', id);
  if (error) throw new Error(error.message);
}
