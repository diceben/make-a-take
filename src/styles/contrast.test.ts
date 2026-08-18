import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Reads the real token file and checks every foreground against every surface it
 * can actually sit on, in both themes.
 *
 * This exists because a colour checked against one background is not checked at
 * all: the first version of the status colours passed on --surface and failed on
 * --surface-raised, which is what a selected option sits on.
 */

// Read from the project root: under Vite, import.meta.url is an http URL.
const CSS = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');

/** Backgrounds a piece of text can end up on. */
const BACKGROUNDS = ['bg', 'surface', 'surface-raised'] as const;

/** Text tokens, which must reach AAA (7:1). */
const FOREGROUNDS = [
  'text',
  'text-muted',
  'status-todo',
  'status-doing',
  'status-review',
  'status-done',
  'accent',
] as const;

const TEXT_MINIMUM = 7;
const UI_MINIMUM = 3; // borders and other non-text boundaries

function tokensOf(theme: 'dark' | 'light'): Record<string, string> {
  // The dark block is shared with :root; the light block stands alone.
  const marker = theme === 'dark' ? ":root,\n[data-theme='dark']" : "[data-theme='light']";
  const start = CSS.indexOf(marker);
  expect(start, `no ${theme} block in tokens.css`).toBeGreaterThan(-1);

  const block = CSS.slice(start, CSS.indexOf('}', start));
  const tokens: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/gi)) {
    if (name && value) tokens[name] = value;
  }
  return tokens;
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

describe.each(['dark', 'light'] as const)('%s theme', (theme) => {
  const tokens = tokensOf(theme);

  it('defines every token the app uses', () => {
    for (const name of [...FOREGROUNDS, ...BACKGROUNDS, 'border']) {
      expect(tokens[name], `--${name} missing from the ${theme} theme`).toBeDefined();
    }
  });

  describe.each(FOREGROUNDS)('--%s', (foreground) => {
    it.each(BACKGROUNDS)('reaches AAA on --%s', (background) => {
      const ratio = contrast(tokens[foreground] ?? '#000000', tokens[background] ?? '#ffffff');
      expect(
        Number(ratio.toFixed(2)),
        `--${foreground} on --${background} in the ${theme} theme`,
      ).toBeGreaterThanOrEqual(TEXT_MINIMUM);
    });
  });

  it.each(BACKGROUNDS)('has a visible border on --%s', (background) => {
    const ratio = contrast(tokens['border'] ?? '#000000', tokens[background] ?? '#ffffff');
    expect(Number(ratio.toFixed(2))).toBeGreaterThanOrEqual(UI_MINIMUM);
  });
});
