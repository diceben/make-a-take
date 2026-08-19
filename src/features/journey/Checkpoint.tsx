import { Link } from 'react-router-dom';
import { summaryOf, type Checkpoint } from '../../lib/checkpoint';
import { PHASE_LABELS, type PhaseKey } from '../../lib/journey';
import { PhaseIcon } from './PhaseIcon';
import './Checkpoint.css';

/**
 * The card that offers the check, in the right column.
 *
 * It says the count, then names what is still open — at most three, because a
 * card listing eleven things is a list, and a list is what the middle column
 * already is. The point of naming any is that "two things need attention" is
 * something you act on and "83% there" is not.
 */
export function CheckpointCard({
  songId,
  phase,
  checkpoint,
}: {
  songId: string;
  phase: PhaseKey;
  checkpoint: Checkpoint;
}) {
  const named = checkpoint.open.slice(0, 3);
  const rest = checkpoint.open.length - named.length;

  return (
    <section className="checkpoint" aria-labelledby="checkpoint-heading">
      <span className="checkpoint__badge">
        <PhaseIcon phase={phase} className="checkpoint__icon" />
      </span>

      <h2 id="checkpoint-heading" className="checkpoint__heading">
        {PHASE_LABELS[phase]} checkpoint
      </h2>

      {checkpoint.closedAt === null ? (
        <>
          <p className="checkpoint__summary">{summaryOf(checkpoint)}</p>

          {checkpoint.open.length > 0 && (
            <>
              <p className="checkpoint__lead">
                {checkpoint.open.length === 1
                  ? 'One thing still needs attention:'
                  : `${String(checkpoint.open.length)} things still need attention:`}
              </p>
              <ul className="checkpoint__list">
                {named.map((decision) => (
                  <li key={decision.id}>{decision.title}</li>
                ))}
                {rest > 0 && <li className="checkpoint__rest">and {rest} more</li>}
              </ul>
            </>
          )}

          {checkpoint.total > 0 && (
            <Link className="checkpoint__enter" to={`/songs/${songId}/${phase}/check`}>
              Enter {PHASE_LABELS[phase].toLowerCase()} check <span aria-hidden="true">→</span>
            </Link>
          )}
        </>
      ) : (
        <>
          <p className="checkpoint__summary">This round is closed.</p>
          <Link className="checkpoint__enter" to={`/songs/${songId}/${phase}/check`}>
            Look at what was decided <span aria-hidden="true">→</span>
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
        <span className="banner__heading">{PHASE_LABELS[phase]} checkpoint</span>
        <span className="banner__sub">
          {checkpoint.settled
            ? 'Everything here is settled. Worth one look before it is.'
            : 'Review what matters before moving on.'}
        </span>
      </p>

      <Link className="banner__enter" to={`/songs/${songId}/${phase}/check`}>
        Enter {PHASE_LABELS[phase].toLowerCase()} check <span aria-hidden="true">→</span>
      </Link>
    </aside>
  );
}
