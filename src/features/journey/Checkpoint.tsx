import { Link } from 'react-router-dom';
import { summaryOf, type Checkpoint } from '../../lib/checkpoint';
import { PHASE_LABELS, type PhaseKey } from '../../lib/journey';
import { PhaseIcon } from './PhaseIcon';
import './Checkpoint.css';

/**
 * The card that offers the check, in the right column.
 *
 * It carries progress and the way in, and deliberately not a list of what is
 * open — the middle column is that list, a few lines lower, and a sidebar that
 * repeats the page is a sidebar you learn to skip. What it adds is the shape of
 * the thing: how much of this phase is held, and how much is left.
 */
export function CheckpointCard({
  songId,
  phase,
  checkpoint,
  busy = false,
  onClose,
  onFill,
}: {
  songId: string;
  phase: PhaseKey;
  checkpoint: Checkpoint;
  busy?: boolean;
  /** Closing an empty round, which happens here rather than behind the check. */
  onClose: () => void;
  /** Filling an empty round from the template. */
  onFill: () => void;
}) {
  // A phase with nothing in it still has to be able to end, or it stays open
  // for ever. Capture is the plain case: an idea is caught or it is not, and
  // there is no judgement to make about it — so there is nothing to review, and
  // sending someone to a review screen would be a formality with one button on
  // it. The button is here instead.
  if (checkpoint.total === 0 && checkpoint.closedAt === null) {
    return (
      <section className="checkpoint" aria-labelledby="checkpoint-heading">
        <span className="checkpoint__badge">
          <PhaseIcon phase={phase} className="checkpoint__icon" />
        </span>

        <h2 id="checkpoint-heading" className="checkpoint__heading">
          {PHASE_LABELS[phase]} check
        </h2>

        <p className="checkpoint__summary">{summaryOf(checkpoint)}</p>
        <p className="checkpoint__lead">
          Take the template&rsquo;s, or close it as it is — some phases genuinely need no decision,
          and an idea is caught or it is not.
        </p>

        {/* Filling first, because it is the one you almost always want: an
            empty phase is usually one nobody has put anything in yet, not one
            that is finished. */}
        <button type="button" className="checkpoint__fill" disabled={busy} onClick={onFill}>
          {busy ? 'Working…' : 'Fill from the template'}
        </button>

        <button type="button" className="checkpoint__close" disabled={busy} onClick={onClose}>
          {busy ? 'Working…' : `Close ${PHASE_LABELS[phase].toLowerCase()} empty`}
        </button>
      </section>
    );
  }

  return (
    <section className="checkpoint" aria-labelledby="checkpoint-heading">
      <span className="checkpoint__badge">
        <PhaseIcon phase={phase} className="checkpoint__icon" />
      </span>

      <h2 id="checkpoint-heading" className="checkpoint__heading">
        {PHASE_LABELS[phase]} check
      </h2>

      {checkpoint.closedAt === null ? (
        <>
          {/* Progress, not a second copy of the list. Naming the open decisions
              here repeated what the middle column says a few lines lower, and a
              sidebar that repeats the page is a sidebar you learn to skip. */}
          <p className="checkpoint__figure">
            <span className="checkpoint__locked">{checkpoint.locked}</span>
            <span className="checkpoint__of"> / {checkpoint.total} locked</span>
          </p>

          <span className="checkpoint__bar" aria-hidden="true">
            <span
              className="checkpoint__fill"
              style={{
                width: `${String(
                  checkpoint.total === 0 ? 0 : (checkpoint.locked / checkpoint.total) * 100,
                )}%`,
              }}
            />
          </span>

          <p className="checkpoint__remaining">
            {checkpoint.open.length === 0
              ? 'Nothing left to decide here.'
              : checkpoint.open.length === 1
                ? '1 decision remaining'
                : `${String(checkpoint.open.length)} decisions remaining`}
          </p>

          {checkpoint.total > 0 && (
            <Link className="checkpoint__enter" to={`/songs/${songId}/${phase}/check`}>
              Enter the {PHASE_LABELS[phase].toLowerCase()} check <span aria-hidden="true">→</span>
            </Link>
          )}
        </>
      ) : (
        <>
          <p className="checkpoint__summary">This round is closed.</p>
          <Link className="checkpoint__enter" to={`/songs/${songId}/${phase}/check`}>
            {checkpoint.total === 0 ? 'Go back in' : 'Look at what was decided'}{' '}
            <span aria-hidden="true">→</span>
          </Link>
        </>
      )}
    </section>
  );
}

/**
 * The same offer, across the foot of the middle column.
 *
 * A checkpoint at the bottom of the decisions is the checkpoint in the place it
 * belongs: you reach it by working down the list, which is how you would reach
 * it in the room. The card in the right column is for the visit that starts
 * somewhere else.
 */
export function CheckpointBanner({
  songId,
  phase,
  checkpoint,
}: {
  songId: string;
  phase: PhaseKey;
  checkpoint: Checkpoint;
}) {
  if (checkpoint.total === 0 || checkpoint.closedAt !== null) return null;

  return (
    <aside className="banner">
      <span className="banner__badge">
        <PhaseIcon phase={phase} className="banner__icon" />
      </span>

      <p className="banner__words">
        <span className="banner__heading">{PHASE_LABELS[phase]} check</span>
        <span className="banner__sub">
          {checkpoint.settled
            ? 'Everything here is settled. Worth one look before it is.'
            : 'Review what matters before moving on.'}
        </span>
      </p>

      <Link className="banner__enter" to={`/songs/${songId}/${phase}/check`}>
        Enter the {PHASE_LABELS[phase].toLowerCase()} check <span aria-hidden="true">→</span>
      </Link>
    </aside>
  );
}
