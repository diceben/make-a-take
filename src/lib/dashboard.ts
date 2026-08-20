import {
  PHASE_KEYS,
  PHASE_LABELS,
  PHASE_VERBS,
  currentPhase,
  currentRound,
  decisionsOf,
  isOpen,
  isSettled,
  type Decision,
  type DecisionState,
  type Note,
  type Phase,
  type PhaseKey,
} from './journey';
import type { Song } from './model';

/**
 * Everything the dashboard says, worked out from the journey rather than stored.
 *
 * The dashboard has to answer five questions in about three seconds: what have
 * I got, what am I on, what needs me, how far along is it, what is next. All
 * five are derivable from decisions that already exist, so none of it is a
 * second copy of the truth that could drift out of step with the first.
 *
 * One thing is deliberately absent: a song-wide percentage. A song's decisions
 * are not comparable with one another — one in mastering against thirty-one in
 * the mix — so adding them up and dividing produces a number that moves most
 * when least is happening. Counts, and the phase you are in, say the same thing
 * without the arithmetic being a lie.
 */

/** A phase has many decisions; a dot on a list has one state. */
export type PhaseSummary = { key: PhaseKey; state: DecisionState; signedOff: boolean };

/**
 * The state of a whole phase, from the states of its decisions.
 *
 * Ordered by what a glance should surface first. Something that does not
 * convince you outranks something not started, because the first is a job and
 * the second is only a fact.
 */
export function phaseState(phase: Phase): PhaseSummary {
  const decisions = decisionsOf(phase);
  const round = currentRound(phase);
  const signedOff = round !== null && round.closed_at !== null;

  const state = ((): DecisionState => {
    // A signed-off round is settled whatever is in it — including nothing.
    if (signedOff) return 'locked';
    if (decisions.length === 0) return 'not_touched';
    if (decisions.every((one) => one.state === 'locked')) return 'locked';
    if (decisions.every(isSettled)) return 'feels_right';
    if (decisions.some((one) => one.state === 'not_quite_there')) return 'not_quite_there';
    if (decisions.some((one) => one.state !== 'not_touched')) return 'direction_set';
    return 'not_touched';
  })();

  return { key: phase.key, state, signedOff };
}

/** The seven dots, in order, for one song. */
export function phaseSummaries(phases: Phase[]): PhaseSummary[] {
  const byKey = new Map(phases.map((phase) => [phase.key, phase]));
  return PHASE_KEYS.map((key) => {
    const phase = byKey.get(key);
    return phase ? phaseState(phase) : { key, state: 'not_touched', signedOff: false };
  });
}

export type SongStanding = 'untouched' | 'in-progress' | 'needs-attention' | 'completed';

/**
 * Where a song stands, in one word.
 *
 * "Needs attention" wins over everything unfinished: it is the only one of
 * these that is a request. A song is complete when every phase has been signed
 * off — not when its decisions happen to all be locked, because signing off is
 * the act that says a pass is done and nobody else can say it for you.
 */
export function standingOf(phases: Phase[]): SongStanding {
  const summaries = phaseSummaries(phases);

  if (summaries.every((one) => one.signedOff)) return 'completed';
  if (summaries.some((one) => one.state === 'not_quite_there')) return 'needs-attention';
  if (summaries.some((one) => one.state !== 'not_touched')) return 'in-progress';
  return 'untouched';
}

export type Summary = {
  active: number;
  archived: number;
  inProgress: number;
  needsAttention: number;
  completed: number;
};

export function summarise(songs: Song[], phasesOf: (song: Song) => Phase[]): Summary {
  const live = songs.filter((song) => song.archived_at === null);
  const standings = live.map((song) => standingOf(phasesOf(song)));

  return {
    active: live.length,
    archived: songs.length - live.length,
    inProgress: standings.filter((one) => one === 'in-progress').length,
    needsAttention: standings.filter((one) => one === 'needs-attention').length,
    completed: standings.filter((one) => one === 'completed').length,
  };
}

/**
 * How many decisions a song has settled, and how many it has.
 *
 * A count and not a share. Six of nineteen is a fact about the song; 32% is a
 * claim that a mastering decision and a mixing decision weigh the same.
 */
export function decidedOf(phases: Phase[]): { settled: number; total: number } {
  const all = phases.flatMap(decisionsOf);
  return { settled: all.filter(isSettled).length, total: all.length };
}

/** Songs grouped by the phase they are in, for the ring. */
export function songsByStage(
  songs: Song[],
  phasesOf: (song: Song) => Phase[],
): { key: PhaseKey; count: number }[] {
  const counts = new Map<PhaseKey, number>(PHASE_KEYS.map((key) => [key, 0]));
  for (const song of songs) {
    const key = currentPhase(phasesOf(song));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return PHASE_KEYS.map((key) => ({ key, count: counts.get(key) ?? 0 }));
}

/**
 * Judgements made since the first of this month.
 *
 * Decisions made, never points. The difference is not decoration: points are
 * awarded by the app for behaviour it approves of, and a count of decisions is
 * a fact about the work that the app had no part in. One is a scoreboard, the
 * other is a record.
 */
export function creditsThisMonth(phases: Phase[][], now: Date = new Date()): number {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);

  return phases
    .flat()
    .flatMap((phase) => phase.rounds.flatMap((round) => round.decisions))
    .filter(
      (decision) => decision.state_set_at !== null && Date.parse(decision.state_set_at) >= start,
    ).length;
}

export type Activity = {
  id: string;
  kind: 'locked' | 'judged' | 'note' | 'checkpoint';
  /** Written as a sentence, because a list of fragments is not a record. */
  text: string;
  at: string;
};

/**
 * What has happened lately, assembled from the things that carry a timestamp.
 *
 * There is no activity table, and this is why there does not need to be: a
 * judgement knows when it was made, a note when it was written, a round when it
 * closed. A separate log would be a second account of the same events, free to
 * disagree with the first.
 */
export function recentActivity(
  entries: { song: Song; phases: Phase[]; notes: Note[] }[],
  limit = 6,
): Activity[] {
  const found: Activity[] = [];

  for (const { song, phases, notes } of entries) {
    for (const phase of phases) {
      for (const round of phase.rounds) {
        if (round.closed_at !== null) {
          found.push({
            id: `round-${round.id}`,
            kind: 'checkpoint',
            text: `You closed the ${labelOf(phase.key)} check in ${song.title}`,
            at: round.closed_at,
          });
        }

        for (const decision of round.decisions) {
          if (decision.state_set_at === null) continue;
          found.push({
            id: `decision-${decision.id}-${decision.state_set_at}`,
            kind: decision.state === 'locked' ? 'locked' : 'judged',
            text:
              decision.state === 'locked'
                ? `You locked "${decision.title}" in ${song.title}`
                : `You judged "${decision.title}" in ${song.title}`,
            at: decision.state_set_at,
          });
        }
      }
    }

    for (const note of notes) {
      found.push({
        id: `note-${note.id}`,
        kind: 'note',
        text: `You added a note in ${song.title}`,
        at: note.created_at,
      });
    }
  }

  return found.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit);
}

const labelOf = (key: PhaseKey) => PHASE_LABELS[key];

/**
 * How long ago, in the words a person would use.
 *
 * Rounded down and never precise past a day. "3 days ago" is what you remember;
 * "2 days 19 hours ago" is a number nobody asked for.
 */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 1000));

  if (seconds < 90) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${String(days)} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'Last month' : `${String(months)} months ago`;
}

export type NextStep = { phase: PhaseKey; what: string };

/**
 * What is worth doing next in a song, and where.
 *
 * It returns the phase as well as the words, because a caller that only got the
 * words had to guess the phase — and the card guessed wrong, labelling a mixing
 * decision as writing. One answer, one place it came from.
 */
export function nextStep(phases: Phase[]): NextStep | null {
  const summaries = phaseSummaries(phases);
  if (summaries.every((one) => one.signedOff)) return null;

  const wanting = summaries.find((one) => one.state === 'not_quite_there');
  if (wanting) {
    const phase = phases.find((one) => one.key === wanting.key);
    const decision = phase ? decisionsOf(phase).find(named) : undefined;
    return { phase: wanting.key, what: decision ? decision.title : 'Something is not right yet' };
  }

  const open = summaries.find((one) => !one.signedOff && one.state !== 'not_touched');
  if (open) return { phase: open.key, what: 'Carry on' };

  const first = summaries.find((one) => !one.signedOff);
  return first ? { phase: first.key, what: 'Not started' } : null;
}

const named = (decision: Decision) => decision.state === 'not_quite_there' && isOpen(decision);

export type NextTake = {
  song: Song;
  phase: PhaseKey;
  /** The one line saying what the work is. */
  headline: string;
  /** The words on the button, in the imperative. */
  action: string;
  decided: { settled: number; total: number };
  href: string;
  /** Why this one and not another, for the line above the block. */
  because: 'wanting' | 'under-way' | 'untouched';
};

/**
 * The single next thing worth doing, across everything.
 *
 * This is the dashboard's answer to the only question it really has to answer,
 * and the reason it names exactly one: a list of things you could do next is a
 * list of ways to keep tweaking. The app's whole argument is that a song gets
 * finished by deciding and moving on, so the screen makes one offer.
 *
 * The order is what a producer would pick themselves. Something judged and
 * found wanting is the sharpest call — you already know it is not right, and it
 * is the thing that will otherwise sit there. Then a phase already under way,
 * because momentum is cheaper than a standing start. Only then something new.
 */
export function nextTake(entries: { song: Song; phases: Phase[] }[]): NextTake | null {
  const live = entries.filter(
    ({ song, phases }) => song.archived_at === null && standingOf(phases) !== 'completed',
  );
  if (live.length === 0) return null;

  const build = (
    entry: { song: Song; phases: Phase[] },
    phase: PhaseKey,
    headline: string,
    action: string,
    because: NextTake['because'],
  ): NextTake => ({
    song: entry.song,
    phase,
    headline,
    action,
    decided: decidedOf(entry.phases),
    href: `/songs/${entry.song.id}/${phase}`,
    because,
  });

  // 1. Judged, and it does not convince you. Oldest first: a decision left
  //    unresolved for a fortnight is more overdue than one made last night.
  const wanting = live
    .flatMap(({ song, phases }) =>
      phases.flatMap((phase) =>
        decisionsOf(phase)
          .filter((decision) => decision.state === 'not_quite_there')
          .map((decision) => ({ song, phases, phase: phase.key, decision })),
      ),
    )
    .sort((a, b) => {
      const left = a.decision.state_set_at ?? '';
      const right = b.decision.state_set_at ?? '';
      return left < right ? -1 : left > right ? 1 : 0;
    })[0];

  if (wanting) {
    return build(
      { song: wanting.song, phases: wanting.phases },
      wanting.phase,
      wanting.decision.title,
      `Back to ${PHASE_VERBS[wanting.phase]}`,
      'wanting',
    );
  }

  // 2. Something already under way. The most recently touched song, in the
  //    phase it was touched in.
  const started = live
    .map((entry) => ({ entry, at: lastJudged(entry.phases) }))
    .filter((one): one is { entry: (typeof live)[number]; at: string } => one.at !== null)
    .sort((a, b) => (a.at < b.at ? 1 : -1))[0];

  if (started) {
    const phase = currentPhase(started.entry.phases);
    const open = decisionsOf(started.entry.phases.find((one) => one.key === phase) ?? blank(phase))
      .filter(isOpen)
      .at(0);

    return build(
      started.entry,
      phase,
      open ? open.title : 'Pick up where you left off',
      `Continue ${PHASE_VERBS[phase]}`,
      'under-way',
    );
  }

  // 3. Nothing judged anywhere. The first phase of the first song there is.
  const first = live[0];
  if (!first) return null;
  const phase = phaseSummaries(first.phases).find((one) => !one.signedOff)?.key ?? 'capture';
  return build(first, phase, 'Nothing decided yet', `Start ${PHASE_VERBS[phase]}`, 'untouched');
}

/** The most recent judgement anywhere in a song, or null if there is none. */
function lastJudged(phases: Phase[]): string | null {
  const stamps = phases
    .flatMap(decisionsOf)
    .map((decision) => decision.state_set_at)
    .filter((at): at is string => at !== null);
  return stamps.length === 0 ? null : stamps.reduce((a, b) => (a > b ? a : b));
}

/** A phase-shaped nothing, so the lookup above never has to be nullable. */
const blank = (key: PhaseKey): Phase => ({
  id: '',
  key,
  position: 0,
  current_round: 1,
  rounds: [],
});
