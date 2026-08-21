-- Filling a phase from its template, and moving the machinery out of reach.
--
-- Two things here, and the second is why the first is written the way it is.
--
-- 1. Capture and write are empty or nearly empty on every carried-over song.
--    The carry-over left capture with nothing (there was nothing to carry) and
--    gave write a single decision named "Writing" — the phase's own name, which
--    says nothing about what to decide. The built-in templates have had the real
--    content all along; it never reached a song that existed before they did.
--
-- 2. `fill_round` is `security definer` and checks nothing: it takes a round id
--    and an owner id and does as it is told. It sat in `public`, which
--    PostgREST exposes as RPC, and Supabase grants `authenticated` execute on
--    everything there — so any signed-in account could add decisions to a song
--    it cannot read. Uuids are obscurity, not a permission.
--
--    Revoking would not have held. The grant is applied to the schema, so the
--    next one puts it back. The fix is that the machinery does not live in a
--    schema anybody can reach.

create schema if not exists private;
revoke all on schema private from public;

-- ------------------------------------------------------ out of reach

create function private.fill_round(p_round uuid, p_owner uuid)
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

/*
 * Adds a template's decisions to a round, skipping any whose title is already
 * there.
 *
 * By title rather than by id, because a round can hold decisions from several
 * sources — the template, the carry-over, and later a person. Matching on the
 * title is what stops "Structure" appearing twice when only one of them came
 * from the template, and it is what makes pressing the button twice safe.
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

  -- The caller's own template for this phase wins over the built-in one.
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

-- ------------------------------------------------------ the trigger follows it

-- Recreated only to call the function at its new address. Same body otherwise.
create or replace function public.seed_song_phases()
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

    perform private.fill_round(v_round, new.owner_id);
  end loop;

  return new;
end;
$$;

drop function public.fill_round(uuid, uuid);

-- ------------------------------------------------------------- the way in

/*
 * The one thing the app may call: fill the round this phase is on.
 *
 * Everything the old function was missing. It asks whether you may edit this
 * song before it does anything, and it takes the owner from the session rather
 * than from an argument, so there is nothing to pass that could point somewhere
 * else.
 */
create function public.fill_phase_from_template(p_phase uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round uuid;
begin
  if not public.has_phase_access(p_phase, 'editor') then
    raise exception 'not allowed to edit this song' using errcode = '42501';
  end if;

  select r.id into v_round
  from public.rounds r
  join public.phases ph on ph.id = r.phase_id
  where ph.id = p_phase
    and r.number = ph.current_round;

  if v_round is null then
    return 0;
  end if;

  return private.fill_round_gaps(v_round, (select auth.uid()));
end;
$$;

-- ------------------------------------------------ the songs that were left empty

-- Capture and write on every song that already exists. Nothing is renamed,
-- moved or deleted: the carried-over decisions keep the states they were given,
-- and the template's decisions join them at the end.
do $$
declare
  v_row record;
begin
  for v_row in
    select r.id as round_id, s.owner_id
    from public.rounds r
    join public.phases ph on ph.id = r.phase_id
    join public.songs s on s.id = ph.song_id
    where ph.key in ('capture', 'write')
      and r.number = ph.current_round
  loop
    perform private.fill_round_gaps(v_row.round_id, v_row.owner_id);
  end loop;
end;
$$;
