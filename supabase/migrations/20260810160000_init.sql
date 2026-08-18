-- Make a Take — initial schema.
--
-- Shape: project (album/EP) -> song -> seven fixed phases. Tracks hang off the
-- tracking phase only. Every song gets its seven phase rows and six track rows
-- from a trigger, so the frontend never has to deal with "not created yet".
--
-- Access control lives in exactly two functions, has_project_access() and
-- has_song_access(). Every policy calls one of them; no policy reasons about
-- membership on its own. Tested in supabase/tests/rls.test.sql.

-- ---------------------------------------------------------------- enumerations

create type public.phase as enum (
  'writing',
  'arrangement',
  'preproduction',
  'tracking',
  'editing',
  'mixing',
  'mastering'
);

create type public.track as enum (
  'drums',
  'bass',
  'guitars',
  'keys',
  'lead_vocals',
  'backing_vocals'
);

create type public.step_status as enum ('todo', 'doing', 'review', 'done');

create type public.member_role as enum ('owner', 'editor', 'viewer');

-- --------------------------------------------------------------------- tables

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  theme text check (theme in ('dark', 'light')),
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  artist text check (artist is null or length(artist) <= 200),
  deadline date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_owner_id_idx on public.projects (owner_id);

create table public.songs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  artist text check (artist is null or length(artist) <= 200),
  deadline date,
  notes text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index songs_project_id_idx on public.songs (project_id);

create table public.phase_states (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs (id) on delete cascade,
  phase public.phase not null,
  status public.step_status not null default 'todo',
  note text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (song_id, phase)
);

create index phase_states_song_id_idx on public.phase_states (song_id);

create table public.track_states (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs (id) on delete cascade,
  track public.track not null,
  status public.step_status not null default 'todo',
  note text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (song_id, track)
);

create index track_states_song_id_idx on public.track_states (song_id);

-- A membership grants a role on EITHER a whole project OR a single song,
-- never both and never neither.
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'editor',
  project_id uuid references public.projects (id) on delete cascade,
  song_id uuid references public.songs (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint memberships_one_target check (num_nonnulls(project_id, song_id) = 1),
  unique (user_id, project_id),
  unique (user_id, song_id)
);

create index memberships_user_id_idx on public.memberships (user_id);
create index memberships_project_id_idx on public.memberships (project_id);
create index memberships_song_id_idx on public.memberships (song_id);

-- ------------------------------------------------------------ access control

-- Roles are ordered: owner outranks editor outranks viewer.
create function public.role_rank(p_role public.member_role)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_role
    when 'viewer' then 1
    when 'editor' then 2
    when 'owner' then 3
  end;
$$;

-- Does the current user hold at least p_min on this project?
-- SECURITY DEFINER so policies can consult memberships without recursing into
-- the policies on memberships itself.
create function public.has_project_access(p_project uuid, p_min public.member_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project
      and p.owner_id = (select auth.uid())
  ) or exists (
    select 1
    from public.memberships m
    where m.project_id = p_project
      and m.user_id = (select auth.uid())
      and public.role_rank(m.role) >= public.role_rank(p_min)
  );
$$;

-- Does the current user hold at least p_min on this song, either through the
-- project it belongs to or through a membership on the song itself?
create function public.has_song_access(p_song uuid, p_min public.member_role)
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
      and public.has_project_access(s.project_id, p_min)
  ) or exists (
    select 1
    from public.memberships m
    where m.song_id = p_song
      and m.user_id = (select auth.uid())
      and public.role_rank(m.role) >= public.role_rank(p_min)
  );
$$;

-- ------------------------------------------------------------------- triggers

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger projects_touch_updated_at
  before update on public.projects
  for each row execute function public.touch_updated_at();

create trigger songs_touch_updated_at
  before update on public.songs
  for each row execute function public.touch_updated_at();

-- Stamp who changed a step and when. The client never sends these.
create function public.stamp_step_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

create trigger phase_states_stamp
  before update on public.phase_states
  for each row execute function public.stamp_step_change();

create trigger track_states_stamp
  before update on public.track_states
  for each row execute function public.stamp_step_change();

-- Every song owns all seven phases and all six tracks from the moment it
-- exists. SECURITY DEFINER because the inserting user has no direct insert
-- rights on these tables — only the trigger may create them.
create function public.seed_song_steps()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.phase_states (song_id, phase)
  select new.id, p from unnest(enum_range(null::public.phase)) as p;

  insert into public.track_states (song_id, track)
  select new.id, t from unnest(enum_range(null::public.track)) as t;

  return new;
end;
$$;

create trigger songs_seed_steps
  after insert on public.songs
  for each row execute function public.seed_song_steps();

-- A profile row for every new account.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------ row level security

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.songs enable row level security;
alter table public.phase_states enable row level security;
alter table public.track_states enable row level security;
alter table public.memberships enable row level security;

-- profiles: yours and nobody else's.
create policy profiles_select_own on public.profiles
  for select using (id = (select auth.uid()));

create policy profiles_update_own on public.profiles
  for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy profiles_insert_own on public.profiles
  for insert with check (id = (select auth.uid()));

-- projects
create policy projects_select on public.projects
  for select using (public.has_project_access(id, 'viewer'));

create policy projects_insert on public.projects
  for insert with check (owner_id = (select auth.uid()));

create policy projects_update on public.projects
  for update using (public.has_project_access(id, 'editor'))
  with check (public.has_project_access(id, 'editor'));

create policy projects_delete on public.projects
  for delete using (owner_id = (select auth.uid()));

-- songs
create policy songs_select on public.songs
  for select using (public.has_song_access(id, 'viewer'));

create policy songs_insert on public.songs
  for insert with check (public.has_project_access(project_id, 'editor'));

create policy songs_update on public.songs
  for update using (public.has_song_access(id, 'editor'))
  with check (public.has_song_access(id, 'editor'));

create policy songs_delete on public.songs
  for delete using (public.has_project_access(project_id, 'owner'));

-- phase_states and track_states: read with view rights, change with edit
-- rights. No insert or delete policy — only the seeding trigger creates these,
-- and they die with their song.
create policy phase_states_select on public.phase_states
  for select using (public.has_song_access(song_id, 'viewer'));

create policy phase_states_update on public.phase_states
  for update using (public.has_song_access(song_id, 'editor'))
  with check (public.has_song_access(song_id, 'editor'));

create policy track_states_select on public.track_states
  for select using (public.has_song_access(song_id, 'viewer'));

create policy track_states_update on public.track_states
  for update using (public.has_song_access(song_id, 'editor'))
  with check (public.has_song_access(song_id, 'editor'));

-- memberships: you see your own, and owners see everyone's on what they own.
create policy memberships_select on public.memberships
  for select using (
    user_id = (select auth.uid())
    or (project_id is not null and public.has_project_access(project_id, 'owner'))
    or (song_id is not null and public.has_song_access(song_id, 'owner'))
  );

create policy memberships_insert on public.memberships
  for insert with check (
    (project_id is not null and public.has_project_access(project_id, 'owner'))
    or (song_id is not null and public.has_song_access(song_id, 'owner'))
  );

create policy memberships_delete on public.memberships
  for delete using (
    (project_id is not null and public.has_project_access(project_id, 'owner'))
    or (song_id is not null and public.has_song_access(song_id, 'owner'))
  );
