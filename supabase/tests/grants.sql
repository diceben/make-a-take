-- Grants that Supabase applies for us when "Automatically expose new tables"
-- is on. Reproduced here so the local database behaves like the real one.
-- Not part of the migration: on Supabase these are managed by the platform.

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant usage on schema auth to authenticated;
