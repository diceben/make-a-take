# Database

The schema lives in `migrations/` and is the single source of truth. Never
change the structure by clicking around in the Supabase dashboard — a change
that only exists there cannot be reviewed, tested, or rebuilt.

## Applying a migration

Until the Supabase CLI is wired up, apply migrations by hand:

1. Open the project's **SQL Editor** in Supabase.
2. Paste the contents of the migration file, oldest first.
3. Run it. A migration either applies cleanly or fails as a whole.

Once applied, do not edit that file again — add a new migration instead.

## Testing

```bash
npm run test:db
```

This drops and recreates a throwaway database, applies every migration in
order, and runs the SQL tests. It needs a reachable PostgreSQL 16 server:

```bash
PGHOST=localhost PGUSER=postgres npm run test:db
```

The same job runs in CI against a `postgres:16` service container.

## What the tests cover

`tests/rls.test.sql` exercises row level security from five points of view: the
project owner, a project editor, a project viewer, someone invited to a single
song, and a complete stranger. It asserts the denials, not just the permissions
— an owner clicking around never proves that anyone else is locked out.

Two files exist only for local runs and are never applied to Supabase:

- `tests/harness.sql` stands in for the `auth` schema, `auth.uid()` and the
  `authenticated` role, which the real platform provides.
- `tests/grants.sql` reproduces the table grants Supabase applies when
  "Automatically expose new tables" is on.

## Notes on the design

- **Access control lives in two functions**, `has_project_access()` and
  `has_song_access()`. Every policy calls one of them; no policy reasons about
  membership on its own. Both are `security definer` so consulting memberships
  does not recurse into the policies on the memberships table.
- **A membership targets either a project or a single song**, never both — a
  check constraint enforces that. Song-level access deliberately does not reveal
  the project it belongs to.
- **Phase and track rows are created by a trigger** when a song is inserted, so
  every song always has exactly seven phases and six tracks. There is no insert
  or delete policy on those tables: only the trigger creates them, and they die
  with their song.
- **A select policy must be answerable from the row in front of it.** The
  `RETURNING` that `.insert().select()` sends makes Postgres check the new row
  against the select policy while that row is still invisible to a lookup, so a
  policy that asks an access function to fetch the row _by id_ refuses it. The
  select policies on `projects` and `songs` therefore read `owner_id` and
  `project_id` straight off the row and only then fall back to a lookup. Both
  additions are redundant for rows that already exist; they matter only for the
  one being written. The tests cover this by keeping the `RETURNING`.
