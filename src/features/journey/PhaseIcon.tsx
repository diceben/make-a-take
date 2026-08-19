import type { ReactElement } from 'react';
import type { PhaseKey } from '../../lib/journey';

/**
 * A glyph per phase, drawn rather than fetched — no icon package, and no request
 * for something that amounts to a few dozen bytes of path.
 *
 * Decorative throughout: every one of them sits beside the phase's name, so it
 * is hidden from assistive technology instead of being given a label that would
 * only read the same word twice.
 */
const PATHS: Record<PhaseKey, ReactElement> = {
  // A spark: the idea, before it is anything.
  capture: (
    <>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M6.3 6.3l2.1 2.1M15.6 15.6l2.1 2.1M17.7 6.3l-2.1 2.1M8.4 15.6l-2.1 2.1" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  // A nib.
  write: (
    <>
      <path d="M4 20l4-1 10-10a2.1 2.1 0 0 0-3-3L5 16z" />
      <path d="M14.5 5.5l3 3" />
    </>
  ),
  // Stacked parts: what the song is made of.
  produce: (
    <>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <rect x="3" y="10" width="13" height="4" rx="1" />
      <rect x="3" y="16" width="8" height="4" rx="1" />
    </>
  ),
  // A microphone.
  track: (
    <>
      <rect x="9" y="3" width="6" height="10" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
    </>
  ),
  // Scissors: the tidying up.
  edit: (
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <path d="M8 7.5L20 18M8 16.5L20 6" />
    </>
  ),
  // Faders, as in the reference.
  mix: (
    <>
      <path d="M6 3v6M6 15v6M12 3v10M12 19v2M18 3v2M18 11v10" />
      <circle cx="6" cy="12" r="2" />
      <circle cx="12" cy="16" r="2" />
      <circle cx="18" cy="8" r="2" />
    </>
  ),
  // A polished thing.
  master: (
    <>
      <path d="M12 3l2.2 5.3L20 9.5l-4 3.9.9 5.6-4.9-2.7-4.9 2.7.9-5.6-4-3.9 5.8-1.2z" />
    </>
  ),
};

export function PhaseIcon({ phase, className }: { phase: PhaseKey; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[phase]}
    </svg>
  );
}
