import { PHASES, type Phase, type PhaseState, type StepStatus, type TrackState } from './model';

/**
 * How much of a song each phase represents. Recording and mixing dominate
 * because that is where the work actually is; picking a title does not move the
 * bar much. These live here and nowhere else.
 */
export const PHASE_WEIGHTS: Record<Phase, number> = {
  writing: 10,
  arrangement: 10,
  preproduction: 10,
  tracking: 30,
  editing: 15,
  mixing: 20,
  mastering: 5,
};

/**
 * How finished each state counts as. "Needs review" is nearly there — the take
 * exists, someone still has to bless it — so it earns most of the credit.
 */
export const STATUS_VALUES: Record<StepStatus, number> = {
  todo: 0,
  doing: 0.5,
  review: 0.8,
  done: 1,
};

const TOTAL_WEIGHT = Object.values(PHASE_WEIGHTS).reduce((sum, weight) => sum + weight, 0);

/**
 * The tracking phase has no status of its own: it is the average of its tracks.
 * Storing one as well would create a second truth that could disagree with them.
 */
export function trackingProgress(tracks: TrackState[]): number {
  if (tracks.length === 0) return 0;
  const total = tracks.reduce((sum, track) => sum + STATUS_VALUES[track.status], 0);
  return total / tracks.length;
}

export function phaseProgress(phase: Phase, phases: PhaseState[], tracks: TrackState[]): number {
  if (phase === 'tracking') return trackingProgress(tracks);
  const state = phases.find((candidate) => candidate.phase === phase);
  return state ? STATUS_VALUES[state.status] : 0;
}

/** Weighted completion of a whole song, from 0 to 1. */
export function songProgress(phases: PhaseState[], tracks: TrackState[]): number {
  const earned = PHASES.reduce(
    (sum, phase) => sum + PHASE_WEIGHTS[phase] * phaseProgress(phase, phases, tracks),
    0,
  );
  return earned / TOTAL_WEIGHT;
}

/**
 * The phase the song is sitting on: the first one that is not finished. A song
 * where everything is done has no current phase.
 */
export function currentPhase(phases: PhaseState[], tracks: TrackState[]): Phase | null {
  return PHASES.find((phase) => phaseProgress(phase, phases, tracks) < 1) ?? null;
}

/** Whole percent, for display. Never rounds an unfinished song up to 100. */
export function toPercent(progress: number): number {
  const percent = Math.round(progress * 100);
  if (percent === 100 && progress < 1) return 99;
  if (percent === 0 && progress > 0) return 1;
  return percent;
}
