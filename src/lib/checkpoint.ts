import {
  currentRound,
  decisionsOf,
  heardOnce,
  isOpen,
  sittings,
  stampsOf,
  type Decision,
  type Phase,
} from './journey';

/**
 * The checkpoint: what a round looks like when you stop and consider closing it.
 *
 * It exists because a phase otherwise has no end. Every decision can be revised
 * for ever, so without a moment that says "this pass is done" a song is never
 * anything but in progress — and the round that records how the work went stays
 * open until it is meaningless.
 *
 * Nothing here blocks. It gathers what is still open, says how long the round
 * has been running, and leaves the decision to the person: closing with two
 * things unsettled is a legitimate way to finish a pass, it just should not
 * happen without having seen them.
 */

export type Checkpoint = {
  locked: number;
  total: number;
  /** Not yet good enough to play to somebody: these are what the check is about. */
  open: Decision[];
  /** Judged well but only once. Not a problem, and worth knowing before closing. */
  unconfirmed: Decision[];
  openedAt: string;
  closedAt: string | null;
  /** Whole days from opening to closing, or to now while it is open. */
  days: number;
  /** How many separate stretches of work went into it. */
  sittings: number;
  /** Every decision settled. The words on the button change, nothing else does. */
  settled: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The state of the round being worked on, or null for a phase that has none.
 *
 * `now` is passed in rather than read, because a figure that depends on the
 * clock is a figure that cannot be tested unless the clock is an argument.
 */
export function checkpointFor(phase: Phase, now: Date = new Date()): Checkpoint | null {
  const round = currentRound(phase);
  if (round === null) return null;

  const decisions = decisionsOf(phase);
  const until = round.closed_at === null ? now.getTime() : Date.parse(round.closed_at);

  return {
    locked: decisions.filter((decision) => decision.state === 'locked').length,
    total: decisions.length,
    open: decisions.filter(isOpen),
    unconfirmed: decisions.filter(heardOnce),
    openedAt: round.opened_at,
    closedAt: round.closed_at,
    days: Math.max(0, Math.floor((until - Date.parse(round.opened_at)) / DAY_MS)),
    sittings: sittings(stampsOf(decisions)).length,
    settled: decisions.length > 0 && decisions.every((decision) => !isOpen(decision)),
  };
}

/**
 * How long the round took, in words.
 *
 * Days rather than hours: the gap between opening a mix and closing it is
 * measured in evenings, and "17 hours" would suggest a precision that the two
 * timestamps do not have.
 */
export function spanInWords(checkpoint: Checkpoint): string {
  if (checkpoint.days === 0) return 'today';
  if (checkpoint.days === 1) return 'since yesterday';
  return `over ${String(checkpoint.days)} days`;
}

/**
 * The line the checkpoint card leads with.
 *
 * It says what is true rather than how well it is going: "10 of 12 decisions
 * locked" is a fact the reader can act on, where "83% there" is a claim about
 * a song that only the person listening can make.
 */
export function summaryOf(checkpoint: Checkpoint): string {
  if (checkpoint.total === 0) return 'Nothing to check yet.';
  return `${String(checkpoint.locked)} of ${String(checkpoint.total)} decisions locked.`;
}
