import { Link } from 'react-router-dom';
import {
  PHASE_LABELS,
  markersFor,
  songTotals,
  type Note,
  type Phase,
  type PhaseKey,
} from '../../lib/journey';
import './PhaseJourney.css';

/**
 * The seven phases, always there, in the left column.
 *
 * Because the middle shows one phase at a time, this is the only place the whole
 * song is visible — so every row carries its own state and nothing has to be
 * opened to be found out. At most two markers, in the order of what matters:
 * what is waiting for you, what you have only heard once, whether you have been
 * back, how far along, whether it is closed, whether it has begun.
 *
 * Every phase is reachable at any time. Nothing here is locked behind the one
 * before it: somebody who has fixed nothing in writing may still look at the
 * mix, and looking is not working — which is why these are links that change
 * only what is on screen.
 */
export function PhaseJourney({
  songId,
  phases,
  notes,
  selected,
  current,
}: {
  songId: string;
  phases: Phase[];
  notes: Note[];
  selected: PhaseKey;
  /** Where the work actually is, which is not necessarily what is on screen. */
  current: PhaseKey;
}) {
  const totals = songTotals(phases);

  return (
    <nav className="journey" aria-label="Song journey">
      <p className="journey__eyebrow">Song journey</p>

      <ol className="journey__list">
        {phases.map((phase) => {
          const markers = markersFor(phase, notes);
          const isSelected = phase.key === selected;

          return (
            <li key={phase.id}>
              <Link
                to={`/songs/${songId}/${phase.key}`}
                className={isSelected ? 'journey__row journey__row--selected' : 'journey__row'}
                aria-current={isSelected ? 'page' : undefined}
              >
                <span className="journey__line">
                  <span className="journey__number">{String(phase.position).padStart(2, '0')}</span>
                  <span className="journey__name">{PHASE_LABELS[phase.key]}</span>
                  {phase.key === current && (
                    <span className="journey__here" title="Where the last judgement was made">
                      here
                    </span>
                  )}
                </span>

                {markers.map((marker) => (
                  // Written out rather than dotted: not-quite-there and
                  // feels-right are neighbouring warm colours, and as small
                  // marks nobody could tell them apart.
                  <span key={marker.kind} className="journey__marker" data-kind={marker.kind}>
                    {marker.text}
                  </span>
                ))}
              </Link>
            </li>
          );
        })}
      </ol>

      <p className="journey__totals">
        {totals.locked} decisions locked · {totals.reopened} reopened
      </p>
    </nav>
  );
}
