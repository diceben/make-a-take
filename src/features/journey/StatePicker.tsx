import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import {
  STATES,
  STATE_DEFINITIONS,
  STATE_LABELS,
  sameSessionCount,
  type Decision,
  type DecisionState,
} from '../../lib/journey';
import './StatePicker.css';

/**
 * The badge, and the popover that sets it.
 *
 * Opens on click and never on hover, because it writes. Hovering a row on the
 * way to another one would otherwise put a judgement on screen ready to be
 * changed by a stray keystroke.
 *
 * It holds five stages and a footer, and nothing else. Deleting, moving and
 * writing a note belong to the row, not here: a menu that changes what a thing
 * *is* should not also be where it is thrown away.
 */
export function StatePicker({
  decision,
  siblings,
  disabled = false,
  onChoose,
}: {
  decision: Decision;
  /** The other decisions in this round, for counting one stretch of work. */
  siblings: Decision[];
  disabled?: boolean;
  onChoose: (state: DecisionState) => void;
}) {
  const id = useId();
  const listId = `${id}-states`;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const badge = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const close = () => {
    setOpen(false);
    badge.current?.focus();
  };

  const choose = (state: DecisionState) => {
    onChoose(state);
    close();
  };

  // Opening is what sets the highlight, so it happens where the opening does
  // rather than in an effect watching a boolean.
  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setActive(STATES.indexOf(decision.state));
    setOpen(true);
  };

  useEffect(() => {
    // The listbox itself takes focus and moves aria-activedescendant, rather
    // than moving focus between the options.
    if (open) list.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!badge.current?.contains(target) && !list.current?.parentElement?.contains(target)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  const onKeyDown = (event: KeyboardEvent) => {
    // Straight there: the five stages are a short, fixed, ordered list, which is
    // exactly what number keys are for.
    const digit = Number.parseInt(event.key, 10);
    if (digit >= 1 && digit <= STATES.length) {
      event.preventDefault();
      choose(STATES[digit - 1] as DecisionState);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => Math.min(current + 1, STATES.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActive(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActive(STATES.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(STATES[active] as DecisionState);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') {
      // Nothing behind the popover is reachable while it is open.
      event.preventDefault();
    }
  };

  return (
    <div className="picker">
      <button
        type="button"
        ref={badge}
        className="badge"
        data-state={decision.state}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${decision.title}: ${STATE_LABELS[decision.state]}`}
        onClick={toggle}
      >
        {STATE_LABELS[decision.state]}
      </button>

      {open && (
        <div className="picker__popover">
          <ul
            id={listId}
            ref={list}
            role="listbox"
            tabIndex={-1}
            aria-label={`Judgement for ${decision.title}`}
            aria-activedescendant={`${listId}-${String(active)}`}
            className="picker__list"
            onKeyDown={onKeyDown}
          >
            {STATES.map((state, index) => (
              <li
                key={state}
                id={`${listId}-${String(index)}`}
                role="option"
                aria-selected={state === decision.state}
                data-state={state}
                className={
                  index === active ? 'picker__option picker__option--active' : 'picker__option'
                }
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(state);
                }}
              >
                <span className="picker__top">
                  <span className="picker__dot" data-state={state} aria-hidden="true" />
                  <span className="picker__label">{STATE_LABELS[state]}</span>
                  {state === decision.state && (
                    <span className="picker__tick" aria-hidden="true">
                      ✓
                    </span>
                  )}
                </span>
                {/* The definition is the stage. The label is only the handle,
                    which is why the two never appear apart. */}
                <span className="picker__definition">{STATE_DEFINITIONS[state]}</span>
              </li>
            ))}
          </ul>

          <p
            className={
              confirmed(decision) ? 'picker__foot picker__foot--confirmed' : 'picker__foot'
            }
          >
            {footer(decision, siblings)}
          </p>
        </div>
      )}
    </div>
  );
}

function confirmed(decision: Decision): boolean {
  return decision.state_confirmed_at !== null;
}

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/**
 * When it was set, and whether it has been met a second time. A statement, not
 * a warning — no icon, no colour until there is something to confirm.
 */
function footer(decision: Decision, siblings: Decision[]): string {
  if (decision.state_set_at === null) return 'Not set yet';

  if (decision.state_confirmed_at !== null) {
    return `Set ${day(decision.state_set_at)} · confirmed ${day(decision.state_confirmed_at)}`;
  }

  const others = sameSessionCount(siblings, decision);
  const set = `Set ${day(decision.state_set_at)}, ${time(decision.state_set_at)}`;
  if (others === 0) return set;
  return `${set} · same session as ${String(others)} other${others === 1 ? '' : 's'}`;
}
