-- Assertions and a way to be somebody, shared by every suite.
--
-- Local only, never applied to Supabase. Kept out of the suites themselves so
-- that whichever one runs first does not own them.

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

