import { timeAgo, type Activity } from '../../lib/dashboard';
import { PHASE_LABELS, type PhaseKey } from '../../lib/journey';
import './Panels.css';

/**
 * What has happened lately.
 *
 * Assembled from judgements, notes and closed rounds rather than from a log
 * table — the events already carry their own timestamps, and a second record of
 * them would be free to disagree with the first.
 */
export function RecentActivity({ activity }: { activity: Activity[] }) {
  return (
    <section className="panel" aria-labelledby="activity-heading">
      <h2 id="activity-heading" className="panel__heading">
        Recent activity
      </h2>

      {activity.length === 0 ? (
        <p className="panel__empty">Nothing yet. The first judgement you make appears here.</p>
      ) : (
        <ul className="feed">
          {activity.map((entry) => (
            <li key={entry.id} className="feed__row">
              <span className="feed__mark" data-kind={entry.kind} aria-hidden="true" />
              <span className="feed__text">{entry.text}</span>
              <span className="feed__when">{timeAgo(entry.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const RADIUS = 52;
const STROKE = 14;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Where the songs are, as a ring.
 *
 * The ring is the picture and the list beside it is the content — every segment
 * is named and counted in text, so nothing here is understood only by seeing a
 * colour or by measuring an arc.
 */
export function SongsByStage({ counts }: { counts: { key: PhaseKey; count: number }[] }) {
  const present = counts.filter((one) => one.count > 0);
  const total = present.reduce((sum, one) => sum + one.count, 0);

  // Each segment starts where the ones before it ended, so the offset is a
  // running total of what precedes it rather than a variable being carried.
  const arcs = present.map((entry, index) => ({
    ...entry,
    length: (entry.count / total) * CIRCUMFERENCE,
    offset:
      present.slice(0, index).reduce((sum, one) => sum + one.count, 0) * (CIRCUMFERENCE / total),
  }));

  return (
    <section className="panel" aria-labelledby="stage-heading">
      <h2 id="stage-heading" className="panel__heading">
        Songs by stage
      </h2>

      {total === 0 ? (
        <p className="panel__empty">Nothing to place yet.</p>
      ) : (
        <div className="stages">
          <svg className="stages__ring" viewBox="0 0 140 140" aria-hidden="true" focusable="false">
            <circle
              cx="70"
              cy="70"
              r={RADIUS}
              fill="none"
              stroke="var(--rule-alt)"
              strokeWidth={STROKE}
            />
            {arcs.map((arc) => (
              <circle
                key={arc.key}
                cx="70"
                cy="70"
                r={RADIUS}
                fill="none"
                stroke={`var(--stage-${arc.key})`}
                strokeWidth={STROKE}
                strokeDasharray={`${String(arc.length)} ${String(CIRCUMFERENCE)}`}
                strokeDashoffset={String(-arc.offset)}
                transform="rotate(-90 70 70)"
              />
            ))}
            <text x="70" y="68" className="stages__figure" textAnchor="middle">
              {total}
            </text>
            <text x="70" y="84" className="stages__unit" textAnchor="middle">
              total
            </text>
          </svg>

          <ul className="stages__key">
            {present.map((entry) => (
              <li key={entry.key} className="stages__row">
                <span className="stages__swatch" data-stage={entry.key} aria-hidden="true" />
                <span className="stages__name">{PHASE_LABELS[entry.key]}</span>
                <span className="stages__count">{entry.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * Judgements made this month.
 *
 * Called a decision log and not production credits: credits are a thing in the
 * music business with a settled meaning, and this is not that. It is your own
 * record of calls made.
 *
 * Decisions, never points. Points are awarded by an app for behaviour it
 * approves of; a count of decisions is a fact about the work that the app had no
 * hand in. The bars are the last six months, so the figure has something to be
 * read against — and a quiet month is a quiet month, not a failure.
 */
export function DecisionLog({
  thisMonth,
  months,
}: {
  thisMonth: number;
  months: { label: string; count: number }[];
}) {
  const peak = Math.max(1, ...months.map((one) => one.count));

  return (
    <section className="credits-panel" aria-labelledby="credits-heading">
      <h2 id="credits-heading" className="panel__heading">
        Decision log
      </h2>

      <p className="credits-panel__month">This month</p>
      <p className="credits-panel__figure">
        {thisMonth} <span className="credits-panel__unit">decisions made</span>
      </p>

      <ul className="bars" aria-label="Decisions made, by month">
        {months.map((month) => (
          <li key={month.label} className="bars__col">
            <span
              className="bars__bar"
              style={{ height: `${String(Math.round((month.count / peak) * 100))}%` }}
              aria-hidden="true"
            />
            <span className="bars__label">{month.label}</span>
            <span className="visually-hidden">
              {month.count} {month.count === 1 ? 'decision' : 'decisions'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Nothing at all yet. Says what to do rather than that there is nothing. */
export function EmptyList({ onNew }: { onNew: () => void }) {
  return (
    <div className="blank">
      <p className="blank__lead">No songs yet.</p>
      <p className="blank__note">
        A song can be nothing but a title and a voice memo in your head. Write the title down and
        the seven phases are there waiting.
      </p>
      <button type="button" className="blank__button" onClick={onNew}>
        Add your first song
      </button>
    </div>
  );
}

/** A filter that left nothing standing, with the way out of it. */
export function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div className="blank">
      <p className="blank__lead">Nothing matches that.</p>
      <button type="button" className="blank__button" onClick={onClear}>
        Clear the filters
      </button>
    </div>
  );
}
