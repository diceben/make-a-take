-- From a checklist to a record of decisions.
--
-- The old model asked one question per phase — is it done? — with four answers,
-- and rolled the lot into one percentage. Three things were wrong with that, and
-- all three are fixed by the shape below rather than by relabelling:
--
--   * the phase a song was "in" was the first unfinished one, so a song could
--     report Writing while its tracking sat at 80%. Phases are not linear.
--   * the percentage mixed granularities: six sub-items under tracking against a
--     single toggle for mixing. It measured the interface, not the song.
--   * notes lived at the foot of the page, so a note written while tracking was
--     nowhere to be seen when it was needed, in the mix.
--
-- Song -> 7 phases -> rounds -> decisions -> steps, plus notes that travel to
-- the phase where they will be wanted.
--
-- The old phase_states and track_states stay for now. The interface still reads
-- them, and it moves over in the next steps; a later migration drops them. Two
-- shapes for a few days beats a broken page.

-- ------------------------------------------------------------------ vocabulary

-- Not the old seven. `capture` is new — the idea existing at all is a step —
-- and `produce` covers what used to be split over arrangement and pre-production.
create type public.phase_key as enum (
  'capture',
  'write',
  'produce',
  'track',
  'edit',
  'mix',
  'master'
);

-- Five stages, ordered as work actually moves. The wording that defines them
-- lives in the interface, next to every choice: the labels alone are not sharp
-- enough for a judgement about one's own work.
--
-- Deliberately called `state` and not `judgement`: stage 2 describes an
-- intention and stage 3 a result, so the scale mixes two dimensions. As a
-- sequence that is right. Nothing may treat these as evenly spaced numbers.
create type public.decision_state as enum (
  'not_touched',
  'direction_set',
  'not_quite_there',
  'feels_right',
  'locked'
);

create type public.decision_source as enum ('template', 'custom');

-- --------------------------------------------------------------------- songs

alter table public.songs add column version_label text check (
  version_label is null or length(version_label) <= 40
);
alter table public.songs add column cover_url text;
-- Set when the master is fixed. The one date that says a song is out.
alter table public.songs add column released_at timestamptz;

-- -------------------------------------------------------------------- phases

create table public.phases (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs (id) on delete cascade,
  key public.phase_key not null,
  position integer not null check (position between 1 and 7),
  current_round integer not null default 1 check (current_round >= 1),
  unique (song_id, key)
);

create index phases_song_id_idx on public.phases (song_id);

-- A phase can be walked more than once. Going back opens a new round; it
-- deletes nothing, and the previous round stays readable with its decisions in
-- it. This is why there is no reset.
create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references public.phases (id) on delete cascade,
  number integer not null check (number >= 1),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  reopen_reason text,
  unique (phase_id, number)
);

create index rounds_phase_id_idx on public.rounds (phase_id);

-- ----------------------------------------------------------------- decisions

-- The unit of the whole app. A decision is something judged, not something
-- ticked off.
create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  subtitle text check (subtitle is null or length(subtitle) <= 200),
  position integer not null default 0,
  state public.decision_state not null default 'not_touched',
  state_set_at timestamptz,
  -- Only ever set on a later calendar day than state_set_at. A judgement made
  -- and confirmed in one sitting was heard once, however sure it felt.
  state_confirmed_at timestamptz,
  source public.decision_source not null default 'template'
);

create index decisions_round_id_idx on public.decisions (round_id);

-- A step is checkable, a decision is judged. Never both on one item: if two
-- people would independently agree on the answer, it is a step.
create table public.steps (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.decisions (id) on delete cascade,
  label text not null check (length(btrim(label)) between 1 and 120),
  position integer not null default 0,
  done boolean not null default false,
  done_at timestamptz
);

create index steps_decision_id_idx on public.steps (decision_id);

-- --------------------------------------------------------------------- notes

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs (id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  author_id uuid references auth.users (id) on delete set null,
  origin_phase public.phase_key not null,
  -- Where it is wanted. Null means the phase it was written in — now.
  target_phase public.phase_key,
  -- The third target: not this song at all.
  for_next_song boolean not null default false,
  decision_id uuid references public.decisions (id) on delete set null,
  resolved_at timestamptz,
  constraint notes_one_target check (not (for_next_song and target_phase is not null))
);

create index notes_song_id_idx on public.notes (song_id);
create index notes_target_phase_idx on public.notes (song_id, target_phase)
  where resolved_at is null;

-- ----------------------------------------------------------------- templates

-- What a round is filled with when it opens. One built-in set per phase
-- (owner_id null), which anybody may override with their own.
create table public.phase_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  key public.phase_key not null,
  unique nulls not distinct (owner_id, key)
);

create table public.template_decisions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.phase_templates (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  subtitle text check (subtitle is null or length(subtitle) <= 200),
  position integer not null default 0
);

create index template_decisions_template_id_idx
  on public.template_decisions (template_id);

create table public.template_steps (
  id uuid primary key default gen_random_uuid(),
  template_decision_id uuid not null
    references public.template_decisions (id) on delete cascade,
  label text not null check (length(btrim(label)) between 1 and 120),
  position integer not null default 0
);

create index template_steps_decision_id_idx
  on public.template_steps (template_decision_id);

-- ------------------------------------------------------------------ machinery

-- Fills a round from the opener's own template for that phase, or from the
-- built-in one when they have none. Security definer: the built-in templates
-- belong to nobody, and a round is filled on behalf of whoever opened it.
create function public.fill_round(p_round uuid, p_owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key public.phase_key;
  v_template uuid;
begin
  select ph.key into v_key
  from public.rounds r
  join public.phases ph on ph.id = r.phase_id
  where r.id = p_round;

  select t.id into v_template
  from public.phase_templates t
  where t.key = v_key
    and (t.owner_id = p_owner or t.owner_id is null)
  order by t.owner_id nulls last
  limit 1;

  if v_template is null then
    return;
  end if;

  with created as (
    insert into public.decisions (round_id, title, subtitle, position, source)
    select p_round, td.title, td.subtitle, td.position, 'template'
    from public.template_decisions td
    where td.template_id = v_template
    returning id, position
  )
  insert into public.steps (decision_id, label, position)
  select created.id, ts.label, ts.position
  from created
  join public.template_decisions td
    on td.template_id = v_template and td.position = created.position
  join public.template_steps ts on ts.template_decision_id = td.id;
end;
$$;

-- Every song gets its seven phases and a first round in each, filled from the
-- templates, so the interface never meets a half-built song.
create function public.seed_song_phases()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phase uuid;
  v_round uuid;
  v_key public.phase_key;
  v_position integer := 0;
begin
  foreach v_key in array enum_range(null::public.phase_key)
  loop
    v_position := v_position + 1;

    insert into public.phases (song_id, key, position)
    values (new.id, v_key, v_position)
    returning id into v_phase;

    insert into public.rounds (phase_id, number)
    values (v_phase, 1)
    returning id into v_round;

    perform public.fill_round(v_round, new.owner_id);
  end loop;

  return new;
end;
$$;

create trigger songs_seed_phases
  after insert on public.songs
  for each row execute function public.seed_song_phases();

-- When a judgement changes, it is new and therefore unconfirmed. Choosing the
-- same stage again on a later day is the confirmation — that is the whole
-- mechanism, and it is why nothing can be confirmed in the sitting that set it.
--
-- The day is counted in UTC, because the server is the only clock both sides
-- agree on. Someone judging at 01:00 and confirming the next evening may be an
-- hour outside their own calendar day. Worth a stored timezone later; not worth
-- a guess now.
create function public.stamp_decision_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.state is distinct from old.state then
    new.state_set_at := now();
    new.state_confirmed_at := null;
  elsif old.state_set_at is not null
    and (now() at time zone 'utc')::date <> (old.state_set_at at time zone 'utc')::date
  then
    new.state_confirmed_at := coalesce(old.state_confirmed_at, now());
  end if;

  return new;
end;
$$;

create trigger decisions_stamp_state
  before update on public.decisions
  for each row execute function public.stamp_decision_state();

create function public.stamp_step_done()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.done is distinct from old.done then
    new.done_at := case when new.done then now() else null end;
  end if;
  return new;
end;
$$;

create trigger steps_stamp_done
  before update on public.steps
  for each row execute function public.stamp_step_done();

-- ------------------------------------------------------------ access control

-- One question, asked further and further from the song. Each of these reads a
-- column that is on the row being checked, so a policy can answer about a row
-- that was just inserted — see the note in supabase/README.md.
create function public.has_phase_access(p_phase uuid, p_min public.member_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_song_access((select ph.song_id from public.phases ph where ph.id = p_phase), p_min);
$$;

create function public.has_round_access(p_round uuid, p_min public.member_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_phase_access((select r.phase_id from public.rounds r where r.id = p_round), p_min);
$$;

create function public.has_decision_access(p_decision uuid, p_min public.member_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_round_access((select d.round_id from public.decisions d where d.id = p_decision), p_min);
$$;

alter table public.phases enable row level security;
alter table public.rounds enable row level security;
alter table public.decisions enable row level security;
alter table public.steps enable row level security;
alter table public.notes enable row level security;
alter table public.phase_templates enable row level security;
alter table public.template_decisions enable row level security;
alter table public.template_steps enable row level security;

-- phases and rounds are created by the triggers above; they are read, and a
-- round is closed or opened by an editor.
create policy phases_select on public.phases
  for select using (public.has_song_access(song_id, 'viewer'));

create policy phases_update on public.phases
  for update using (public.has_song_access(song_id, 'editor'))
  with check (public.has_song_access(song_id, 'editor'));

create policy rounds_select on public.rounds
  for select using (public.has_phase_access(phase_id, 'viewer'));

create policy rounds_insert on public.rounds
  for insert with check (public.has_phase_access(phase_id, 'editor'));

create policy rounds_update on public.rounds
  for update using (public.has_phase_access(phase_id, 'editor'))
  with check (public.has_phase_access(phase_id, 'editor'));

create policy decisions_select on public.decisions
  for select using (public.has_round_access(round_id, 'viewer'));

create policy decisions_insert on public.decisions
  for insert with check (public.has_round_access(round_id, 'editor'));

create policy decisions_update on public.decisions
  for update using (public.has_round_access(round_id, 'editor'))
  with check (public.has_round_access(round_id, 'editor'));

create policy decisions_delete on public.decisions
  for delete using (public.has_round_access(round_id, 'editor'));

create policy steps_select on public.steps
  for select using (public.has_decision_access(decision_id, 'viewer'));

create policy steps_insert on public.steps
  for insert with check (public.has_decision_access(decision_id, 'editor'));

create policy steps_update on public.steps
  for update using (public.has_decision_access(decision_id, 'editor'))
  with check (public.has_decision_access(decision_id, 'editor'));

create policy steps_delete on public.steps
  for delete using (public.has_decision_access(decision_id, 'editor'));

create policy notes_select on public.notes
  for select using (public.has_song_access(song_id, 'viewer'));

create policy notes_insert on public.notes
  for insert with check (public.has_song_access(song_id, 'editor'));

create policy notes_update on public.notes
  for update using (public.has_song_access(song_id, 'editor'))
  with check (public.has_song_access(song_id, 'editor'));

create policy notes_delete on public.notes
  for delete using (public.has_song_access(song_id, 'editor'));

-- Templates: everybody reads the built-in set, everybody edits only their own.
create policy phase_templates_select on public.phase_templates
  for select using (owner_id is null or owner_id = (select auth.uid()));

create policy phase_templates_write on public.phase_templates
  for all using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy template_decisions_select on public.template_decisions
  for select using (
    exists (
      select 1 from public.phase_templates t
      where t.id = template_id
        and (t.owner_id is null or t.owner_id = (select auth.uid()))
    )
  );

create policy template_decisions_write on public.template_decisions
  for all using (
    exists (
      select 1 from public.phase_templates t
      where t.id = template_id and t.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.phase_templates t
      where t.id = template_id and t.owner_id = (select auth.uid())
    )
  );

create policy template_steps_select on public.template_steps
  for select using (
    exists (
      select 1
      from public.template_decisions td
      join public.phase_templates t on t.id = td.template_id
      where td.id = template_decision_id
        and (t.owner_id is null or t.owner_id = (select auth.uid()))
    )
  );

create policy template_steps_write on public.template_steps
  for all using (
    exists (
      select 1
      from public.template_decisions td
      join public.phase_templates t on t.id = td.template_id
      where td.id = template_decision_id and t.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.template_decisions td
      join public.phase_templates t on t.id = td.template_id
      where td.id = template_decision_id and t.owner_id = (select auth.uid())
    )
  );
