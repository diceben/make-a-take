#!/usr/bin/env node
// Rebuilds a throwaway database from the migrations and runs the SQL tests.
//
// Needs a reachable PostgreSQL server; point PGHOST/PGPORT/PGUSER at it, or set
// DATABASE_URL. The database named by PGDATABASE (default: make_a_take_test) is
// dropped and recreated on every run, so never aim this at anything real.

import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const DB = process.env['PGDATABASE'] ?? 'make_a_take_test';
const MIGRATIONS = 'supabase/migrations';
const TESTS = 'supabase/tests';

const psql = (args, { db = DB, showOutput = false } = {}) =>
  execFileSync(
    'psql',
    [
      '--dbname',
      db,
      '--set',
      'ON_ERROR_STOP=on',
      '--no-psqlrc',
      '--quiet',
      // Assertions report through RAISE NOTICE, which psql writes to stderr;
      // the statements themselves have nothing worth printing.
      ...(showOutput ? ['--tuples-only'] : []),
      ...args,
    ],
    {
      stdio: ['ignore', 'pipe', showOutput ? 'inherit' : 'pipe'],
      encoding: 'utf8',
    },
  );

const run = (label, fn) => {
  try {
    return fn();
  } catch (error) {
    const detail = [error.stdout, error.stderr].filter(Boolean).join('').trim();
    console.error(`\n${label} failed:\n${detail || error.message}`);
    process.exit(1);
  }
};

// A fresh database every time: a test that only passes on a dirty one is worthless.
run('resetting the test database', () => {
  psql(['--command', `drop database if exists ${DB}`], { db: 'postgres' });
  psql(['--command', `create database ${DB}`], { db: 'postgres' });
});

run('installing the local auth stand-in', () => psql(['--file', join(TESTS, 'harness.sql')]));

const migrations = readdirSync(MIGRATIONS)
  .filter((name) => name.endsWith('.sql'))
  .sort();

if (migrations.length === 0) {
  console.error(`No migrations found in ${MIGRATIONS}`);
  process.exit(1);
}

for (const migration of migrations) {
  run(`migration ${migration}`, () => psql(['--file', join(MIGRATIONS, migration)]));
  console.log(`  applied ${migration}`);
}

run('applying the platform grants', () => psql(['--file', join(TESTS, 'grants.sql')]));

// Shared assertions, before any suite: whichever runs first must not own them.
run('installing the test helpers', () => psql(['--file', join(TESTS, 'helpers.sql')]));

const suites = readdirSync(TESTS)
  .filter((name) => name.endsWith('.test.sql'))
  .sort();

for (const suite of suites) {
  console.log(`\n${suite}`);
  run(suite, () => psql(['--file', join(TESTS, suite)], { showOutput: true }));
}

console.log('\nDatabase tests passed.');
