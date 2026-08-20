import type { Summary } from '../../lib/dashboard';
import type { SongFilter } from './filters';
import './SummaryCards.css';

/**
 * The four figures, and the four filters they stand for.
 *
 * Each card is a button, because each one is a question with an answer further
 * down the page: "two need a take" is only useful if pressing it shows you
 * which two. A figure you cannot act on is decoration.
 *
 * The words are deliberately not project management. "Needs attention" is what
 * a ticket says; "needs a take" is what the work is. And nothing finished is not
 * a neutral zero — it is the thing this app exists to change, so it says so
 * once, quietly, and then leaves it alone.
 */
export function SummaryCards({
  summary,
  filter,
  onFilter,
}: {
  summary: Summary;
  filter: SongFilter;
  onFilter: (next: SongFilter) => void;
}) {
  const cards: { key: SongFilter; label: string; figure: number; under: string }[] = [
    {
      key: 'all',
      label: 'Songs',
      figure: summary.active,
      under:
        summary.archived === 0
          ? 'On the go'
          : summary.archived === 1
            ? '1 set aside'
            : `${String(summary.archived)} set aside`,
    },
    {
      key: 'in-progress',
      label: 'In the works',
      figure: summary.inProgress,
      under: 'Under way right now',
    },
    {
      key: 'needs-attention',
      label: 'Needs a take',
      figure: summary.needsAttention,
      under: 'Heard it, not convinced',
    },
    {
      key: 'completed',
      label: 'Finished',
      figure: summary.completed,
      under:
        summary.completed === 0
          ? summary.active === 0
            ? 'Nothing yet'
            : 'None across the line yet'
          : 'Across the line',
    },
  ];

  return (
    <ul className="tiles">
      {cards.map((card) => (
        <li key={card.key}>
          <button
            type="button"
            className="tile"
            data-kind={card.key}
            aria-pressed={filter === card.key}
            onClick={() => {
              onFilter(card.key);
            }}
          >
            <span className="tile__label">{card.label}</span>
            <span className="tile__figure">{card.figure}</span>
            <span className="tile__under">{card.under}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
