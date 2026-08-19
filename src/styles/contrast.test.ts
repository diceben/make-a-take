import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Reads the real token file and checks every foreground against every surface it
 * can actually sit on.
 *
 * This exists because a colour checked against one background is not checked at
 * all: the first version of the status colours passed on --surface and failed on
 * --surface-raised, which is what a selected option sits on.
 *
 * The palette from the UI reference was measured against this before anything
 * was built. The state colours, badge fills and --accent-soft passed as
 * specified; three greys did not, and were respaced rather than nudged, because
 * lifting both --text-second and --text-muted to the floor collapsed them onto
 * one colour and took the ramp with them.
 */

const CSS = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');

/** Backgrounds a piece of text can end up on. */
const BACKGROUNDS = ['bg', 'surface', 'surface-alt'] as const;

/** Everything that is read as text, and must reach AAA (7:1). */
const FOREGROUNDS = [
  'text',
  'text-second',
  'text-muted',
  'accent-soft',
  'danger',
  'state-none-text',
  'state-dir-text',
  'state-notq-text',
  'state-feels-text',
  'state-locked-text',
] as const;

/**
 * The ring, the picker dot, the focus ring. They repeat what the word beside
 * them says, so nothing is understood only by seeing them — 3:1 is the right
 * bar, not 7:1.
 *
 * --accent is in this list and deliberately not in FOREGROUNDS: it is a surface
 * and a ring. It was once the link colour, which is text, and at 4.89 on --bg
 * that was a real defect the browser check caught and this file did not, because
 * a token nobody names here is a token nobody measures.
 */
const GRAPHICS = [
  'accent',
  'focus-ring',
  'state-none',
  'state-dir',
  'state-notq',
  'state-feels',
  'state-locked',
] as const;

/**
 * Boundaries of things you operate: a field, a button, a badge. These carry
 * meaning by being there, so they answer to 3:1.
 *
 * --rule and --rule-alt are deliberately not in this list. They separate rows
 * and nothing is understood only by seeing them; holding a hairline to 3:1
 * would make the page a grid of wires.
 */
const CONTROL_BORDERS = ['border-control', 'border-alt'] as const;

const TEXT_MINIMUM = 7;
const UI_MINIMUM = 3;

function tokens(): Record<string, string> {
  const start = CSS.indexOf(':root');
  expect(start, 'no :root block in tokens.css').toBeGreaterThan(-1);

  const block = CSS.slice(start, CSS.indexOf('}', start));
  const found: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/gi)) {
    if (name && value) found[name] = value;
  }
  return found;
}

function luminance(hex: string): number {
  const channels = (hex.replace('#', '').match(/../g) ?? []).map((pair) => {
    const value = parseInt(pair, 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const [r = 0, g = 0, b = 0] = channels;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

describe('the palette', () => {
  const palette = tokens();

  it('defines every token the app uses', () => {
    for (const name of [...FOREGROUNDS, ...BACKGROUNDS, ...CONTROL_BORDERS, ...GRAPHICS]) {
      expect(palette[name], `--${name} missing`).toBeDefined();
    }
  });

  describe.each(FOREGROUNDS)('--%s', (foreground) => {
    it.each(BACKGROUNDS)('reaches AAA on --%s', (background) => {
      const ratio = contrast(palette[foreground] ?? '#000000', palette[background] ?? '#ffffff');
      expect(Number(ratio.toFixed(2)), `--${foreground} on --${background}`).toBeGreaterThanOrEqual(
        TEXT_MINIMUM,
      );
    });
  });

  describe.each([...CONTROL_BORDERS, ...GRAPHICS])('--%s', (border) => {
    it.each(BACKGROUNDS)('is visible on --%s', (background) => {
      const ratio = contrast(palette[border] ?? '#000000', palette[background] ?? '#ffffff');
      expect(Number(ratio.toFixed(2)), `--${border} on --${background}`).toBeGreaterThanOrEqual(
        UI_MINIMUM,
      );
    });
  });

  /**
   * Surfaces that only ever carry one colour of text: a badge, the filled
   * button. Checking those against every foreground would fail on combinations
   * that cannot occur — so they are checked as the pairs they actually are, and
   * the pairing is what stops a fill from drifting away from its word.
   */
  describe.each([
    ['text', 'button'],
    ['state-dir-text', 'fill-dir'],
    ['state-notq-text', 'fill-notq'],
    ['state-feels-text', 'fill-feels'],
    ['state-locked-text', 'fill-locked'],
    ['state-none-text', 'fill-none'],
    // The chosen row of the picker: its definition sits on the state's own fill.
    ['text-second', 'fill-none'],
    ['text-second', 'fill-dir'],
    ['text-second', 'fill-notq'],
    ['text-second', 'fill-feels'],
    ['text-second', 'fill-locked'],
  ] as const)('--%s on --%s', (foreground, fill) => {
    it('reaches AAA', () => {
      const ratio = contrast(palette[foreground] ?? '#000000', palette[fill] ?? '#ffffff');
      expect(Number(ratio.toFixed(2))).toBeGreaterThanOrEqual(TEXT_MINIMUM);
    });
  });
});
