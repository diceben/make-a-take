import { ThemeToggle } from './ThemeToggle';
import './App.css';

/**
 * Placeholder page for stage 0. It exists so the toolchain, the design tokens
 * and the accessibility checks all have something real to work on — the song
 * list replaces it in stage 3.
 */

const STATUSES = [
  { key: 'todo', symbol: '○', label: 'To do' },
  { key: 'doing', symbol: '◐', label: 'In progress' },
  { key: 'review', symbol: '◑', label: 'Needs review' },
  { key: 'done', symbol: '●', label: 'Done' },
] as const;

export function App() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="app-header">
        <span className="app-header__name">Make a Take</span>
        <ThemeToggle />
      </header>

      <main id="main" className="app-main">
        <h1>Track every recording step of a song.</h1>
        <p className="app-lead">
          From writing to master — one page that tells you where each song actually stands.
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
      </main>
    </>
  );
}
