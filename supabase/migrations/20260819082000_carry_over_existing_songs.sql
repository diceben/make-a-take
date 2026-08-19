-- Carry the songs that already exist into the new shape.
--
-- The old seven phases do not line up one to one with the new seven, so the
-- mapping is stated here rather than guessed at read time:
--
--   writing        -> write        arrangement    -> produce
--   preproduction  -> produce      tracking       -> (its six tracks)
--   editing        -> edit         mixing         -> mix
--   mastering      -> master       capture        -> nothing to carry
--
-- Tracking never had a status of its own — it was the six tracks underneath it —
-- so those six become six decisions in `track`, which is what they always were.
--
-- The states are mapped conservatively:
--
--   todo   -> not_touched      review -> not_quite_there
--   doing  -> direction_set    done   -> feels_right
--
-- Nothing becomes `locked`. Locked means "I would not touch it again even with
-- time", and the old model never asked that question. Inventing the answer would
-- put words in somebody's mouth about work they did weeks ago.
--
-- Phases with nothing to carry stay empty rather than being filled from the
-- template. An empty phase is the truth about these songs; template decisions
-- would look like work that was planned and never done.

do $$
declare
  v_song record;
  v_phase uuid;
  v_round uuid;
  v_key public.phase_key;
  v_position integer;
begin
  for v_song in select id, owner_id, notes from public.songs loop
    v_position := 0;

    foreach v_key in array enum_range(null::public.phase_key)
    loop
      v_position := v_position + 1;

      insert into public.phases (song_id, key, position)
      values (v_song.id, v_key, v_position)
      on conflict (song_id, key) do nothing
      returning id into v_phase;

      -- The trigger on songs only fires for new rows, so nothing here should
      -- collide; skip defensively if it somehow did.
      if v_phase is null then
        continue;
      end if;

      insert into public.rounds (phase_id, number)
      values (v_phase, 1)
      returning id into v_round;

      if v_key = 'track' then
        insert into public.decisions (round_id, title, position, state, state_set_at, source)
        select
          v_round,
          initcap(replace(t.track::text, '_', ' ')),
          row_number() over (order by t.track) - 1,
          case t.status
            when 'todo' then 'not_touched'::public.decision_state
            when 'doing' then 'direction_set'
            when 'review' then 'not_quite_there'
            else 'feels_right'
          end,
          case when t.status = 'todo' then null else t.updated_at end,
          'template'
        from public.track_states t
        where t.song_id = v_song.id;

      else
        insert into public.decisions (round_id, title, position, state, state_set_at, source)
        select
          v_round,
          initcap(replace(p.phase::text, '_', ' ')),
          0,
          case p.status
            when 'todo' then 'not_touched'::public.decision_state
            when 'doing' then 'direction_set'
            when 'review' then 'not_quite_there'
            else 'feels_right'
          end,
          case when p.status = 'todo' then null else p.updated_at end,
          'template'
        from public.phase_states p
        where p.song_id = v_song.id
          and case p.phase
            when 'writing' then 'write'
            when 'arrangement' then 'produce'
            when 'preproduction' then 'produce'
            when 'editing' then 'edit'
            when 'mixing' then 'mix'
            when 'mastering' then 'master'
            else null
          end = v_key::text;
      end if;
    end loop;

    -- The one free-text field the old shape had. It belonged to the whole song
    -- and to no phase, so it lands where writing starts and waits for nobody.
    if btrim(coalesce(v_song.notes, '')) <> '' then
      insert into public.notes (song_id, body, author_id, origin_phase, target_phase)
      values (v_song.id, v_song.notes, v_song.owner_id, 'write', null);
    end if;
  end loop;
end;
$$;

-- Positions inside `produce`, which received two old phases and would otherwise
-- have two decisions both claiming position 0.
with ordered as (
  select d.id, row_number() over (partition by d.round_id order by d.title) - 1 as position
  from public.decisions d
  join public.rounds r on r.id = d.round_id
  join public.phases ph on ph.id = r.phase_id
  where ph.key = 'produce'
)
update public.decisions d
set position = ordered.position
from ordered
where ordered.id = d.id;
