-- The decision model: rounds, judgements, steps and notes.
--
-- These follow the acceptance criteria that the database is answerable for. The
-- ones about the interface (no percentage anywhere, studio mode) belong to the
-- browser tests.

\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('aaaa0000-0000-0000-0000-00000000000a', 'writer@example.com'),
  ('bbbb0000-0000-0000-0000-00000000000b', 'editor@example.com'),
  ('cccc0000-0000-0000-0000-00000000000c', 'viewer@example.com'),
  ('dddd0000-0000-0000-0000-00000000000d', 'stranger@example.com');

insert into public.songs (id, owner_id, title, artist) values
  ('50000000-0000-0000-0000-000000000001',
   'aaaa0000-0000-0000-0000-00000000000a', 'Midnight Drive', 'Sarah Kane');

insert into public.memberships (user_id, role, song_id) values
  ('bbbb0000-0000-0000-0000-00000000000b', 'editor', '50000000-0000-0000-0000-000000000001'),
  ('cccc0000-0000-0000-0000-00000000000c', 'viewer', '50000000-0000-0000-0000-000000000001');

-- ------------------------------------------------ what a new song is born with

select test.ok(
  (select count(*) from public.phases where song_id = '50000000-0000-0000-0000-000000000001') = 7,
  'a new song gets all seven phases');

select test.ok(
  (select count(*) from public.rounds r
   join public.phases ph on ph.id = r.phase_id
   where ph.song_id = '50000000-0000-0000-0000-000000000001' and r.number = 1) = 7,
  'every phase opens on round 1');

select test.ok(
  (select array_agg(key order by position)
   from public.phases where song_id = '50000000-0000-0000-0000-000000000001')
   = array['capture','write','produce','track','edit','mix','master']::public.phase_key[],
  'the phases are in the order of the work');

select test.ok(
  (select count(*) from public.decisions d
   join public.rounds r on r.id = d.round_id
   join public.phases ph on ph.id = r.phase_id
   where ph.song_id = '50000000-0000-0000-0000-000000000001' and ph.key = 'mix') = 6,
  'the mix phase is filled from the template');

select test.ok(
  (select count(*) from public.steps s
   join public.decisions d on d.id = s.decision_id
   join public.rounds r on r.id = d.round_id
   join public.phases ph on ph.id = r.phase_id
   where ph.song_id = '50000000-0000-0000-0000-000000000001'
     and ph.key = 'mix' and d.title = 'Vocal compression') = 4,
  'a template decision brings its steps with it');

select test.ok(
  (select count(*) from public.decisions d
   join public.rounds r on r.id = d.round_id
   join public.phases ph on ph.id = r.phase_id
   where ph.song_id = '50000000-0000-0000-0000-000000000001'
     and d.state <> 'not_touched') = 0,
  'nothing arrives already judged');

-- ------------------------------------------------------ judgements and ageing

-- Defined before dropping privileges: `authenticated` may not create functions.
create or replace function test.mix_decision(p_title text)
returns uuid
language sql
as $$
  select d.id
  from public.decisions d
  join public.rounds r on r.id = d.round_id
  join public.phases ph on ph.id = r.phase_id
  where ph.song_id = '50000000-0000-0000-0000-000000000001'
    and ph.key = 'mix' and d.title = p_title;
$$;

grant execute on function test.mix_decision(text) to authenticated;

set role authenticated;
select test.login('aaaa0000-0000-0000-0000-00000000000a');

update public.decisions set state = 'feels_right' where id = test.mix_decision('Static balance');

select test.ok(
  (select state_set_at is not null and state_confirmed_at is null
   from public.decisions where id = test.mix_decision('Static balance')),
  'setting a judgement stamps when, and leaves it unconfirmed');

-- The whole point: a judgement made and confirmed in one sitting was heard once.
update public.decisions set state = 'feels_right' where id = test.mix_decision('Static balance');

select test.ok(
  (select state_confirmed_at is null
   from public.decisions where id = test.mix_decision('Static balance')),
  'choosing the same stage again the same day confirms nothing');

reset role;

-- Backdate without the trigger looking, which is the only way to reach
-- yesterday from inside a test.
alter table public.decisions disable trigger decisions_stamp_state;
update public.decisions
set state_set_at = now() - interval '2 days'
where id = test.mix_decision('Static balance');
alter table public.decisions enable trigger decisions_stamp_state;

set role authenticated;
select test.login('aaaa0000-0000-0000-0000-00000000000a');

update public.decisions set state = 'feels_right' where id = test.mix_decision('Static balance');

select test.ok(
  (select state_confirmed_at is not null
   from public.decisions where id = test.mix_decision('Static balance')),
  'choosing it again on a later day is the confirmation');

-- Changing your mind starts the clock over.
update public.decisions set state = 'locked' where id = test.mix_decision('Static balance');

select test.ok(
  (select state_confirmed_at is null
   from public.decisions where id = test.mix_decision('Static balance')),
  'a changed judgement is unconfirmed again');

-- ---------------------------------------------------------------------- steps

update public.steps set done = true
where decision_id = test.mix_decision('Vocal compression') and label = 'Threshold';

select test.ok(
  (select done_at is not null from public.steps
   where decision_id = test.mix_decision('Vocal compression') and label = 'Threshold'),
  'ticking a step stamps when');

update public.steps set done = false
where decision_id = test.mix_decision('Vocal compression') and label = 'Threshold';

select test.ok(
  (select done_at is null from public.steps
   where decision_id = test.mix_decision('Vocal compression') and label = 'Threshold'),
  'unticking it clears the stamp rather than keeping a lie');

-- ---------------------------------------------------------------------- notes

insert into public.notes (song_id, body, author_id, origin_phase, target_phase) values
  ('50000000-0000-0000-0000-000000000001', 'Snare needs another round',
   'aaaa0000-0000-0000-0000-00000000000a', 'track', 'mix'),
  ('50000000-0000-0000-0000-000000000001', 'Second verse is a placeholder',
   'aaaa0000-0000-0000-0000-00000000000a', 'write', null);

insert into public.notes (song_id, body, author_id, origin_phase, for_next_song) values
  ('50000000-0000-0000-0000-000000000001', 'Track the room mic higher next time',
   'aaaa0000-0000-0000-0000-00000000000a', 'track', true);

select test.ok(
  (select count(*) from public.notes
   where song_id = '50000000-0000-0000-0000-000000000001'
     and target_phase = 'mix' and resolved_at is null) = 1,
  'a note aimed at mix waits in mix');

select test.ok(
  (select count(*) from public.notes
   where song_id = '50000000-0000-0000-0000-000000000001'
     and target_phase = 'track' and resolved_at is null) = 0,
  'and nowhere else, not even where it was written');

select test.ok(
  (select count(*) from public.notes
   where song_id = '50000000-0000-0000-0000-000000000001' and for_next_song) = 1,
  'a note can be addressed to the next song instead');

select test.denied(
  $$insert into public.notes (song_id, body, origin_phase, target_phase, for_next_song)
    values ('50000000-0000-0000-0000-000000000001', 'Both at once',
            'track', 'mix', true)$$,
  'a note cannot be aimed at a phase and at the next song at the same time');

-- --------------------------------------------------------------------- rounds

-- Going back opens a round. It deletes nothing.
select test.ok(
  (select count(*) from public.decisions d
   join public.rounds r on r.id = d.round_id
   where r.id = (select r2.id from public.rounds r2
                 join public.phases ph on ph.id = r2.phase_id
                 where ph.song_id = '50000000-0000-0000-0000-000000000001'
                   and ph.key = 'mix' and r2.number = 1)) = 6,
  'round 1 of mix holds its six decisions');

insert into public.rounds (phase_id, number, reopen_reason)
select ph.id, 2, 'Vocal sounds thin next to the reference'
from public.phases ph
where ph.song_id = '50000000-0000-0000-0000-000000000001' and ph.key = 'mix';

update public.phases set current_round = 2
where song_id = '50000000-0000-0000-0000-000000000001' and key = 'mix';

update public.rounds set closed_at = now()
where phase_id = (select id from public.phases
                  where song_id = '50000000-0000-0000-0000-000000000001' and key = 'mix')
  and number = 1;

select test.ok(
  (select count(*) from public.decisions d
   join public.rounds r on r.id = d.round_id
   where r.id = (select r2.id from public.rounds r2
                 join public.phases ph on ph.id = r2.phase_id
                 where ph.song_id = '50000000-0000-0000-0000-000000000001'
                   and ph.key = 'mix' and r2.number = 1)) = 6,
  'opening round 2 leaves round 1 exactly as it was');

select test.ok(
  (select current_round from public.phases
   where song_id = '50000000-0000-0000-0000-000000000001' and key = 'mix') = 2,
  'the phase is on round 2');

-- --------------------------------------------------------- who may touch what

select test.login('cccc0000-0000-0000-0000-00000000000c');

select test.ok(
  (select count(*) from public.decisions d
   join public.rounds r on r.id = d.round_id
   join public.phases ph on ph.id = r.phase_id
   where ph.song_id = '50000000-0000-0000-0000-000000000001') > 0,
  'a viewer can read the decisions');

update public.decisions set state = 'locked' where id = test.mix_decision('Automation pass');

select test.ok(
  (select state from public.decisions where id = test.mix_decision('Automation pass'))
    = 'not_touched',
  'a viewer cannot judge');

select test.denied(
  $$insert into public.notes (song_id, body, origin_phase)
    values ('50000000-0000-0000-0000-000000000001', 'Let me in', 'mix')$$,
  'a viewer cannot leave a note');

select test.login('bbbb0000-0000-0000-0000-00000000000b');

update public.decisions set state = 'direction_set' where id = test.mix_decision('Automation pass');

select test.ok(
  (select state from public.decisions where id = test.mix_decision('Automation pass'))
    = 'direction_set',
  'an editor can judge');

select test.login('dddd0000-0000-0000-0000-00000000000d');

select test.ok((select count(*) from public.phases) = 0, 'a stranger sees no phases');
select test.ok((select count(*) from public.decisions) = 0, 'a stranger sees no decisions');
select test.ok((select count(*) from public.steps) = 0, 'a stranger sees no steps');
select test.ok((select count(*) from public.notes) = 0, 'a stranger sees no notes');

-- The built-in templates are the one thing everybody may read: they are the
-- starting point of every song, and they belong to nobody.
select test.ok(
  (select count(*) from public.phase_templates where owner_id is null) = 7,
  'the built-in templates are readable by anybody signed in');

-- Filtered, not refused: the statement runs and touches nothing, which is why
-- the assertion is on what survived rather than on an error.
update public.template_decisions set title = 'Mine now';

select test.ok(
  (select count(*) from public.template_decisions where title = 'Mine now') = 0,
  'but nobody may edit them');

reset role;

-- ------------------------------------------------------ a round fills itself

-- A helper so the tests can name a phase without carrying uuids around.
create or replace function test.phase_of(p_song uuid, p_key public.phase_key)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.phases where song_id = p_song and key = p_key;
$$;

-- Reopening the mix is the case the rule was missing: round 2 used to arrive
-- empty, so going back into a phase showed nothing to decide.
select test.ok(
  (select count(*) from public.decisions d
   join public.rounds r on r.id = d.round_id
   where r.phase_id = test.phase_of('50000000-0000-0000-0000-000000000001', 'mix')
     and r.number = 2) = 6,
  'a reopened round arrives with the phase decisions, like the first one');

-- The template's decisions are given, not assembled, so nothing outside the
-- database may put them anywhere.
select test.ok(
  (select count(*) from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('fill_round', 'fill_round_gaps', 'fill_phase_from_template')) = 0,
  'the filler is not reachable from outside the database at all');

set role authenticated;
select test.login('dddd0000-0000-0000-0000-00000000000d');

select test.denied(
  'select private.fill_round_gaps(''00000000-0000-0000-0000-000000000000'', ''00000000-0000-0000-0000-000000000000'')',
  'and a stranger cannot reach it by name either');

reset role;

\echo ''
\echo 'Decision model tests passed.'
