import { describe, expect, it } from 'vitest';
import {
  PHASE_KEYS,
  currentPhase,
  decisionsOf,
  heardOnce,
  lockedCount,
  markersFor,
  notesWaitingIn,
  openDecisions,
  songTotals,
  type Decision,
  type DecisionState,
  type Note,
  type Phase,
  type PhaseKey,
} from './journey';

let counter = 0;
const id = () => `id-${(counter += 1)}`;

const decision = (
  title: string,
  state: DecisionState = 'not_touched',
  extra: Partial<Decision> = {},
): Decision => ({
  id: id(),
  title,
  subtitle: null,
  position: 0,
  state,
  state_set_at: state === 'not_touched' ? null : '2026-08-10T10:00:00Z',
  state_confirmed_at: null,
  steps: [],
  ...extra,
});

const phase = (key: PhaseKey, decisions: Decision[] = [], round = 1, closed = false): Phase => ({
  id: id(),
  key,
  position: PHASE_KEYS.indexOf(key) + 1,
  current_round: round,
  rounds: [
    // An earlier round that must never be mistaken for the one in hand.
    ...(round > 1
      ? [
          {
            id: id(),
            number: 1,
            opened_at: '2026-07-25T10:00:00Z',
            closed_at: '2026-08-01T10:00:00Z',
            reopen_reason: null,
            decisions: [decision('Old')],
          },
        ]
      : []),
    {
      id: id(),
      number: round,
      opened_at: '2026-08-02T10:00:00Z',
      closed_at: closed ? '2026-08-12T10:00:00Z' : null,
      reopen_reason: round > 1 ? 'The low end fell apart in the car' : null,
      decisions,
    },
  ],
});

const note = (target: PhaseKey | null, origin: PhaseKey, extra: Partial<Note> = {}): Note => ({
  id: id(),
  body: 'Snare needs another round',
  created_at: '2026-08-14T10:00:00Z',
  origin_phase: origin,
  target_phase: target,
  for_next_song: false,
  resolved_at: null,
  ...extra,
});

describe('decisionsOf', () => {
  it('answers with the round in hand, not an earlier one', () => {
    const mix = phase('mix', [decision('Static balance')], 2);
    expect(decisionsOf(mix).map((d) => d.title)).toEqual(['Static balance']);
  });

  it('puts them in the order they were arranged in', () => {
    const mix = phase('mix', [
      { ...decision('Second'), position: 1 },
      { ...decision('First'), position: 0 },
    ]);
    expect(decisionsOf(mix).map((d) => d.title)).toEqual(['First', 'Second']);
  });
});

describe('currentPhase', () => {
  it('is where the last judgement was made, not the first unfinished phase', () => {
    // The defect this replaces: write is untouched, so "first unfinished" would
    // have said Write while the actual work was in the mix.
    const phases = [phase('write'), phase('mix', [decision('Static balance', 'feels_right')])];
    expect(currentPhase(phases)).toBe('mix');
  });

  it('picks the most recent of several', () => {
    const phases = [
      phase('track', [decision('Drums', 'locked', { state_set_at: '2026-08-09T10:00:00Z' })]),
      phase('mix', [
        decision('Panning', 'direction_set', { state_set_at: '2026-08-11T10:00:00Z' }),
      ]),
    ];
    expect(currentPhase(phases)).toBe('mix');
  });

  it('starts at the start when nothing has been judged', () => {
    expect(currentPhase([phase('write'), phase('mix')])).toBe('capture');
  });
});

describe('heardOnce', () => {
  it('marks a judgement that has not been met on a second day', () => {
    expect(heardOnce(decision('Vocal', 'feels_right'))).toBe(true);
    expect(heardOnce(decision('Vocal', 'locked'))).toBe(true);
  });

  it('says nothing about the stages below it', () => {
    expect(heardOnce(decision('Vocal', 'not_quite_there'))).toBe(false);
    expect(heardOnce(decision('Vocal'))).toBe(false);
  });

  it('goes quiet once it has been confirmed', () => {
    expect(
      heardOnce(decision('Vocal', 'feels_right', { state_confirmed_at: '2026-08-16T10:00:00Z' })),
    ).toBe(false);
  });
});

describe('lockedCount and songTotals', () => {
  it('counts within a phase', () => {
    const mix = phase('mix', [
      decision('A', 'locked'),
      decision('B', 'feels_right'),
      decision('C'),
    ]);
    expect(lockedCount(mix)).toEqual({ locked: 1, total: 3 });
  });

  it('counts the song without ever reaching for a percentage', () => {
    const phases = [
      phase('write', [decision('A', 'locked')], 2),
      phase('mix', [decision('B', 'locked'), decision('C')], 3),
    ];
    expect(songTotals(phases)).toEqual({ locked: 2, reopened: 3 });
  });
});

describe('openDecisions', () => {
  it('answers with what is neither good enough to play nor finished', () => {
    const phases = [
      phase('mix', [
        decision('Locked one', 'locked'),
        decision('Good enough', 'feels_right'),
        decision('Still open', 'not_quite_there'),
      ]),
    ];
    expect(openDecisions(phases).map((entry) => entry.decision.title)).toEqual(['Still open']);
  });

  it('puts the one judged longest ago first, and the untouched last', () => {
    const phases = [
      phase('mix', [
        decision('Untouched'),
        decision('Recent', 'direction_set', { state_set_at: '2026-08-18T10:00:00Z' }),
        decision('Ancient', 'direction_set', { state_set_at: '2026-08-01T10:00:00Z' }),
      ]),
    ];
    expect(openDecisions(phases).map((entry) => entry.decision.title)).toEqual([
      'Ancient',
      'Recent',
      'Untouched',
    ]);
  });

  it('holds to the limit', () => {
    const phases = [phase('mix', [decision('A'), decision('B'), decision('C'), decision('D')])];
    expect(openDecisions(phases)).toHaveLength(3);
  });
});

describe('notesWaitingIn', () => {
  const notes = [
    note('mix', 'track'),
    note(null, 'write'),
    note('mix', 'track', { resolved_at: '2026-08-17T10:00:00Z' }),
    note(null, 'track', { for_next_song: true }),
  ];

  it('waits where it was aimed', () => {
    expect(notesWaitingIn(notes, 'mix')).toHaveLength(1);
  });

  it('and nowhere else, not even where it was written', () => {
    expect(notesWaitingIn(notes, 'track')).toHaveLength(0);
  });

  it('treats no target as the phase it was written in', () => {
    expect(notesWaitingIn(notes, 'write')).toHaveLength(1);
  });

  it('leaves out the resolved and the ones meant for the next song', () => {
    expect(notesWaitingIn(notes, 'mix').every((n) => n.resolved_at === null)).toBe(true);
  });
});

describe('markersFor', () => {
  it('says a phase has not begun', () => {
    expect(markersFor(phase('mix', [decision('A')]), [])).toEqual([
      { kind: 'idle', text: 'not started' },
    ]);
  });

  it('counts once something has been judged', () => {
    // Confirmed on purpose: an unconfirmed lock is heard once, and that marker
    // outranks the count.
    const mix = phase('mix', [
      decision('A', 'locked', { state_confirmed_at: '2026-08-16T10:00:00Z' }),
      decision('B', 'direction_set'),
    ]);
    expect(markersFor(mix, [])).toEqual([{ kind: 'count', text: '1 / 2 locked' }]);
  });

  it('puts waiting notes before everything else', () => {
    const mix = phase('mix', [decision('A', 'locked')]);
    const [first] = markersFor(mix, [note('mix', 'track'), note('mix', 'track')]);
    expect(first).toEqual({ kind: 'notes', text: '2 notes' });
  });

  it('mentions a judgement heard once', () => {
    const mix = phase('mix', [decision('A', 'feels_right')]);
    expect(markersFor(mix, [])[0]).toEqual({ kind: 'heard-once', text: 'heard once' });
  });

  it('mentions having been back', () => {
    const mix = phase(
      'mix',
      [decision('A', 'locked', { state_confirmed_at: '2026-08-16T10:00:00Z' })],
      2,
    );
    expect(markersFor(mix, []).some((m) => m.text === 'R2')).toBe(true);
  });

  it('never says more than two things at once', () => {
    const mix = phase('mix', [decision('A', 'feels_right')], 3);
    expect(markersFor(mix, [note('mix', 'track')])).toHaveLength(2);
  });

  it('says a phase has been completed', () => {
    const mix = phase(
      'mix',
      [decision('A', 'locked', { state_confirmed_at: '2026-08-16T10:00:00Z' })],
      1,
      true,
    );
    expect(markersFor(mix, []).some((m) => m.kind === 'closed')).toBe(true);
  });
});
