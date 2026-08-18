import { describe, expect, it } from 'vitest';
import {
  PHASES,
  TRACKS,
  type Phase,
  type PhaseState,
  type StepStatus,
  type Track,
  type TrackState,
} from './model';
import {
  currentPhase,
  PHASE_WEIGHTS,
  phaseProgress,
  songProgress,
  STATUS_VALUES,
  toPercent,
  trackingProgress,
} from './progress';

const phasesAll = (status: StepStatus, overrides: Partial<Record<Phase, StepStatus>> = {}) =>
  PHASES.map<PhaseState>((phase) => ({
    id: `phase-${phase}`,
    song_id: 'song-1',
    phase,
    status: overrides[phase] ?? status,
    note: '',
  }));

const tracksAll = (status: StepStatus, overrides: Partial<Record<Track, StepStatus>> = {}) =>
  TRACKS.map<TrackState>((track) => ({
    id: `track-${track}`,
    song_id: 'song-1',
    track,
    status: overrides[track] ?? status,
    note: '',
  }));

describe('the weights', () => {
  it('add up to 100, so a weight reads as a percentage', () => {
    const total = Object.values(PHASE_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
    expect(total).toBe(100);
  });

  it('covers every phase', () => {
    for (const phase of PHASES) expect(PHASE_WEIGHTS[phase]).toBeGreaterThan(0);
  });
});

describe('trackingProgress', () => {
  it('is the average of the tracks', () => {
    expect(trackingProgress(tracksAll('todo'))).toBe(0);
    expect(trackingProgress(tracksAll('done'))).toBe(1);
    expect(trackingProgress(tracksAll('doing'))).toBe(0.5);
  });

  it('averages a mixed set', () => {
    // three done, three still to do
    const tracks = tracksAll('todo', { drums: 'done', bass: 'done', guitars: 'done' });
    expect(trackingProgress(tracks)).toBeCloseTo(0.5);
  });

  it('treats a song with no tracks as unstarted rather than dividing by zero', () => {
    expect(trackingProgress([])).toBe(0);
  });
});

describe('phaseProgress', () => {
  it('reads a normal phase straight off its status', () => {
    const phases = phasesAll('todo', { mixing: 'review' });
    expect(phaseProgress('mixing', phases, [])).toBe(STATUS_VALUES.review);
  });

  it('derives tracking from the tracks, ignoring any stored phase row', () => {
    const phases = phasesAll('done'); // claims tracking is finished
    const tracks = tracksAll('todo');
    expect(phaseProgress('tracking', phases, tracks)).toBe(0);
  });

  it('counts a missing phase row as unstarted', () => {
    expect(phaseProgress('writing', [], [])).toBe(0);
  });
});

describe('songProgress', () => {
  it('is 0 for a brand new song', () => {
    expect(songProgress(phasesAll('todo'), tracksAll('todo'))).toBe(0);
  });

  it('is 1 only when everything is done', () => {
    expect(songProgress(phasesAll('done'), tracksAll('done'))).toBe(1);
  });

  it('weights mixing above writing', () => {
    const withWriting = songProgress(phasesAll('todo', { writing: 'done' }), tracksAll('todo'));
    const withMixing = songProgress(phasesAll('todo', { mixing: 'done' }), tracksAll('todo'));
    expect(withMixing).toBeGreaterThan(withWriting);
    expect(withWriting).toBeCloseTo(0.1);
    expect(withMixing).toBeCloseTo(0.2);
  });

  it('gives tracking its full weight only when every track is done', () => {
    const half = songProgress(
      phasesAll('todo'),
      tracksAll('todo', { drums: 'done', bass: 'done', guitars: 'done' }),
    );
    expect(half).toBeCloseTo(0.15); // half of tracking's 30
  });

  it('never exceeds 1 or drops below 0', () => {
    const everything = songProgress(phasesAll('done'), tracksAll('done'));
    expect(everything).toBeLessThanOrEqual(1);
    expect(songProgress(phasesAll('todo'), tracksAll('todo'))).toBeGreaterThanOrEqual(0);
  });

  it('counts review as nearly finished but not finished', () => {
    const review = songProgress(phasesAll('review'), tracksAll('review'));
    expect(review).toBeCloseTo(STATUS_VALUES.review);
    expect(review).toBeLessThan(1);
  });
});

describe('currentPhase', () => {
  it('is the first unfinished phase', () => {
    const phases = phasesAll('todo', { writing: 'done', arrangement: 'done' });
    expect(currentPhase(phases, tracksAll('todo'))).toBe('preproduction');
  });

  it('skips ahead when early phases are finished out of order', () => {
    const phases = phasesAll('done', { mixing: 'doing' });
    expect(currentPhase(phases, tracksAll('done'))).toBe('mixing');
  });

  it('reports tracking while any track is unfinished, however complete the rest', () => {
    const phases = phasesAll('done');
    const tracks = tracksAll('done', { lead_vocals: 'doing' });
    expect(currentPhase(phases, tracks)).toBe('tracking');
  });

  it('is null when the song is finished', () => {
    expect(currentPhase(phasesAll('done'), tracksAll('done'))).toBeNull();
  });
});

describe('toPercent', () => {
  it('rounds to whole numbers', () => {
    expect(toPercent(0.5)).toBe(50);
    expect(toPercent(0.333)).toBe(33);
  });

  it('never claims 100% for an unfinished song', () => {
    expect(toPercent(0.999)).toBe(99);
    expect(toPercent(1)).toBe(100);
  });

  it('never claims 0% once something has started', () => {
    expect(toPercent(0.001)).toBe(1);
    expect(toPercent(0)).toBe(0);
  });
});
