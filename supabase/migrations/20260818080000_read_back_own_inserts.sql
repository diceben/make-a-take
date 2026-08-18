-- Let a row be read back in the statement that created it.
--
-- `.insert().select()` in supabase-js sends INSERT ... RETURNING, and Postgres
-- checks the new row against the SELECT policy before handing it back. Both
-- select policies asked the access functions about the row *by id*, and those
-- functions look the row up in the table — where it does not exist yet, because
-- the inserting command has not made it visible. So creating a project or a
-- song failed with "new row violates row-level security policy", even though
-- the insert itself was allowed.
--
-- The fix is to answer the question from the columns of the row at hand
-- wherever that is possible, and only then fall back to a lookup:
--
--   projects: the owner is right there in owner_id, no lookup needed
--   songs:    the project is right there in project_id, and that project
--             already exists, so looking *it* up is fine
--
-- Membership logic still lives in has_project_access() and has_song_access();
-- neither policy reasons about memberships on its own. For rows that already
-- exist both additions are redundant — has_project_access() covers the owner,
-- and has_song_access() already consults the project. They matter only for the
-- row being inserted.

drop policy projects_select on public.projects;

create policy projects_select on public.projects
  for select using (
    owner_id = (select auth.uid())
    or public.has_project_access(id, 'viewer')
  );

drop policy songs_select on public.songs;

create policy songs_select on public.songs
  for select using (
    public.has_project_access(project_id, 'viewer')
    or public.has_song_access(id, 'viewer')
  );
