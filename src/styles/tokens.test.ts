import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every custom property a stylesheet reads must be one the token file defines.
 *
 * This exists because getting the name wrong fails silently and expensively: an
 * undefined `var()` inside a shorthand voids the *whole declaration*, so a
 * `padding: var(--space-3) var(--space-5)` with no `--space-5` is not a slightly
 * wrong padding, it is no padding at all — and nothing in the build, the types
 * or the linter says a word. It cost a button its shape, and it was found by
 * looking at a screenshot, which is not a method.
 *
 * The scale skips --space-5 on purpose. That is exactly the kind of gap a name
 * gets invented to fill, which is why this is checked rather than remembered.
 */

const ROOT = process.cwd();
const TOKENS = join(ROOT, 'src/styles/tokens.css');

function stylesheets(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return stylesheets(path);
    return entry.name.endsWith('.css') ? [path] : [];
  });
}

const defined = new Set(
  [...readFileSync(TOKENS, 'utf8').matchAll(/^\s*(--[\w-]+)\s*:/gm)].map(([, name]) => name),
);

describe('the token file', () => {
  it('defines something to check against', () => {
    expect(defined.size).toBeGreaterThan(20);
  });

  it.each(stylesheets(join(ROOT, 'src')))('%s reads only tokens that exist', (path) => {
    const css = readFileSync(path, 'utf8');
    // Properties a stylesheet sets on itself are its own business.
    const local = new Set([...css.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map(([, name]) => name));
    const unknown = [...css.matchAll(/var\((--[\w-]+)/g)]
      .map(([, name]) => name as string)
      .filter((name) => !defined.has(name) && !local.has(name));

    expect([...new Set(unknown)], `undefined in ${relative(ROOT, path)}`).toEqual([]);
  });
});
