import './SongList.css';

/**
 * Stage 1 shows the shape of what is coming: the four states a step can be in.
 * Stage 3 replaces this with the real list, read from the database.
 */

const STATUSES = [
  { key: 'todo', symbol: '○', label: 'To do' },
  { key: 'doing', symbol: '◐', label: 'In progress' },
  { key: 'review', symbol: '◑', label: 'Needs review' },
  { key: 'done', symbol: '●', label: 'Done' },
] as const;

export function SongList() {
  return (
    <>
      <h1>Your songs</h1>
      <p className="app-lead">
        Nothing here yet. Adding projects and songs arrives in the next stage.
      </p>

      <h2 className="app-section-title">The four states</h2>
      <ul className="status-legend">
        {STATUSES.map((status) => (
          <li key={status.key} className="status-legend__item">
            <span className="status" data-status={status.key}>
              <span aria-hidden="true">{status.symbol}</span> {status.label}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
