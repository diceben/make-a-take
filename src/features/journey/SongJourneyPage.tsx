import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import {
  addNote,
  getJourney,
  getSong,
  resolveNote,
  setDecisionState,
  setStepDone,
} from '../../lib/data';
import {
  PHASE_KEYS,
  PHASE_LABELS,
  currentPhase as phaseInHand,
  currentRound,
  decisionsOf,
  lockedCount,
  openDecisions,
  type DecisionState,
  type Journey,
  type PhaseKey,
} from '../../lib/journey';
import type { SongWithSteps } from '../../lib/model';
import { DecisionRow } from './DecisionRow';
import { PhaseJourney } from './PhaseJourney';
import { AddNote, WaitingNotes } from './PhaseNotes';
import './SongJourneyPage.css';

const isPhaseKey = (value: string | undefined): value is PhaseKey =>
  value !== undefined && (PHASE_KEYS as readonly string[]).includes(value);

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
  const counted = phase ? lockedCount(phase) : { locked: 0, total: 0 };
  const open = openDecisions(journey.phases);

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
          <h2 id="phase-heading" className="journey-page__phase">
            {PHASE_LABELS[selected]}
          </h2>
          <p className="journey-page__round">
            round {round?.number ?? 1}
            {counted.total > 0 && ` · ${counted.locked} of ${counted.total} locked`}
          </p>

          {decisions.length === 0 ? (
            <p className="journey-page__empty">
              Nothing here yet. This phase has no decisions in this round.
            </p>
          ) : (
            <ul className="journey-page__decisions" aria-label="Decisions">
              {decisions.map((decision) => (
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
