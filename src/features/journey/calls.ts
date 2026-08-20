import { useState } from 'react';
import type { DecisionState } from '../../lib/journey';

/**
 * What you can say about a decision when you stop and listen to it, and what
 * each of those says to the database.
 *
 * Kept apart from the component so the mapping can be read and tested on its
 * own — the whole checkpoint turns on these three lines.
 */
export type Call = 'keep' | 'rework' | 'unsure';

export const WRITES: Record<Call, DecisionState | null> = {
  keep: 'locked',
  rework: 'not_quite_there',
  // Not a state. It is a way of moving past something without pretending to
  // have decided it, so it writes nothing at all.
  unsure: null,
};

/** The calls gathered during a sitting, before any of them are committed. */
export function useCalls() {
  const [made, setMade] = useState<Record<string, Call>>({});

  return {
    made,
    /** Pressing the same call again takes it back — nothing is committed yet. */
    call: (decisionId: string, call: Call) => {
      setMade((current) => {
        if (current[decisionId] === call) {
          const rest = { ...current };
          delete rest[decisionId];
          return rest;
        }
        return { ...current, [decisionId]: call };
      });
    },
    clear: () => {
      setMade({});
    },
  };
}
