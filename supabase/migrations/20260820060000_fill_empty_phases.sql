-- The decisions in a phase are given, so a round fills itself.
--
-- Three things, and the first is the rule the other two follow from.
--
-- 1. What a phase asks you to decide is not something a person assembles. It
--    comes from the template, it is the same for every song, and it should be
--    there without anybody putting it there. Filling was never an action; it was
--    a gap where the rule had not been applied.
--
--    Round 1 of a new song was filled, and nothing else ever was. Reopening a
--    phase produced an empty round: you went back into the mix and found
--    nothing to decide. This makes it one rule instead of one special case —
--    every round is filled when it is created.
--
-- 2. Capture is empty on every carried-over song and write holds one decision
--    called "Writing", the phase's own name. The templates have had the real
--    content all along; it never reached a song that existed before they did.
--
-- 3. `fill_round` was `security definer` and checked nothing: a round id, an
--    owner id, and it did as it was told. It sat in `public`, which PostgREST
--    exposes as RPC and where Supabase grants `authenticated` execute on
--    everything — so any signed-in account could add decisions to a song it
--    cannot read. Uuids are obscurity, not a permission.
--
--    Revoking would not have held: the grant is applied to the schema, so the
--    next one puts it back. It moves to a schema nothing exposes instead, and
--    since filling is now a rule rather than an action, nothing outside the
--    database needs to call it at all.

create schema if not exists private;
revoke all on schema private from public;

-- ------------------------------------------------------------- out of reach

/*
 * Adds a template's decisions to a round, skipping any whose title is already
 * there.
 *
 * By title rather than by id, because a round can hold decisions from more than
 * one source — the template and, on the older songs, the carry-over. Matching on
 * the words is what stops "Structure" appearing twice, and what makes running
 * this over an existing round safe.
 */
create function private.fill_round_gaps(p_round uuid, p_owner uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key public.phase_key;
  v_template uuid;
  v_added integer := 0;
  v_next integer;
begin
  select ph.key into v_key
  from public.rounds r
  join public.phases ph on ph.id = r.phase_id
  where r.id = p_round;

  if v_key is null then
    return 0;
  end if;

  -- The owner's own template for this phase wins over the built-in one.
  select t.id into v_template
  from public.phase_templates t
  where t.key = v_key
    and (t.owner_id = p_owner or t.owner_id is null)
  order by t.owner_id nulls last
  limit 1;

  if v_template is null then
    return 0;
  end if;

  -- New decisions land after whatever is already in the round, so nothing that
  -- was carried over is reordered underneath something that arrived later.
  select coalesce(max(d.position) + 1, 0) into v_next
  from public.decisions d
  where d.round_id = p_round;

  create temporary table if not exists wanted_decisions (
    template_decision_id uuid,
    title text,
    subtitle text,
    position integer
  ) on commit drop;
  delete from wanted_decisions;

  insert into wanted_decisions
  select
    td.id,
    td.title,
    td.subtitle,
    v_next + (row_number() over (order by td.position))::integer - 1
  from public.template_decisions td
  where td.template_id = v_template
    and not exists (
      select 1
      from public.decisions d
      where d.round_id = p_round
        and lower(btrim(d.title)) = lower(btrim(td.title))
    );

  with created as (
    insert into public.decisions (round_id, title, subtitle, position, source)
    select p_round, w.title, w.subtitle, w.position, 'template'
    from wanted_decisions w
    returning id, position
  )
  insert into public.steps (decision_id, label, position)
  select created.id, ts.label, ts.position
  from created
  join wanted_decisions w on w.position = created.position
  join public.template_steps ts on ts.template_decision_id = w.template_decision_id;

  select count(*)::integer into v_added from wanted_decisions;
  return v_added;
end;
$$;

-- --------------------------------------------------------- one rule, one place

/*
 * Every round arrives with what its phase asks you to decide.
 *
 * On the round rather than on the song, so that going back gets the same
 * treatment as starting: reopening the mix should hand you the mix's decisions,
 * not an empty page and a reason to wonder where they went.
 */
create function public.fill_new_round()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select s.owner_id into v_owner
  from public.phases ph
  join public.songs s on s.id = ph.song_id
  where ph.id = new.phase_id;

  perform private.fill_round_gaps(new.id, v_owner);
  return new;
end;
$$;

create trigger rounds_fill_from_template
  after insert on public.rounds
  for each row execute function public.fill_new_round();

-- The song trigger no longer fills anything itself: the rounds it creates fill
-- themselves on the way in. Same body otherwise.
create or replace function public.seed_song_phases()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phase uuid;
  v_key public.phase_key;
  v_position integer := 0;
begin
  foreach v_key in array enum_range(null::public.phase_key)
  loop
    v_position := v_position + 1;

    insert into public.phases (song_id, key, position)
    values (new.id, v_key, v_position)
    returning id into v_phase;

    insert into public.rounds (phase_id, number) values (v_phase, 1);
  end loop;

  return new;
end;
$$;

drop function public.fill_round(uuid, uuid);

-- --------------------------------------------- the rounds that were left empty

-- Every round of every song that already exists, not only capture and write:
-- the rule is that a round holds its phase's decisions, and these are the rounds
-- that were made before the rule was. Nothing is renamed, moved or deleted — the
-- carried-over decisions keep the states they were given, and the template's
-- join them at the end.
do $$
declare
  v_row record;
begin
  for v_row in
    select r.id as round_id, s.owner_id
    from public.rounds r
    join public.phases ph on ph.id = r.phase_id
    join public.songs s on s.id = ph.song_id
  loop
    perform private.fill_round_gaps(v_row.round_id, v_row.owner_id);
  end loop;
end;
$$;
