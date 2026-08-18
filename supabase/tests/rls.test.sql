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
--   alice   owns both songs
--   bob     editor on the first song
--   carol   viewer on the first song
--   mallory no relationship at all
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'carol@example.com'),
  ('55555555-5555-5555-5555-555555555555', 'mallory@example.com');

insert into public.songs (id, owner_id, title, artist) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '11111111-1111-1111-1111-111111111111', 'Opening Track', 'Alice'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc',
   '11111111-1111-1111-1111-111111111111', 'The Slow One', 'Alice');

insert into public.memberships (user_id, role, song_id) values
  ('22222222-2222-2222-2222-222222222222', 'editor',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('33333333-3333-3333-3333-333333333333', 'viewer',
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

select test.ok((select count(*) from public.songs) = 2, 'alice sees both her songs');
select test.ok(
  (select count(*) from public.phase_states) = 14,
  'alice sees the phases of both songs');

update public.songs set title = 'Opening Track (renamed)'
where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select test.ok(
  (select title from public.songs
   where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') = 'Opening Track (renamed)',
  'alice can rename her song');

-- ------------------------------------------------------------------ an editor

select test.login('22222222-2222-2222-2222-222222222222');

select test.ok((select count(*) from public.songs) = 1, 'bob sees only the song he was invited to');
select test.ok(
  (select count(*) from public.phase_states) = 7,
  'bob sees only that song''s phases');

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

-- A delete the policy forbids is filtered out, not rejected: the statement
-- succeeds and touches nothing. So the assertion is on what survived.
delete from public.songs where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select test.ok(
  (select count(*) from public.songs
   where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') = 1,
  'bob cannot delete a song he does not own');

select test.denied(
  $$insert into public.songs (owner_id, title)
    values ('11111111-1111-1111-1111-111111111111', 'Bob''s Land Grab')$$,
  'bob cannot create a song owned by someone else');

-- ------------------------------------------------------------------ a viewer

select test.login('33333333-3333-3333-3333-333333333333');

select test.ok((select count(*) from public.songs) = 1, 'carol can read the song');

update public.phase_states set status = 'done'
where song_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' and phase = 'mixing';
select test.ok(
  (select status from public.phase_states
   where song_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
     and phase = 'mixing') = 'todo',
  'carol cannot change a phase');

update public.songs set title = 'Hijacked'
where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select test.ok(
  (select title from public.songs
   where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') = 'Opening Track (renamed)',
  'carol cannot rename a song');

-- ---------------------------------------------------------------- a stranger

select test.login('55555555-5555-5555-5555-555555555555');

select test.ok((select count(*) from public.songs) = 0, 'mallory sees no songs');
select test.ok((select count(*) from public.phase_states) = 0, 'mallory sees no phases');
select test.ok((select count(*) from public.track_states) = 0, 'mallory sees no tracks');
select test.ok((select count(*) from public.memberships) = 0, 'mallory sees no memberships');

select test.denied(
  $$insert into public.memberships (user_id, role, song_id)
    values ('55555555-5555-5555-5555-555555555555', 'owner',
            'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')$$,
  'mallory cannot grant herself access');

select test.denied(
  $$insert into public.songs (owner_id, title)
    values ('11111111-1111-1111-1111-111111111111', 'Stolen Song')$$,
  'mallory cannot create a song owned by someone else');

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

select test.ok((select count(*) from public.songs) = 0, 'an anonymous request sees nothing');

reset role;

-- ------------------------------------------- reading back what you just wrote

-- Everything above inserts its rows as the table owner, which walks straight
-- past RLS. That once hid a real defect: `.insert().select()` in supabase-js
-- sends INSERT ... RETURNING, Postgres checks the returned row against the
-- SELECT policy, and a policy that has to look the row up by id cannot see it
-- yet. Creating a song failed with "new row violates row-level security policy"
-- while the plain insert was allowed. So these run as ordinary users and keep
-- the RETURNING.

set role authenticated;

select test.login('11111111-1111-1111-1111-111111111111');

with created as (
  insert into public.songs (owner_id, title, artist)
  values ('11111111-1111-1111-1111-111111111111', 'Written Today', 'Alice')
  returning id
)
select test.ok(
  (select count(*) from created) = 1,
  'alice can create a song and read it back');

-- Inviting somebody is the same shape of write, and the same trap.
with created as (
  insert into public.memberships (user_id, role, song_id)
  values ('22222222-2222-2222-2222-222222222222', 'viewer',
          'cccccccc-cccc-cccc-cccc-cccccccccccc')
  returning id
)
select test.ok(
  (select count(*) from created) = 1,
  'alice can invite somebody and read the membership back');

-- Reading a row back must not become a way in.
select test.login('55555555-5555-5555-5555-555555555555');

select test.ok(
  (select count(*) from public.songs where title = 'Written Today') = 0,
  'the wider select policy did not hand mallory someone else''s song');

select test.denied(
  $$insert into public.songs (owner_id, title)
    values ('11111111-1111-1111-1111-111111111111', 'Stolen Song')
    returning id$$,
  'RETURNING does not let mallory create a song for someone else');

reset role;

\echo ''
\echo 'All RLS tests passed.'
