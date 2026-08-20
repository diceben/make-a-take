import { Link } from 'react-router-dom';
import type { NextTake as Take } from '../../lib/dashboard';
import { PHASE_LABELS } from '../../lib/journey';
import { PhaseIcon } from '../journey/PhaseIcon';
import './NextTake.css';

const BECAUSE: Record<Take['because'], string> = {
  wanting: 'You judged this and it did not convince you',
  'under-way': 'Where you left off',
  untouched: 'Nothing decided here yet',
};

/**
 * The one thing to do next, and the way straight into it.
 *
 * It names exactly one, which is the point. A list of things you could do next
 * is a list of ways to keep tweaking, and the app's whole argument is that a
 * song gets finished by deciding and moving on. So the biggest thing on the
 * screen is not a summary of everything — it is one offer, with a button.
 *
 * It sits above the figures on purpose. The counts answer "how am I doing";
 * this answers "what now", and that is the question somebody opens the app
 * with.
 */
export function NextTake({ take }: { take: Take }) {
  return (
    <section className="take" aria-labelledby="take-heading">
      <p id="take-heading" className="take__eyebrow">
        Your next take
      </p>

      <div className="take__body">
        <span className="take__badge">
          <PhaseIcon phase={take.phase} className="take__icon" />
        </span>

        <div className="take__words">
          <p className="take__song">
            {take.song.title}
            {take.song.artist !== null && (
              <span className="take__artist"> · {take.song.artist}</span>
            )}
          </p>

          <p className="take__headline">{take.headline}</p>

          <p className="take__meta">
            <span className="take__phase">{PHASE_LABELS[take.phase]}</span>
            <span className="take__because">{BECAUSE[take.because]}</span>
          </p>
        </div>

        <Link className="take__go" to={take.href}>
          {take.action} <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}

/** Nothing to do, because there is nothing yet — or because it is all finished. */
export function NoTake({ hasSongs, onNew }: { hasSongs: boolean; onNew: () => void }) {
  return (
    <section className="take take--quiet" aria-labelledby="take-heading">
      <p id="take-heading" className="take__eyebrow">
        Your next take
      </p>

      <div className="take__body">
        <div className="take__words">
          <p className="take__headline">
            {hasSongs ? 'Every song is across the line.' : 'Nothing here yet.'}
          </p>
          <p className="take__because">
            {hasSongs
              ? 'Nothing is waiting on you. Start the next one when you are ready.'
              : 'A song can be a title and a voice memo. Write the title down.'}
          </p>
        </div>

        <button type="button" className="take__go" onClick={onNew}>
          {hasSongs ? 'Start something new' : 'Add your first song'}{' '}
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  );
}
