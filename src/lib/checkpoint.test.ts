import { describe, expect, it } from 'vitest';
import { checkpointFor, spanInWords, summaryOf } from './checkpoint';
import type { Decision, DecisionState, Phase, Round } from './journey';

let counter = 0;

const decision = (state: DecisionState, at: string | null = null, confirmed = false): Decision => ({
  id: `d-${(counter += 1)}`,
  title: `Decision ${String(counter)}`,
  subtitle: null,
  position: counter,
  state,
  state_set_at: at,
  state_confirmed_at: confirmed ? '2026-08-14T10:00:00Z' : null,
  steps: [],
});

const round = (over: Partial<Round> = {}): Round => ({
  id: 'r1',
  number: 1,
  opened_at: '2026-08-01T10:00:00Z',
  closed_at: null,
  reopen_reason: null,
  decisions: [],
  ...over,
});

const phase = (rounds: Round[], current = 1): Phase => ({
  id: 'p1',
  key: 'mix',
  position: 6,
  current_round: current,
  rounds,
});

const NOW = new Date('2026-08-13T10:00:00Z');

describe('the checkpoint', () => {
  it('is nothing at all for a phase with no round', () => {
    expect(checkpointFor(phase([]), NOW)).toBeNull();
  });

  it('counts what is locked and gathers what is still open', () => {
    const open = decision('not_quite_there', '2026-08-10T21:00:00Z');
    const check = checkpointFor(
      phase([
        round({
          decisions: [decision('locked', '2026-08-09T21:00:00Z'), decision('feels_right'), open],
        }),
      ]),
      NOW,
    );

    expect(check?.locked).toBe(1);
    expect(check?.total).toBe(3);
    expect(check?.open.map((one) => one.id)).toEqual([open.id]);
  });

  it('treats feels-right as settled — the check is not a demand to lock everything', () => {
    const check = checkpointFor(
      phase([round({ decisions: [decision('feels_right', '2026-08-09T21:00:00Z')] })]),
      NOW,
    );

    expect(check?.open).toEqual([]);
    expect(check?.settled).toBe(true);
  });

  it('is not settled while nothing has been decided at all', () => {
    // An empty round is not a finished one; it is one nobody has started.
    expect(checkpointFor(phase([round()]), NOW)?.settled).toBe(false);
  });

  it('names what was judged well but only heard once', () => {
    const once = decision('locked', '2026-08-12T21:00:00Z');
    const twice = decision('locked', '2026-08-09T21:00:00Z', true);
    const check = checkpointFor(phase([round({ decisions: [once, twice] })]), NOW);

    expect(check?.unconfirmed.map((one) => one.id)).toEqual([once.id]);
  });

  it('measures an open round up to now, and a closed one up to when it closed', () => {
    const open = checkpointFor(phase([round()]), NOW);
    expect(open?.days).toBe(12);

    const shut = checkpointFor(phase([round({ closed_at: '2026-08-04T10:00:00Z' })]), NOW);
    // Closed on the 4th, so it stays at three days however long ago that was.
    expect(shut?.days).toBe(3);
    expect(shut?.closedAt).toBe('2026-08-04T10:00:00Z');
  });

  it('counts the stretches of work rather than the judgements', () => {
    const check = checkpointFor(
      phase([
        round({
          decisions: [
            decision('locked', '2026-08-10T21:00:00Z'),
            decision('locked', '2026-08-10T21:20:00Z'),
            // Next evening: a second sitting, not a third judgement in the first.
            decision('locked', '2026-08-11T20:00:00Z'),
          ],
        }),
      ]),
      NOW,
    );

    expect(check?.sittings).toBe(2);
  });

  it('reads the round being worked on, not the one before it', () => {
    const check = checkpointFor(
      phase(
        [
          round({ id: 'r1', number: 1, closed_at: '2026-08-05T10:00:00Z' }),
          round({
            id: 'r2',
            number: 2,
            opened_at: '2026-08-06T10:00:00Z',
            reopen_reason: 'The low end fell apart on the car speakers',
            decisions: [decision('not_touched')],
          }),
        ],
        2,
      ),
      NOW,
    );

    expect(check?.openedAt).toBe('2026-08-06T10:00:00Z');
    expect(check?.closedAt).toBeNull();
    expect(check?.total).toBe(1);
  });
});

describe('what the checkpoint says', () => {
  const check = (over: Partial<Round> = {}, now = NOW) => checkpointFor(phase([round(over)]), now);

  it('counts rather than rates', () => {
    const decisions = [decision('locked', '2026-08-09T21:00:00Z'), decision('not_touched')];
    expect(summaryOf(checkpointFor(phase([round({ decisions })]), NOW)!)).toBe(
      '1 of 2 decisions locked.',
    );
  });

  it('states an empty round rather than calling it unstarted', () => {
    // "Nothing to check yet" said the phase was waiting for something. Some
    // phases never need a decision, and they still have to be able to end.
    expect(summaryOf(check()!)).toBe('No decisions in this round.');
  });

  it('puts the span in days, because that is the unit the work has', () => {
    expect(spanInWords(check({}, new Date('2026-08-01T18:00:00Z'))!)).toBe('today');
    expect(spanInWords(check({}, new Date('2026-08-02T18:00:00Z'))!)).toBe('since yesterday');
    expect(spanInWords(check({}, new Date('2026-08-13T10:00:00Z'))!)).toBe('over 12 days');
  });
});
