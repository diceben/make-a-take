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

`tests/rls.test.sql` exercises row level security from four points of view: the
song's owner, an editor invited to it, a viewer invited to it, and a complete
stranger. It asserts the denials, not just the permissions — an owner clicking
around never proves that anyone else is locked out.

Two files exist only for local runs and are never applied to Supabase:

- `tests/harness.sql` stands in for the `auth` schema, `auth.uid()` and the
  `authenticated` role, which the real platform provides.
- `tests/grants.sql` reproduces the table grants Supabase applies when
  "Automatically expose new tables" is on.

## Notes on the design

- **Access control lives in one function**, `has_song_access()`. Every policy
  calls it; no policy reasons about membership on its own. It is
  `security definer` so consulting memberships does not recurse into the
  policies on the memberships table.
- **A song is the unit.** It carries its own `owner_id` and an optional `artist`
  string. The artist is a word on the song, not a row, so there is nothing to
  keep in step and nothing extra to grant access to.
- **A membership targets one song.** Sharing is per song and nothing above it
  leaks, because there is nothing above it.
- **Phase and track rows are created by a trigger** when a song is inserted, so
  every song always has exactly seven phases and six tracks. There is no insert
  or delete policy on those tables: only the trigger creates them, and they die
  with their song.
- **A select policy must be answerable from the row in front of it.** The
  `RETURNING` that `.insert().select()` sends makes Postgres check the new row
  against the select policy while that row is still invisible to a lookup, so a
  policy that asks an access function to fetch the row _by id_ refuses it. The
  select policy on `songs` therefore reads `owner_id` straight off the row and
  only then falls back to a lookup. That is redundant for rows that already
  exist; it matters only for the one being written. The tests cover this by
  keeping the `RETURNING`.
