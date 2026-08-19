import { useState } from 'react';
import { STATUS_LABELS, STATUS_SYMBOLS, STATUSES, type StepStatus } from '../../lib/model';
import './StatusStepper.css';

/**
 * One control per step instead of four.
 *
 * The four states are a sequence, not a menu — writing goes to in progress goes
 * to needs review goes to done — and picking one of four small targets on
 * thirteen rows meant fifty-two chances to hit the wrong one. The whole row is
 * the target now, and pressing it moves the step on. It wraps, so nothing is
 * more than three presses away.
 *
 * Arrow keys step in either direction, which is what a cycling button otherwise
 * takes away: without them the only way back from done is all the way round.
 */

const at = (index: number): StepStatus => STATUSES[index % STATUSES.length] ?? 'todo';

const nextOf = (status: StepStatus) => at(STATUSES.indexOf(status) + 1);
const backOf = (status: StepStatus) => at(STATUSES.indexOf(status) + STATUSES.length - 1);

export function StatusStepper({
  step,
  value,
  disabled = false,
  onChange,
}: {
  /** The name of the phase or track, so the button says what it is about. */
  step: string;
  value: StepStatus;
  disabled?: boolean;
  onChange: (status: StepStatus) => void;
}) {
  // Counting presses rather than watching the value: the sweep belongs to the
  // press. Keyed off the value it would also play once for every row on load.
  const [presses, setPresses] = useState(0);

  const move = (status: StepStatus) => {
    setPresses((count) => count + 1);
    onChange(status);
  };

  return (
    <button
      type="button"
      className="stepper"
      data-status={value}
      disabled={disabled}
      aria-label={`${step}: ${STATUS_LABELS[value]}. Next: ${STATUS_LABELS[nextOf(value)]}`}
      onClick={() => {
        move(nextOf(value));
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault();
          move(backOf(value));
        } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault();
          move(nextOf(value));
        }
      }}
    >
      {presses > 0 && <span key={presses} className="stepper__sweep" aria-hidden="true" />}
      <span className="stepper__symbol" aria-hidden="true">
        {STATUS_SYMBOLS[value]}
      </span>
      <span className="stepper__label">{STATUS_LABELS[value]}</span>
    </button>
  );
}
