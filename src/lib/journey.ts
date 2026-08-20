/**
 * The vocabulary of the decision model, and everything that can be worked out
 * from a song without asking the database a second question.
 *
 * Pure and on its own, because most of the arguments in the plan are arguments
 * about these functions: which phase counts as the one being worked on, what a
 * sidebar row is allowed to say, which decisions are still open.
 */

export const PHASE_KEYS = [
  'capture',
  'write',
  'produce',
  'track',
  'edit',
  'mix',
  'master',
] as const;

export type PhaseKey = (typeof PHASE_KEYS)[number];

export const PHASE_LABELS: Record<PhaseKey, string> = {
  capture: 'Capture',
  write: 'Write',
  produce: 'Produce',
  track: 'Tracking',
  edit: 'Edit',
  mix: 'Mix',
  master: 'Master',
};

/** Two or three words under the name, so the sidebar says what a phase is. */
export const PHASE_SUBTITLES: Record<PhaseKey, string> = {
  capture: 'Idea',
  write: 'Lyrics, melody',
  produce: 'Arrangement',
  track: 'Record',
  edit: 'Comping, clean-up',
  mix: 'Balance, glue',
  master: 'Polish',
};

/**
 * The phase as something you do, for a button.
 *
 * "Continue write" is not a sentence. A phase is a noun on a sidebar and a verb
 * on a button, and the app should be able to say both.
 */
export const PHASE_VERBS: Record<PhaseKey, string> = {
  capture: 'capturing',
  write: 'writing',
  produce: 'producing',
  track: 'tracking',
  edit: 'editing',
  mix: 'mixing',
  master: 'mastering',
};

/** One sentence at the head of the phase, saying what it is for. */
export const PHASE_DESCRIPTIONS: Record<PhaseKey, string> = {
  capture: 'Catch it before it gets away.',
  write: 'Find the words and the tune.',
  produce: 'Decide what the song is made of.',
  track: 'Play it, and keep the takes worth keeping.',
  edit: 'Tidy up what was played.',
  mix: 'Shape, balance and bring it all together.',
  master: 'The last pass before it leaves the room.',
};

/** In the order work moves through them. Nothing may treat them as numbers. */
export const STATES = [
  'not_touched',
  'direction_set',
  'not_quite_there',
  'feels_right',
  'locked',
] as const;

export type DecisionState = (typeof STATES)[number];

export const STATE_LABELS: Record<DecisionState, string> = {
  not_touched: 'Not touched',
  direction_set: 'Direction set',
  not_quite_there: 'Not quite there',
  feels_right: 'Feels right',
  locked: 'Locked',
};

/**
 * The definitions are the stages; the labels are only the handles.
 *
 * Where "not quite there" ends and "feels right" begins is set differently by
 * every person, and by the same person differently on a tired evening than in
 * the morning. Naming a behaviour instead of a feeling moves that line onto
 * something observable. The method comes from behaviourally anchored rating
 * scales in staff assessment; that it transfers to judging one's own mix is an
 * assumption, not a demonstrated effect.
 *
 * The consequence for the interface is firm either way: a label must never
 * appear without its definition, which is why the picker carries them.
 */
export const STATE_DEFINITIONS: Record<DecisionState, string> = {
  not_touched: 'I have not made a decision yet',
  direction_set: 'I know what I want, it is not in there yet',
  not_quite_there: 'It is in there, it does not convince me yet',
  feels_right: 'I would play it to someone like this',
  locked: 'I would not touch it again, even with time',
};

export type Step = {
  id: string;
  label: string;
  position: number;
  done: boolean;
};

export type Decision = {
  id: string;
  title: string;
  subtitle: string | null;
  position: number;
  state: DecisionState;
  state_set_at: string | null;
  state_confirmed_at: string | null;
  steps: Step[];
};

export type Round = {
  id: string;
  number: number;
  opened_at: string;
  closed_at: string | null;
  /** Why this pass was started. Null on the first one — it needed no reason. */
  reopen_reason: string | null;
  decisions: Decision[];
};

export type Phase = {
  id: string;
  key: PhaseKey;
  position: number;
  current_round: number;
  rounds: Round[];
};

export type Note = {
  id: string;
  body: string;
  created_at: string;
  origin_phase: PhaseKey;
  target_phase: PhaseKey | null;
  for_next_song: boolean;
  resolved_at: string | null;
};

export type Journey = {
  phases: Phase[];
  notes: Note[];
};

/** The round being worked on. Earlier rounds stay readable, they are just not it. */
export function currentRound(phase: Phase): Round | null {
  return phase.rounds.find((round) => round.number === phase.current_round) ?? null;
}

export function decisionsOf(phase: Phase): Decision[] {
  return [...(currentRound(phase)?.decisions ?? [])].sort((a, b) => a.position - b.position);
}

/**
 * The phase being worked on is the one with the most recently changed decision —
 * not the first unfinished one.
 *
 * That was the first defect in the old model: production does not run in a line,
 * so "first unfinished" reported Writing while tracking sat at 80%. Several
 * phases may be open at once, and this only says which was touched last.
 */
export function currentPhase(phases: Phase[]): PhaseKey {
  let latest: { key: PhaseKey; at: string } | null = null;

  for (const phase of phases) {
    for (const decision of decisionsOf(phase)) {
      const at = decision.state_set_at;
      if (at !== null && (latest === null || at > latest.at)) latest = { key: phase.key, at };
    }
  }

  // Nothing judged yet: the work starts where the work starts.
  return latest?.key ?? 'capture';
}

/** A judgement is unconfirmed until it is met again on a later day. */
export function heardOnce(decision: Decision): boolean {
  return (
    (decision.state === 'feels_right' || decision.state === 'locked') &&
    decision.state_confirmed_at === null
  );
}

/** Neither good enough to play to somebody, nor finished. */
export function isOpen(decision: Decision): boolean {
  return decision.state !== 'feels_right' && decision.state !== 'locked';
}

export type Counted = { locked: number; total: number };

export function lockedCount(phase: Phase): Counted {
  const decisions = decisionsOf(phase);
  return {
    locked: decisions.filter((decision) => decision.state === 'locked').length,
    total: decisions.length,
  };
}

/**
 * Song-wide there is no percentage — the point of the rebuild. Two counted
 * figures instead, both of which mean exactly what they say.
 */
export function songTotals(phases: Phase[]): { locked: number; reopened: number } {
  return {
    locked: phases.reduce(
      (sum, phase) => sum + decisionsOf(phase).filter((d) => d.state === 'locked').length,
      0,
    ),
    reopened: phases.reduce((sum, phase) => sum + Math.max(0, phase.current_round - 1), 0),
  };
}

/** Settled: good enough to play to somebody, or finished. */
export function isSettled(decision: Decision): boolean {
  return !isOpen(decision);
}

/**
 * How many judgements this song has taken, per phase, over every round it has
 * been through — not only the round being worked on.
 *
 * Going back is counted, on purpose. A second pass through the mix is work that
 * happened, and a figure that quietly forgot it would make reopening look like
 * losing ground. The plan's word for this is credits: what you have done, not
 * how far along you are.
 */
export function creditsFor(phases: Phase[]): { key: PhaseKey; made: number }[] {
  return phases.map((phase) => ({
    key: phase.key,
    made: phase.rounds.reduce(
      (sum, round) =>
        sum + round.decisions.filter((decision) => decision.state !== 'not_touched').length,
      0,
    ),
  }));
}

export function totalMade(phases: Phase[]): number {
  return creditsFor(phases).reduce((sum, entry) => sum + entry.made, 0);
}

/**
 * What is still open, oldest first, for the line at the top of the song.
 *
 * Oldest means judged longest ago. A decision nobody has touched has no date at
 * all, so it sorts after the ones that do: something set a fortnight ago and
 * left alone is more overdue than something never started.
 */
export function openDecisions(
  phases: Phase[],
  limit = 3,
): { phase: PhaseKey; decision: Decision }[] {
  const open = phases.flatMap((phase) =>
    decisionsOf(phase)
      .filter(isOpen)
      .map((decision) => ({ phase: phase.key, decision })),
  );

  return open
    .sort((a, b) => {
      const left = a.decision.state_set_at;
      const right = b.decision.state_set_at;
      if (left === right) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      return left < right ? -1 : 1;
    })
    .slice(0, limit);
}

/** Notes still waiting in a phase. A note with no target waits where it was written. */
export function notesWaitingIn(notes: Note[], phase: PhaseKey): Note[] {
  return notes.filter(
    (note) =>
      note.resolved_at === null &&
      !note.for_next_song &&
      (note.target_phase ?? note.origin_phase) === phase,
  );
}

export type Marker = {
  kind: 'notes' | 'heard-once' | 'round' | 'count' | 'closed' | 'idle';
  text: string;
};

/**
 * What a sidebar row is allowed to say about a phase, at most two things.
 *
 * The middle column shows one phase at a time, so the sidebar is the only place
 * the whole song is visible. The order is the plan's: what is waiting for you,
 * then what you have only heard once, then whether you have been back, then how
 * far along, then whether it is closed, then that it has not begun.
 */
export function markersFor(phase: Phase, notes: Note[]): Marker[] {
  const markers: Marker[] = [];
  const decisions = decisionsOf(phase);
  const waiting = notesWaitingIn(notes, phase.key).length;
  const counted = lockedCount(phase);
  // A closed round is closed whether or not anything was judged in it. Asking
  // for decisions here left an empty phase reading "not started" after it had
  // been signed off, which is the opposite of what happened.
  const round = currentRound(phase);
  const closed = round !== null && round.closed_at !== null;

  if (waiting > 0)
    markers.push({ kind: 'notes', text: waiting === 1 ? '1 note' : `${waiting} notes` });
  if (decisions.some(heardOnce)) markers.push({ kind: 'heard-once', text: 'heard once' });
  if (phase.current_round > 1) markers.push({ kind: 'round', text: `R${phase.current_round}` });
  // "Signed off" and not "approved": you are not approving somebody else's work.
  if (closed) markers.push({ kind: 'closed', text: 'signed off' });
  else if (decisions.some((decision) => decision.state !== 'not_touched')) {
    markers.push({ kind: 'count', text: `${counted.locked} / ${counted.total} locked` });
  } else {
    markers.push({ kind: 'idle', text: 'not started' });
  }

  return markers.slice(0, 2);
}

/** A gap longer than this ends one stretch of work and starts another. */
const SESSION_GAP_MS = 45 * 60 * 1000;

/**
 * Judgements grouped into the sittings they were made in, oldest first.
 *
 * A sitting is a run of judgements with no gap longer than 45 minutes. That is a
 * guess dressed as a constant: it is long enough to survive making coffee and
 * short enough that an evening and the next morning do not merge. Nothing is
 * withheld or warned about on the strength of it — it only ever adds a sentence
 * to something already on screen, so being wrong about it costs a sentence.
 */
export function sittings(stamps: string[]): number[][] {
  const ordered = stamps.map((at) => Date.parse(at)).sort((a, b) => a - b);

  const groups: number[][] = [];
  for (const stamp of ordered) {
    const current = groups.at(-1);
    const previous = current?.at(-1);
    if (current === undefined || (previous !== undefined && stamp - previous > SESSION_GAP_MS)) {
      groups.push([stamp]);
    } else {
      current.push(stamp);
    }
  }
  return groups;
}

/** Every judgement stamp on these decisions, in no particular order. */
export function stampsOf(decisions: Decision[]): string[] {
  return decisions
    .map((decision) => decision.state_set_at)
    .filter((at): at is string => at !== null);
}

/**
 * How many other judgements were set in the same stretch of work as this one.
 *
 * Shown in the picker as a plain figure, never as a warning: five judgements in
 * one evening is a normal way to work, and it is also the shape of an evening
 * where everything sounded finished. The reader can decide which it was.
 */
export function sameSessionCount(all: Decision[], decision: Decision): number {
  const anchor = decision.state_set_at;
  if (anchor === null) return 0;

  const target = Date.parse(anchor);
  const group = sittings(stampsOf(all)).find((candidate) => candidate.includes(target));
  return group === undefined ? 0 : group.length - 1;
}
