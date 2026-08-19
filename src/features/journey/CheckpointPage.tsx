import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { closeRound, getJourney, getSong, reopenPhase, setDecisionState } from '../../lib/data';
import { checkpointFor, spanInWords, type Checkpoint } from '../../lib/checkpoint';
import {
  PHASE_KEYS,
  PHASE_LABELS,
  currentRound,
  type DecisionState,
  type Journey,
  type PhaseKey,
} from '../../lib/journey';
import { DecisionRow } from './DecisionRow';
import { PhaseIcon } from './PhaseIcon';
import './CheckpointPage.css';

const isPhaseKey = (value: string | undefined): value is PhaseKey =>
  value !== undefined && (PHASE_KEYS as readonly string[]).includes(value);

/**
 * The check itself: one screen, one question — is this pass done?
 *
 * Deliberately not a dialogue over the phase. Stopping is its own act, and a
 * layer floating above the list you were just scrolling reads as an interruption
 * of that list rather than as a moment of its own. It is also a place you can
 * come back to and link to, which a dialogue is not.
 *
 * Nothing here can be failed. What is still open is shown so that closing
 * happens with it in view, not so that it can be refused.
 */
export function CheckpointPage() {
  const { id, phase: fromUrl } = useParams<{ id: string; phase?: string }>();
  const { client } = useAuth();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [journey, setJourney] = useState<Journey | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [song, loaded] = await Promise.all([getSong(client, id), getJourney(client, id)]);
      setTitle(song.title);
      setJourney(loaded);
      setState('ready');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load this song.');
      setState('failed');
    }
  }, [client, id]);

  useEffect(() => {
    // Every setState in load() happens after an await, which the rule cannot see
    // through the function call.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (state === 'loading') return <p role="status">Loading…</p>;

  const selected = isPhaseKey(fromUrl) ? fromUrl : null;
  const phase = journey?.phases.find((candidate) => candidate.key === selected);
  const round = phase ? currentRound(phase) : null;
  const checkpoint = phase ? checkpointFor(phase) : null;

  if (state === 'failed' || !journey || !id || !selected || !phase || !round || !checkpoint) {
    return (
      <>
        <p className="error" role="alert">
          {error ?? 'There is no checkpoint here.'}
        </p>
        <Link to={id ? `/songs/${id}` : '/'}>Back to the song</Link>
      </>
    );
  }

  const back = `/songs/${id}/${selected}`;

  const judge = async (decisionId: string, next: DecisionState) => {
    setError(null);
    try {
      const saved = await setDecisionState(client, decisionId, next);
      setJourney((previous) =>
        previous === null
          ? previous
          : {
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
            },
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That judgement was not saved.');
    }
  };

  const close = async () => {
    setBusy(true);
    setError(null);
    try {
      await closeRound(client, round.id);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That round was not closed.');
    } finally {
      setBusy(false);
    }
  };

  const reopen = async (reason: string) => {
    setBusy(true);
    setError(null);
    try {
      await reopenPhase(client, { id: phase.id, current_round: phase.current_round }, reason);
      await load();
      void navigate(back);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That phase was not reopened.');
      setBusy(false);
    }
  };

  return (
    <div className="check">
      <p className="breadcrumb">
        <Link to={back}>← {PHASE_LABELS[selected]}</Link>
      </p>

      <header className="check__head">
        <span className="check__badge">
          <PhaseIcon phase={selected} className="check__icon" />
        </span>
        <div>
          <p className="check__eyebrow">{title}</p>
          <h1 className="check__title">{PHASE_LABELS[selected]} check</h1>
          {/* What the round cost, which is the part nobody remembers afterwards
              and the only reason the timestamps are kept. */}
          <p className="check__span">
            Round {round.number} · opened {spanInWords(checkpoint)} ·{' '}
            {checkpoint.sittings === 1 ? '1 sitting' : `${String(checkpoint.sittings)} sittings`}
          </p>
          {round.reopen_reason !== null && (
            <p className="check__reason">Reopened because: {round.reopen_reason}</p>
          )}
        </div>
      </header>

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {checkpoint.closedAt === null ? (
        <OpenRound
          checkpoint={checkpoint}
          busy={busy}
          onJudge={(decisionId, next) => void judge(decisionId, next)}
          onClose={() => void close()}
        />
      ) : (
        <ClosedRound
          checkpoint={checkpoint}
          number={round.number}
          busy={busy}
          onReopen={(reason) => void reopen(reason)}
        />
      )}
    </div>
  );
}

/**
 * The check on a round still running. Everything that is open, judgeable here,
 * and then the button that ends the pass.
 */
function OpenRound({
  checkpoint,
  busy,
  onJudge,
  onClose,
}: {
  checkpoint: Checkpoint;
  busy: boolean;
  onJudge: (decisionId: string, next: DecisionState) => void;
  onClose: () => void;
}) {
  const open = checkpoint.open;

  return (
    <>
      <p className="check__count">
        {checkpoint.locked} of {checkpoint.total} decisions locked
      </p>

      <section className="check__block" aria-labelledby="check-open">
        <h2 id="check-open">
          {checkpoint.total === 0
            ? 'Nothing to decide here'
            : open.length === 0
              ? 'Nothing is open'
              : 'Still open'}
        </h2>
        {checkpoint.total === 0 ? (
          // Not a failure state. Some phases genuinely have nothing to judge,
          // and one that cannot be ended is one that stays open for ever.
          <p className="check__note">
            This phase has no decisions in it. Some need none — an idea is caught or it is not.
            Closing records that you went through it.
          </p>
        ) : open.length === 0 ? (
          <p className="check__empty">
            Every decision in this round is at least good enough to play to somebody.
          </p>
        ) : (
          <>
            <p className="check__note">
              Settle them here, or close the round with them open — a pass can end unfinished, it
              just should not end unseen.
            </p>
            <ul className="check__decisions" aria-label="Open decisions">
              {open.map((decision) => (
                <DecisionRow
                  key={decision.id}
                  decision={decision}
                  siblings={open}
                  onJudge={(next) => {
                    onJudge(decision.id, next);
                  }}
                  onStep={() => {
                    // Steps belong to the phase, not to the check. Judging is
                    // the only thing this screen writes.
                  }}
                />
              ))}
            </ul>
          </>
        )}
      </section>

      {checkpoint.unconfirmed.length > 0 && (
        <section className="check__block" aria-labelledby="check-once">
          <h2 id="check-once">Heard once</h2>
          <p className="check__note">
            Judged well, on one listen. Meeting them again on another day is what makes it stick —
            nothing here is wrong, and nothing has to be done about it now.
          </p>
          <ul className="check__once">
            {checkpoint.unconfirmed.map((decision) => (
              <li key={decision.id}>{decision.title}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="check__actions">
        <button type="button" className="check__close" disabled={busy} onClick={onClose}>
          {busy
            ? 'Closing…'
            : checkpoint.total === 0 || checkpoint.settled
              ? 'Close this round'
              : `Close it anyway — ${String(open.length)} still open`}
        </button>
        <p className="check__fineprint">
          Closing records the pass. It changes no judgement, and going back later opens a new round
          rather than undoing this one.
        </p>
      </div>
    </>
  );
}

/** The check on a round that has ended: what it came to, and the way back in. */
function ClosedRound({
  checkpoint,
  number,
  busy,
  onReopen,
}: {
  checkpoint: Checkpoint;
  number: number;
  busy: boolean;
  onReopen: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [asking, setAsking] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onReopen(reason);
  };

  return (
    <>
      <p className="check__count check__count--closed">
        Round {number} closed · {checkpoint.locked} of {checkpoint.total} decisions locked ·{' '}
        {spanInWords(checkpoint)}
      </p>

      {checkpoint.open.length > 0 && (
        <section className="check__block" aria-labelledby="check-left">
          <h2 id="check-left">Left open</h2>
          <ul className="check__once">
            {checkpoint.open.map((decision) => (
              <li key={decision.id}>{decision.title}</li>
            ))}
          </ul>
        </section>
      )}

      {!asking ? (
        <div className="check__actions">
          <button
            type="button"
            className="check__close"
            onClick={() => {
              setAsking(true);
            }}
          >
            Go back in — start round {number + 1}
          </button>
          <p className="check__fineprint">
            This round stays exactly as it is. A new one starts fresh from the template beside it.
          </p>
        </div>
      ) : (
        <form className="check__reopen" onSubmit={submit}>
          <label className="check__label" htmlFor="reopen-reason">
            What sent you back?
          </label>
          {/* Asked, not required. A reason written now is the only thing that
              will explain this round to you in three months. */}
          <input
            id="reopen-reason"
            type="text"
            placeholder="The low end fell apart in the car"
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
          <button type="submit" disabled={busy}>
            {busy ? 'Opening…' : `Start round ${String(number + 1)}`}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setAsking(false);
            }}
          >
            Cancel
          </button>
        </form>
      )}
    </>
  );
}
