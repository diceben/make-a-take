import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { AccountMenu } from '../account/AccountMenu';
import './Sidebar.css';

/**
 * The permanent left rail.
 *
 * Two of these go somewhere and three do not yet, and the three say so rather
 * than being hidden. A navigation that lists only what is finished tells you
 * nothing about the shape of the thing; one that lists unfinished work as if it
 * were finished wastes a click to find out. Marked plainly, it does neither.
 *
 * "Checklists" is deliberately not among them. The app had a checklist and
 * replaced it with a record of decisions on purpose, and a nav item is a strong
 * claim about what a product is.
 */

const BUILT = [
  { to: '/', label: 'Dashboard', icon: Grid },
  { to: '/songs', label: 'Songs', icon: Waveform },
] as const;

const LATER = ['Templates', 'Notes', 'References'] as const;

export function Sidebar() {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  // On a narrow screen the rail is a drawer, and Escape closes it — the key
  // anything covering the page owes the keyboard.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        opener.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        ref={opener}
        className="rail__opener"
        aria-expanded={open}
        aria-controls="rail"
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        <span className="visually-hidden">{open ? 'Close navigation' : 'Open navigation'}</span>
        <span className="rail__bars" aria-hidden="true" />
      </button>

      <header
        id="rail"
        ref={panel}
        className={open ? 'rail rail--open' : 'rail'}
        data-open={open ? 'true' : 'false'}
      >
        <p className="rail__mark">
          <Waveform className="rail__logo" />
          <span className="rail__name">Make a Take</span>
        </p>

        <nav className="rail__nav" aria-label="Sections">
          <ul className="rail__list">
            {BUILT.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    isActive ? 'rail__link rail__link--on' : 'rail__link'
                  }
                  onClick={() => {
                    setOpen(false);
                  }}
                >
                  <Icon className="rail__icon" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>

          <p className="rail__eyebrow">Not built yet</p>
          <ul className="rail__list">
            {LATER.map((label) => (
              <li key={label}>
                {/* Present and plainly inert. aria-disabled rather than a
                    disabled button: it is not a control that happens to be off,
                    it is a place that does not exist. */}
                <span className="rail__link rail__link--later" aria-disabled="true">
                  <Dot className="rail__icon" />
                  {label}
                </span>
              </li>
            ))}
          </ul>
        </nav>

        <div className="rail__foot">
          <AccountMenu />
        </div>
      </header>

      {open && (
        <button
          type="button"
          className="rail__scrim"
          onClick={() => {
            setOpen(false);
            opener.current?.focus();
          }}
        >
          <span className="visually-hidden">Close navigation</span>
        </button>
      )}
    </>
  );
}

/* Drawn rather than fetched: three glyphs do not justify an icon package, and
   the app makes no external requests. All decorative — every one sits beside
   the word it stands for. */

function Waveform({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 12h2M8 6v12M12 9v6M16 4v16M20 10v4" />
    </svg>
  );
}

function Grid({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function Dot({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  );
}
