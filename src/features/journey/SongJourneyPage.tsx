import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import {
  addNote,
  closeRound,
  getJourney,
  getSong,
  resolveNote,
  setDecisionState,
  setStepDone,
} from '../../lib/data';
import {
  PHASE_DESCRIPTIONS,
  PHASE_KEYS,
  PHASE_LABELS,
  STATES,
  STATE_LABELS,
  currentPhase as phaseInHand,
  currentRound,
  decisionsOf,
  isSettled,
  openDecisions,
  type Decision,
  type DecisionState,
  type Journey,
  type PhaseKey,
} from '../../lib/journey';
import { checkpointFor } from '../../lib/checkpoint';
import type { SongWithSteps } from '../../lib/model';
import { CheckpointBanner, CheckpointCard } from './Checkpoint';
import { DecisionRow } from './DecisionRow';
import { PhaseIcon } from './PhaseIcon';
import { PhaseJourney } from './PhaseJourney';
import { AddNote, WaitingNotes } from './PhaseNotes';
import { ProductionCredits } from './ProductionCredits';
import './SongJourneyPage.css';

const isPhaseKey = (value: string | undefined): value is PhaseKey =>
  value !== undefined && (PHASE_KEYS as readonly string[]).includes(value);

/** 'all', or one of the five stages. */
type StateFilter = 'all' | DecisionState;

/**
 * A song, one phase at a time.
 *
 * There is no view that lists all seven phases as lists at once — the sidebar is
 * where the whole song lives, and the middle is where one phase is worked on.
 *
 * The phase on screen is URL state and nothing more. Clicking a phase in the
 * sidebar does not change where the work is: looking is not working, and the
 * phase in hand is wherever the last judgement was made.
 */
export function SongJourneyPage() {
  const { id, phase: fromUrl } = useParams<{ id: string; phase?: string }>();
  const auth = useAuth();
  const { client } = auth;
  const navigate = useNavigate();
  const userId = auth.status === 'signed-in' ? auth.session.user.id : null;

  const [song, setSong] = useState<SongWithSteps | null>(null);
  const [journey, setJourney] = useState<Journey | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StateFilter>('all');
  const [closing, setClosing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [loadedSong, loadedJourney] = await Promise.all([
        getSong(client, id),
        getJourney(client, id),
      ]);
      setSong(loadedSong);
      setJourney(loadedJourney);
      setState('ready');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load this song.');
      setState('failed');
    }
  }, [client, id]);

  useEffect(() => {
    // The rule flags any call that can reach setState. Every setState in load()
    // happens after an await, which is the pattern the rule is meant to permit —
    // it cannot see through the function call.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (state === 'loading') return <p role="status">Loading…</p>;

  if (state === 'failed' || !song || !journey || !id) {
    return (
      <>
        <p className="error" role="alert">
          {error ?? 'This song could not be found.'}
        </p>
        <Link to="/">Back to your songs</Link>
      </>
    );
  }

  const inHand = phaseInHand(journey.phases);
  // Opening a song puts you where the work is; after that the address decides.
  const selected = isPhaseKey(fromUrl) ? fromUrl : inHand;
  const phase = journey.phases.find((candidate) => candidate.key === selected);
  const round = phase ? currentRound(phase) : null;
  const decisions = phase ? decisionsOf(phase) : [];
  const checkpoint = phase ? checkpointFor(phase) : null;
  const open = openDecisions(journey.phases);

  // Settled, not locked: the bar asks how much of this phase you would play to
  // somebody, which is a different question from what you would never touch
  // again. The word is on the line so the two are never read as one figure.
  const settled = decisions.filter(isSettled).length;
  const shown = filter === 'all' ? decisions : decisions.filter((one) => one.state === filter);

  const replaceDecision = (decisionId: string, change: (previous: Journey) => Journey) => {
    setJourney((previous) => (previous === null ? previous : change(previous)));
    return decisionId;
  };

  const judge = async (decisionId: string, next: DecisionState) => {
    setError(null);
    try {
      const saved = await setDecisionState(client, decisionId, next);
      replaceDecision(decisionId, (previous) => ({
        ...previous,
        phases: previous.phases.map((candidate) => ({
          ...candidate,
          rounds: candidate.rounds.map((r) => ({
            ...r,
            decisions: r.decisions.map((d) =>
              d.id === decisionId ? { ...d, ...saved, steps: d.steps } : d,
            ),
          })),
        })),
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That judgement was not saved.');
    }
  };

  /**
   * Closing a round from the card. Only ever an empty one — anything with
   * decisions in it goes through the check, where what is open can be seen
   * before it is signed off.
   */
  const close = async (roundId: string | undefined) => {
    if (roundId === undefined) return;
    setClosing(true);
    setError(null);
    try {
      const closedAt = await closeRound(client, roundId);
      setJourney((previous) =>
        previous === null
          ? previous
          : {
              ...previous,
              phases: previous.phases.map((candidate) => ({
                ...candidate,
                rounds: candidate.rounds.map((r) =>
                  r.id === roundId ? { ...r, closed_at: closedAt } : r,
                ),
              })),
            },
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That round was not closed.');
    } finally {
      setClosing(false);
    }
  };

  const tick = async (stepId: string, done: boolean) => {
    setError(null);
    try {
      await setStepDone(client, stepId, done);
      setJourney((previous) =>
        previous === null
          ? previous
          : {
              ...previous,
              phases: previous.phases.map((candidate) => ({
                ...candidate,
                rounds: candidate.rounds.map((r) => ({
                  ...r,
                  decisions: r.decisions.map((d) => ({
                    ...d,
                    steps: d.steps.map((s) => (s.id === stepId ? { ...s, done } : s)),
                  })),
                })),
              })),
            },
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That step was not saved.');
    }
  };

  return (
    <div className="journey-page">
      <p className="breadcrumb">
        <Link to="/">← Your songs</Link>
      </p>

      <header className="journey-page__head">
        <h1>{song.title}</h1>
        {/* No percentage anywhere. What is open is more use than how far along
            it is, and it is the thing you would have had to work out yourself. */}
        {open.length > 0 && (
          <p className="journey-page__open">
            <span className="journey-page__open-label">Open:</span>{' '}
            {open.map((entry, index) => (
              <span key={entry.decision.id}>
                {index > 0 && ' · '}
                <Link to={`/songs/${id}/${entry.phase}`}>{entry.decision.title}</Link>
              </span>
            ))}
          </p>
        )}
      </header>

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="journey-page__columns">
        <PhaseJourney
          songId={id}
          phases={journey.phases}
          notes={journey.notes}
          selected={selected}
          current={inHand}
        />

        <section className="journey-page__main" aria-labelledby="phase-heading">
          <header className="phase-head">
            <span className="phase-head__badge">
              <PhaseIcon phase={selected} className="phase-head__icon" />
            </span>
            <div className="phase-head__words">
              <h2 id="phase-heading" className="phase-head__name">
                {PHASE_LABELS[selected]}
              </h2>
              <p className="phase-head__blurb">{PHASE_DESCRIPTIONS[selected]}</p>
            </div>
          </header>

          {decisions.length > 0 && (
            <Meter settled={settled} total={decisions.length} round={round?.number ?? 1} />
          )}

          {decisions.length > 1 && (
            <Chips decisions={decisions} filter={filter} onFilter={setFilter} />
          )}

          {decisions.length === 0 ? (
            <p className="journey-page__empty">
              Nothing here yet. This phase has no decisions in this round.
            </p>
          ) : shown.length === 0 ? (
            <p className="journey-page__empty">
              Nothing in this phase is at {STATE_LABELS[filter as DecisionState].toLowerCase()}.
            </p>
          ) : (
            <ul className="journey-page__decisions" aria-label="Decisions">
              {shown.map((decision) => (
                <DecisionRow
                  key={decision.id}
                  decision={decision}
                  siblings={decisions}
                  onJudge={(next) => void judge(decision.id, next)}
                  onStep={(stepId, done) => void tick(stepId, done)}
                />
              ))}
            </ul>
          )}

          {/* The checkpoint sits directly under the decisions, because working
              down the list is how you arrive at the question it asks. The note
              field comes after it: writing something down is the quieter act. */}
          {checkpoint !== null && (
            <CheckpointBanner songId={id} phase={selected} checkpoint={checkpoint} />
          )}

          <AddNote
            phase={selected}
            onAdd={async (body, target, forNextSong) => {
              if (!userId) return;
              const created = await addNote(client, {
                songId: id,
                body,
                authorId: userId,
                originPhase: selected,
                targetPhase: target,
                forNextSong,
              });
              setJourney((previous) =>
                previous === null ? previous : { ...previous, notes: [created, ...previous.notes] },
              );
            }}
          />
        </section>

        <aside className="journey-page__aside">
          {checkpoint !== null && (
            <CheckpointCard
              songId={id}
              phase={selected}
              checkpoint={checkpoint}
              busy={closing}
              onClose={() => void close(round?.id)}
            />
          )}

          <ProductionCredits phases={journey.phases} />

          <WaitingNotes
            phase={selected}
            notes={journey.notes}
            onResolve={(noteId) => {
              void (async () => {
                try {
                  await resolveNote(client, noteId);
                  setJourney((previous) =>
                    previous === null
                      ? previous
                      : {
                          ...previous,
                          notes: previous.notes.map((note) =>
                            note.id === noteId
                              ? { ...note, resolved_at: new Date().toISOString() }
                              : note,
                          ),
                        },
                  );
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : 'That note stayed put.');
                }
              })();
            }}
          />
        </aside>
      </div>

      <p className="journey-page__back">
        <button
          type="button"
          onClick={() => {
            void navigate('/');
          }}
        >
          Back to your songs
        </button>
      </p>
    </div>
  );
}

/**
 * How much of this phase is settled, as a count with a bar behind it.
 *
 * The percentage is the same figure said a second way, and it is here because it
 * reads at a glance where a fraction has to be worked out. It is safe in a way
 * the song-wide one was not: everything in it is one phase's decisions, so the
 * things being added together are actually comparable.
 */
function Meter({ settled, total, round }: { settled: number; total: number; round: number }) {
  const share = Math.round((settled / total) * 100);

  return (
    <div className="meter">
      <p className="meter__count">
        <span className="meter__done">{settled}</span>
        <span className="meter__of"> / {total} decisions settled</span>
      </p>

      {/* Decorative: the numbers either side of it are the content, and a
          progressbar role here would have a screen reader read the same
          fraction twice. */}
      <span className="meter__track" aria-hidden="true">
        <span className="meter__fill" style={{ width: `${String(share)}%` }} />
      </span>

      <p className="meter__share">
        {share}%{round > 1 && <span className="meter__round">round {round}</span>}
      </p>
    </div>
  );
}

/**
 * The five stages as filters, each with its count.
 *
 * Counts on the chips, because a filter that leads to an empty list is a
 * question answered too late — "Locked 4" says what pressing it will do.
 * A stage nothing is at is disabled rather than hidden, so the row does not
 * reshuffle itself under the pointer every time a judgement changes.
 */
function Chips({
  decisions,
  filter,
  onFilter,
}: {
  decisions: Decision[];
  filter: StateFilter;
  onFilter: (next: StateFilter) => void;
}) {
  const count = (state: DecisionState) => decisions.filter((one) => one.state === state).length;

  return (
    <div className="chips" role="group" aria-label="Show only">
      <button
        type="button"
        className="chips__chip"
        aria-pressed={filter === 'all'}
        onClick={() => {
          onFilter('all');
        }}
      >
        All <span className="chips__count">{decisions.length}</span>
      </button>

      {STATES.map((state) => (
        <button
          key={state}
          type="button"
          className="chips__chip"
          data-state={state}
          aria-pressed={filter === state}
          disabled={count(state) === 0}
          onClick={() => {
            onFilter(state);
          }}
        >
          {STATE_LABELS[state]} <span className="chips__count">{count(state)}</span>
        </button>
      ))}
    </div>
  );
}
