import { PHASE_LABELS, creditsFor, totalMade, type Phase } from '../../lib/journey';
import { PhaseIcon } from './PhaseIcon';
import './DecisionLog.css';

/**
 * What this song has cost in judgements, phase by phase.
 *
 * A decision log, not "production credits" — credits are a settled thing in the
 * music business, and this is not that. It is your own record of calls made.
 *
 * A count and not a rating, and deliberately the one figure on the page that
 * only ever goes up. Everything else here asks how far there is to go; this says
 * what has already been done, including the passes that were gone through twice.
 *
 * Phases nobody has judged are left out rather than shown as zero — a list of
 * noughts reads as a reproach, and the sidebar already says what has not begun.
 */
export function DecisionLog({ phases }: { phases: Phase[] }) {
  const credits = creditsFor(phases).filter((entry) => entry.made > 0);
  const total = totalMade(phases);

  if (total === 0) return null;

  return (
    <section className="credits" aria-labelledby="credits-heading">
      <h2 id="credits-heading" className="credits__heading">
        Decision log
      </h2>

      <ul className="credits__list">
        {credits.map((entry) => (
          <li key={entry.key} className="credits__row">
            <span className="credits__badge">
              <PhaseIcon phase={entry.key} className="credits__icon" />
            </span>
            <span className="credits__words">
              <span className="credits__name">{PHASE_LABELS[entry.key]}</span>
              <span className="credits__count">
                {entry.made} {entry.made === 1 ? 'decision' : 'decisions'}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <p className="credits__total">
        <span className="credits__total-label">Total</span>
        <span className="credits__total-figure">{total}</span>
        <span className="credits__total-unit">{total === 1 ? 'decision' : 'decisions'}</span>
      </p>
    </section>
  );
}
