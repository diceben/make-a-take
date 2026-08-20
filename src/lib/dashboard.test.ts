import { describe, expect, it } from 'vitest';
import {
  creditsThisMonth,
  decidedOf,
  nextStep,
  nextTake,
  phaseSummaries,
  recentActivity,
  songsByStage,
  standingOf,
  summarise,
  timeAgo,
} from './dashboard';
import { PHASE_KEYS, type Decision, type DecisionState, type Phase, type Round } from './journey';
import type { Song } from './model';

let counter = 0;

const decision = (
  state: DecisionState,
  at: string | null = null,
  title = 'A decision',
): Decision => ({
  id: `d-${(counter += 1)}`,
  title,
  subtitle: null,
  position: counter,
  state,
  state_set_at: at,
  state_confirmed_at: null,
  steps: [],
});

const round = (over: Partial<Round> = {}): Round => ({
  id: `r-${(counter += 1)}`,
  number: 1,
  opened_at: '2026-08-01T10:00:00Z',
  closed_at: null,
  reopen_reason: null,
  decisions: [],
  ...over,
});

const phase = (key: (typeof PHASE_KEYS)[number], rounds: Round[] = [round()]): Phase => ({
  id: `p-${key}-${(counter += 1)}`,
  key,
  position: PHASE_KEYS.indexOf(key) + 1,
  current_round: rounds[rounds.length - 1]?.number ?? 1,
  rounds,
});

/** Seven phases, with whatever is given for the named ones. */
const journey = (given: Partial<Record<(typeof PHASE_KEYS)[number], Round[]>> = {}): Phase[] =>
  PHASE_KEYS.map((key) => phase(key, given[key] ?? [round()]));

const song = (id: string, title: string, archivedAt: string | null = null): Song => ({
  id,
  title,
  artist: 'Sarah Kane',
  genre: 'Indie',
  bpm: 112,
  musical_key: 'A minor',
  deadline: null,
  notes: '',
  position: 0,
  archived_at: archivedAt,
});

describe('the state of a whole phase', () => {
  const stateOf = (rounds: Round[]) =>
    phaseSummaries([phase('mix', rounds)]).find((one) => one.key === 'mix')?.state;

  it('is untouched when there is nothing in it', () => {
    expect(stateOf([round()])).toBe('not_touched');
  });

  it('is locked once every decision is', () => {
    expect(stateOf([round({ decisions: [decision('locked'), decision('locked')] })])).toBe(
      'locked',
    );
  });

  it('is locked when the round was signed off, whatever is in it', () => {
    // Including nothing: closing an empty phase is how capture ends.
    expect(stateOf([round({ closed_at: '2026-08-09T10:00:00Z' })])).toBe('locked');
  });

  it('reads as needing attention over anything merely unstarted', () => {
    // A judgement that does not convince you is a job; an untouched decision is
    // only a fact, so the first is what a glance should surface.
    const rounds = [round({ decisions: [decision('not_quite_there'), decision('not_touched')] })];
    expect(stateOf(rounds)).toBe('not_quite_there');
  });

  it('is feels-right when everything is settled but not all locked', () => {
    expect(stateOf([round({ decisions: [decision('feels_right'), decision('locked')] })])).toBe(
      'feels_right',
    );
  });

  it('is building as soon as anything has been touched', () => {
    expect(
      stateOf([round({ decisions: [decision('direction_set'), decision('not_touched')] })]),
    ).toBe('direction_set');
  });

  it('reads the round in hand, not the one before it', () => {
    const rounds = [
      round({ number: 1, closed_at: '2026-08-05T10:00:00Z', decisions: [decision('locked')] }),
      round({ number: 2, decisions: [decision('not_quite_there')] }),
    ];
    const summaries = phaseSummaries([phase('mix', rounds)]);
    expect(summaries.find((one) => one.key === 'mix')?.state).toBe('not_quite_there');
  });

  it('gives a dot to all seven phases, even ones the song has no row for', () => {
    expect(phaseSummaries([]).map((one) => one.key)).toEqual([...PHASE_KEYS]);
  });
});

describe('where a song stands', () => {
  it('is complete only when every phase has been signed off', () => {
    const allClosed = PHASE_KEYS.reduce<Partial<Record<(typeof PHASE_KEYS)[number], Round[]>>>(
      (all, key) => ({ ...all, [key]: [round({ closed_at: '2026-08-09T10:00:00Z' })] }),
      {},
    );
    expect(standingOf(journey(allClosed))).toBe('completed');

    // Every decision locked is not the same thing: signing off is an act, and
    // nobody but the person listening can perform it.
    const allLocked = PHASE_KEYS.reduce<Partial<Record<(typeof PHASE_KEYS)[number], Round[]>>>(
      (all, key) => ({ ...all, [key]: [round({ decisions: [decision('locked')] })] }),
      {},
    );
    expect(standingOf(journey(allLocked))).toBe('in-progress');
  });

  it('asks for attention over being merely in progress', () => {
    expect(
      standingOf(
        journey({
          write: [round({ decisions: [decision('locked')] })],
          mix: [round({ decisions: [decision('not_quite_there')] })],
        }),
      ),
    ).toBe('needs-attention');
  });

  it('is untouched when nothing has been judged anywhere', () => {
    expect(standingOf(journey())).toBe('untouched');
  });
});

describe('the summary above the list', () => {
  const phasesOf = (s: Song) =>
    s.id === 's1'
      ? journey({ mix: [round({ decisions: [decision('not_quite_there')] })] })
      : journey({ write: [round({ decisions: [decision('direction_set')] })] });

  it('counts what is live and keeps the archived out of it', () => {
    const summary = summarise(
      [song('s1', 'One'), song('s2', 'Two'), song('s3', 'Three', '2026-08-01T10:00:00Z')],
      phasesOf,
    );

    expect(summary.active).toBe(2);
    expect(summary.archived).toBe(1);
    expect(summary.needsAttention).toBe(1);
    expect(summary.inProgress).toBe(1);
  });
});

describe('what is decided', () => {
  it('counts settled against total, and never divides them', () => {
    const phases = journey({
      mix: [
        round({
          decisions: [decision('locked'), decision('feels_right'), decision('not_touched')],
        }),
      ],
    });
    expect(decidedOf(phases)).toEqual({ settled: 2, total: 3 });
  });
});

describe('songs by stage', () => {
  it('puts each song where its last judgement was made', () => {
    const phasesOf = (s: Song) =>
      s.id === 's1'
        ? journey({ mix: [round({ decisions: [decision('locked', '2026-08-12T10:00:00Z')] })] })
        : journey({ write: [round({ decisions: [decision('locked', '2026-08-10T10:00:00Z')] })] });

    const counts = songsByStage([song('s1', 'One'), song('s2', 'Two')], phasesOf);
    expect(counts.find((one) => one.key === 'mix')?.count).toBe(1);
    expect(counts.find((one) => one.key === 'write')?.count).toBe(1);
    expect(counts.reduce((sum, one) => sum + one.count, 0)).toBe(2);
  });
});

describe('production credits', () => {
  it('counts judgements made since the first of the month, and no earlier ones', () => {
    const phases = [
      journey({
        mix: [
          round({
            decisions: [
              decision('locked', '2026-08-03T10:00:00Z'),
              decision('feels_right', '2026-08-19T10:00:00Z'),
              // Last month. Real work, and not this month's figure.
              decision('locked', '2026-07-28T10:00:00Z'),
              decision('not_touched'),
            ],
          }),
        ],
      }),
    ];

    expect(creditsThisMonth(phases, new Date('2026-08-19T12:00:00Z'))).toBe(2);
  });

  it('counts every round, so going back is not a loss', () => {
    const phases = [
      journey({
        mix: [
          round({
            number: 1,
            closed_at: '2026-08-05T10:00:00Z',
            decisions: [decision('locked', '2026-08-04T10:00:00Z')],
          }),
          round({ number: 2, decisions: [decision('direction_set', '2026-08-10T10:00:00Z')] }),
        ],
      }),
    ];

    expect(creditsThisMonth(phases, new Date('2026-08-19T12:00:00Z'))).toBe(2);
  });
});

describe('recent activity', () => {
  it('assembles a record from what already carries a timestamp, newest first', () => {
    const entries = [
      {
        song: song('s1', 'Midnight Drive'),
        phases: journey({
          mix: [
            round({
              closed_at: '2026-08-18T10:00:00Z',
              decisions: [
                decision('locked', '2026-08-19T09:00:00Z', 'Vocal compression'),
                decision('direction_set', '2026-08-17T09:00:00Z', 'Automation pass'),
              ],
            }),
          ],
        }),
        notes: [
          {
            id: 'n1',
            body: 'Snare',
            created_at: '2026-08-16T09:00:00Z',
            origin_phase: 'track' as const,
            target_phase: 'mix' as const,
            for_next_song: false,
            resolved_at: null,
          },
        ],
      },
    ];

    const activity = recentActivity(entries);
    expect(activity.map((one) => one.text)).toEqual([
      'You locked "Vocal compression" in Midnight Drive',
      'You closed the Mix check in Midnight Drive',
      'You judged "Automation pass" in Midnight Drive',
      'You added a note in Midnight Drive',
    ]);
  });

  it('keeps only as many as asked for', () => {
    const entries = [
      {
        song: song('s1', 'One'),
        phases: journey({
          mix: [
            round({
              decisions: [
                decision('locked', '2026-08-19T09:00:00Z'),
                decision('locked', '2026-08-18T09:00:00Z'),
                decision('locked', '2026-08-17T09:00:00Z'),
              ],
            }),
          ],
        }),
        notes: [],
      },
    ];

    expect(recentActivity(entries, 2)).toHaveLength(2);
  });
});

describe('how long ago', () => {
  const now = new Date('2026-08-19T12:00:00Z');

  it('says it the way a person would', () => {
    expect(timeAgo('2026-08-19T11:59:30Z', now)).toBe('Just now');
    expect(timeAgo('2026-08-19T11:30:00Z', now)).toBe('30m ago');
    expect(timeAgo('2026-08-19T09:00:00Z', now)).toBe('3h ago');
    expect(timeAgo('2026-08-18T09:00:00Z', now)).toBe('Yesterday');
    expect(timeAgo('2026-08-16T09:00:00Z', now)).toBe('3 days ago');
    expect(timeAgo('2026-06-16T09:00:00Z', now)).toBe('2 months ago');
  });
});

describe('the next step', () => {
  it('names the decision that does not convince you', () => {
    const phases = journey({
      mix: [
        round({ decisions: [decision('not_quite_there', '2026-08-10T10:00:00Z', 'Vocal sits')] }),
      ],
    });
    expect(nextStep(phases)).toEqual({ phase: 'mix', what: 'Vocal sits' });
  });

  it('points at what is under way when nothing is wanting', () => {
    const phases = journey({ write: [round({ decisions: [decision('direction_set')] })] });
    expect(nextStep(phases)).toEqual({ phase: 'write', what: 'Carry on' });
  });

  it('points at the first phase when nothing has begun', () => {
    expect(nextStep(journey())).toEqual({ phase: 'capture', what: 'Not started' });
  });

  it('has nothing to suggest for a song that is finished', () => {
    const allClosed = PHASE_KEYS.reduce<Partial<Record<(typeof PHASE_KEYS)[number], Round[]>>>(
      (all, key) => ({ ...all, [key]: [round({ closed_at: '2026-08-09T10:00:00Z' })] }),
      {},
    );
    expect(nextStep(journey(allClosed))).toBeNull();
  });
});

describe('the next take', () => {
  const entry = (id: string, phases: Phase[]) => ({ song: song(id, `Song ${id}`), phases });

  it('picks the thing you already know is not right, over anything unstarted', () => {
    const take = nextTake([
      entry(
        's1',
        journey({
          write: [round({ decisions: [decision('direction_set', '2026-08-18T10:00:00Z')] })],
        }),
      ),
      entry(
        's2',
        journey({
          mix: [
            round({
              decisions: [decision('not_quite_there', '2026-08-01T10:00:00Z', 'Vocal sits')],
            }),
          ],
        }),
      ),
    ]);

    expect(take?.song.id).toBe('s2');
    expect(take?.headline).toBe('Vocal sits');
    expect(take?.because).toBe('wanting');
    expect(take?.action).toBe('Back to mixing');
  });

  it('takes the oldest unresolved one, not the newest', () => {
    const take = nextTake([
      entry(
        's1',
        journey({
          mix: [
            round({
              decisions: [
                decision('not_quite_there', '2026-08-18T10:00:00Z', 'Recent'),
                decision('not_quite_there', '2026-08-01T10:00:00Z', 'Been sitting there'),
              ],
            }),
          ],
        }),
      ),
    ]);

    expect(take?.headline).toBe('Been sitting there');
  });

  it('otherwise carries on where the work was last', () => {
    const take = nextTake([
      entry(
        's1',
        journey({ write: [round({ decisions: [decision('locked', '2026-08-01T10:00:00Z')] })] }),
      ),
      entry(
        's2',
        journey({ mix: [round({ decisions: [decision('locked', '2026-08-18T10:00:00Z')] })] }),
      ),
    ]);

    expect(take?.song.id).toBe('s2');
    expect(take?.phase).toBe('mix');
    expect(take?.because).toBe('under-way');
  });

  it('offers a starting point when nothing has been judged at all', () => {
    const take = nextTake([entry('s1', journey())]);
    expect(take?.because).toBe('untouched');
    expect(take?.action).toBe('Start capturing');
  });

  it('has nothing to offer when every song is across the line', () => {
    const closed = PHASE_KEYS.reduce<Partial<Record<(typeof PHASE_KEYS)[number], Round[]>>>(
      (all, key) => ({ ...all, [key]: [round({ closed_at: '2026-08-09T10:00:00Z' })] }),
      {},
    );
    expect(nextTake([entry('s1', journey(closed))])).toBeNull();
  });

  it('does not send you back to a song you have set aside', () => {
    const archived = {
      song: song('s1', 'Set aside', '2026-08-01T10:00:00Z'),
      phases: journey({
        mix: [round({ decisions: [decision('not_quite_there', '2026-08-01T10:00:00Z')] })],
      }),
    };
    expect(nextTake([archived])).toBeNull();
  });
});
