-- Local-only stand-in for the parts of Supabase the migration depends on.
--
-- This file is NEVER applied to the real database — Supabase already provides
-- the auth schema, auth.uid() and the authenticated role. It exists so the RLS
-- policies can be exercised against a plain PostgreSQL server.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique
);

-- Supabase reads the subject out of the request's JWT claims. Tests set the
-- same setting directly, which is what PostgREST does under the hood.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end;
$$;
