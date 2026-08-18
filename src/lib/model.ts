/**
 * The vocabulary of the app, matching the enums in the database migration.
 * These orders are meaningful: phases run in this sequence, and the UI lists
 * tracks in this order.
 */

export const PHASES = [
  'writing',
  'arrangement',
  'preproduction',
  'tracking',
  'editing',
  'mixing',
  'mastering',
] as const;

export const TRACKS = [
  'drums',
  'bass',
  'guitars',
  'keys',
  'lead_vocals',
  'backing_vocals',
] as const;

export const STATUSES = ['todo', 'doing', 'review', 'done'] as const;

export type Phase = (typeof PHASES)[number];
export type Track = (typeof TRACKS)[number];
export type StepStatus = (typeof STATUSES)[number];

export const PHASE_LABELS: Record<Phase, string> = {
  writing: 'Writing',
  arrangement: 'Arrangement',
  preproduction: 'Pre-production',
  tracking: 'Tracking',
  editing: 'Editing',
  mixing: 'Mixing',
  mastering: 'Mastering',
};

export const TRACK_LABELS: Record<Track, string> = {
  drums: 'Drums',
  bass: 'Bass',
  guitars: 'Guitars',
  keys: 'Keys',
  lead_vocals: 'Lead vocals',
  backing_vocals: 'Backing vocals',
};

/** Status is never colour alone — every one carries a symbol and a word. */
export const STATUS_LABELS: Record<StepStatus, string> = {
  todo: 'To do',
  doing: 'In progress',
  review: 'Needs review',
  done: 'Done',
};

export const STATUS_SYMBOLS: Record<StepStatus, string> = {
  todo: '○',
  doing: '◐',
  review: '◑',
  done: '●',
};

export type PhaseState = {
  id: string;
  song_id: string;
  phase: Phase;
  status: StepStatus;
  note: string;
};

export type TrackState = {
  id: string;
  song_id: string;
  track: Track;
  status: StepStatus;
  note: string;
};

export type Project = {
  id: string;
  name: string;
  artist: string | null;
  deadline: string | null;
};

export type Song = {
  id: string;
  project_id: string;
  title: string;
  artist: string | null;
  deadline: string | null;
  notes: string;
  position: number;
};

export type SongWithSteps = Song & {
  phase_states: PhaseState[];
  track_states: TrackState[];
};
