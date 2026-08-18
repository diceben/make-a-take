-- Row level security tests.
--
-- Run with: npm run test:db
--
-- The point of these tests is that access control is *denied* correctly, which
-- is the half that never shows up while clicking around as the owner.

\set ON_ERROR_STOP on

-- ------------------------------------------------------------------- helpers

create schema if not exists test;

create or replace function test.ok(cond boolean, msg text)
returns void
language plpgsql
as $$
begin
  if cond is not true then
    raise exception 'FAIL: %', msg;
  end if;
  raise notice '  ok  %', msg;
end;
$$;

-- Asserts that a statement is rejected. Used for the cases where a policy's
-- WITH CHECK should refuse the write outright rather than filter it away.
create or replace function test.denied(stmt text, msg text)
returns void
language plpgsql
as $$
begin
  begin
    execute stmt;
  exception
    when insufficient_privilege or check_violation then
      raise notice '  ok  %', msg;
      return;
  end;
  raise exception 'FAIL: % (statement was allowed)', msg;
end;
$$;

create or replace function test.login(p_user uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claim.sub', p_user::text, false);
$$;

grant usage on schema test to authenticated;
grant execute on all functions in schema test to authenticated;

-- --------------------------------------------------------------------- setup

-- Fixed ids so the assertions below read as prose.
--   alice   owns the project
--   bob     editor on the whole project
--   carol   viewer on the whole project
--   dave    editor on ONE song only
--   mallory no relationship at all
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'carol@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'dave@example.com'),
  ('55555555-5555-5555-5555-555555555555', 'mallory@example.com');

insert into public.projects (id, owner_id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111',
   'Debut EP');

insert into public.songs (id, project_id, title) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Opening Track'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'The Slow One');

insert into public.memberships (user_id, role, project_id) values
  ('22222222-2222-2222-2222-222222222222', 'editor',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('33333333-3333-3333-3333-333333333333', 'viewer',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

insert into public.memberships (user_id, role, song_id) values
  ('44444444-4444-4444-4444-444444444444', 'editor',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- ------------------------------------------------- the seeding trigger itself

select test.ok(
  (select count(*) from public.phase_states
   where song_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') = 7,
  'a new song gets all seven phases');

select test.ok(
  (select count(*) from public.track_states
   where song_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') = 6,
  'a new song gets all six tracks');

select test.ok(
  (select count(*) from public.phase_states
   where song_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
     and status = 'todo') = 7,
  'every phase starts as todo');

-- Everything below runs as a normal logged-in user, never as the owner of the
-- tables — otherwise RLS would simply be bypassed and the tests would be lies.
set role authenticated;

-- ---------------------------------------------------------------- the owner

select test.login('11111111-1111-1111-1111-111111111111');

select test.ok((select count(*) from public.projects) = 1, 'alice sees her project');
select test.ok((select count(*) from public.songs) = 2, 'alice sees both songs');
select test.ok(
  (select count(*) from public.phase_states) = 14,
  'alice sees the phases of both songs');

update public.projects set name = 'Debut EP (renamed)'
where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select test.ok(
  (select name from public.projects
   where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = 'Debut EP (renamed)',
  'alice can rename her project');

-- ----------------------------------------------------------- a project editor

select test.login('22222222-2222-2222-2222-222222222222');

select test.ok((select count(*) from public.songs) = 2, 'bob sees both songs');

update public.phase_states set status = 'done'
where song_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' and phase = 'writing';
select test.ok(
  (select status from public.phase_states
   where song_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
     and phase = 'writing') = 'done',
  'bob can move a phase to done');

select test.ok(
  (select updated_by from public.phase_states
   where song_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
     and phase = 'writing') = '22222222-2222-2222-2222-222222222222',
  'the change is stamped with who made it');

insert into public.songs (project_id, title)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Bob''s Addition');
select test.ok((select count(*) from public.songs) = 3, 'bob can add a song');

-- A delete the policy forbids is filtered out, not rejected: the statement
-- succeeds and touches nothing. So the assertion is on what survived.
delete from public.projects where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select test.ok(
  (select count(*) from public.projects
   where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = 1,
  'bob cannot delete the project');

-- ------------------------------------------------------------ a project viewer

select test.login('33333333-3333-3333-3333-333333333333');

select test.ok((select count(*) from public.songs) = 3, 'carol can read the songs');

update public.phase_states set status = 'done'
where song_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' and phase = 'mixing';
select test.ok(
  (select status from public.phase_states
   where song_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
     and phase = 'mixing') = 'todo',
  'carol cannot change a phase');

update public.songs set title = 'Hijacked'
where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
select test.ok(
  (select title from public.songs
   where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc') = 'The Slow One',
  'carol cannot rename a song');

select test.denied(
  $$insert into public.songs (project_id, title)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Carol''s Song')$$,
  'carol cannot add a song');

-- -------------------------------------------- someone invited to a single song

select test.login('44444444-4444-4444-4444-444444444444');

select test.ok((select count(*) from public.songs) = 1, 'dave sees only his one song');
select test.ok(
  (select count(*) from public.projects) = 0,
  'a song membership does not reveal the project');
select test.ok(
  (select count(*) from public.phase_states) = 7,
  'dave sees only that song''s phases');

update public.phase_states set status = 'doing'
where song_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' and phase = 'tracking';
select test.ok(
  (select status from public.phase_states
   where song_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
     and phase = 'tracking') = 'doing',
  'dave can edit the song he was invited to');

select test.denied(
  $$insert into public.songs (project_id, title)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Dave''s Song')$$,
  'dave cannot add songs to the project');

-- ---------------------------------------------------------------- a stranger

select test.login('55555555-5555-5555-5555-555555555555');

select test.ok((select count(*) from public.projects) = 0, 'mallory sees no projects');
select test.ok((select count(*) from public.songs) = 0, 'mallory sees no songs');
select test.ok((select count(*) from public.phase_states) = 0, 'mallory sees no phases');
select test.ok((select count(*) from public.track_states) = 0, 'mallory sees no tracks');
select test.ok((select count(*) from public.memberships) = 0, 'mallory sees no memberships');

select test.denied(
  $$insert into public.memberships (user_id, role, project_id)
    values ('55555555-5555-5555-5555-555555555555', 'owner',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,
  'mallory cannot grant herself access');

select test.denied(
  $$insert into public.projects (owner_id, name)
    values ('11111111-1111-1111-1111-111111111111', 'Stolen Project')$$,
  'mallory cannot create a project owned by someone else');

-- An unqualified update by a stranger: the statement runs, but RLS leaves it
-- with nothing to touch. Proven from outside, where all rows are visible.
update public.phase_states set status = 'done';

reset role;

select test.ok(
  (select count(*) from public.phase_states where status = 'done') = 1,
  'a blanket update by a stranger changed nothing');

-- --------------------------------------------------------- nobody logged in

set role authenticated;
select set_config('request.jwt.claim.sub', '', false);

select test.ok((select count(*) from public.projects) = 0, 'an anonymous request sees nothing');

reset role;

\echo ''
\echo 'All RLS tests passed.'
