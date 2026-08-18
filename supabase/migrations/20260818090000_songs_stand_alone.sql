-- Songs stand on their own; the project layer is gone.
--
-- A song used to live inside a project (an album or EP), and the project
-- carried the owner and the sharing. That made writing down a song a two-step
-- job — invent a release first, then put the song in it — and it grouped songs
-- by a record that may not exist yet. Songs now carry their own owner and their
-- own artist name, and the list groups by that name.
--
-- Nothing is thrown away. Every song keeps its steps, inherits its project's
-- owner, and inherits the project's artist where it had none of its own. A
-- membership that granted access to a whole project becomes one membership per
-- song in it, so nobody loses anything they could reach before.
--
-- Access control now lives in one function, has_song_access(). There is no
-- project left to ask about.

-- --------------------------------------------------------- songs own themselves

alter table public.songs
  add column owner_id uuid references auth.users (id) on delete cascade;

update public.songs s
set owner_id = p.owner_id
from public.projects p
where p.id = s.project_id;

alter table public.songs alter column owner_id set not null;

create index songs_owner_id_idx on public.songs (owner_id);

-- The project's artist was the closest thing a song had to one of its own.
update public.songs s
set artist = p.artist
from public.projects p
where p.id = s.project_id
  and s.artist is null
  and p.artist is not null;

-- ------------------------------------------------- memberships target songs only

-- Fan a project membership out over that project's songs. Where someone already
-- held a membership on one of those songs, the stronger of the two roles wins —
-- expanding an invitation must not quietly demote anybody.
insert into public.memberships (user_id, role, song_id)
select m.user_id, m.role, s.id
from public.memberships m
join public.songs s on s.project_id = m.project_id
where m.project_id is not null
on conflict (user_id, song_id) do update
set role = case
  when public.role_rank(excluded.role) > public.role_rank(public.memberships.role)
    then excluded.role
  else public.memberships.role
end;

delete from public.memberships where project_id is not null;

-- ----------------------------------------------------- out with the old policies

-- Every one of these reads a column that is about to disappear, so they have to
-- go before it does. They are rebuilt against the new shape further down.
drop policy songs_select on public.songs;
drop policy songs_insert on public.songs;
drop policy songs_update on public.songs;
drop policy songs_delete on public.songs;

drop policy memberships_select on public.memberships;
drop policy memberships_insert on public.memberships;
drop policy memberships_delete on public.memberships;

-- ------------------------------------------------------------ dropping the layer

alter table public.memberships drop constraint memberships_one_target;
drop index if exists memberships_project_id_idx;
alter table public.memberships drop column project_id;
alter table public.memberships alter column song_id set not null;

alter table public.songs drop column project_id;
drop table public.projects;

-- One question, one place to answer it: does the current user hold at least
-- p_min on this song, as its owner or through a membership on it?
create or replace function public.has_song_access(p_song uuid, p_min public.member_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.songs s
    where s.id = p_song
      and s.owner_id = (select auth.uid())
  ) or exists (
    select 1
    from public.memberships m
    where m.song_id = p_song
      and m.user_id = (select auth.uid())
      and public.role_rank(m.role) >= public.role_rank(p_min)
  );
$$;

-- ------------------------------------------------------- in with the new ones

-- songs. The select policy reads owner_id straight off the row before falling
-- back to a lookup, so a song can be read back by the statement that created it
-- — see the note in supabase/README.md.
create policy songs_select on public.songs
  for select using (
    owner_id = (select auth.uid())
    or public.has_song_access(id, 'viewer')
  );

create policy songs_insert on public.songs
  for insert with check (owner_id = (select auth.uid()));

create policy songs_update on public.songs
  for update using (public.has_song_access(id, 'editor'))
  with check (public.has_song_access(id, 'editor'));

create policy songs_delete on public.songs
  for delete using (owner_id = (select auth.uid()));

-- memberships: you see your own, and an owner sees everyone's on their songs.
create policy memberships_select on public.memberships
  for select using (
    user_id = (select auth.uid())
    or public.has_song_access(song_id, 'owner')
  );

create policy memberships_insert on public.memberships
  for insert with check (public.has_song_access(song_id, 'owner'));

create policy memberships_delete on public.memberships
  for delete using (public.has_song_access(song_id, 'owner'));

drop function public.has_project_access(uuid, public.member_role);
