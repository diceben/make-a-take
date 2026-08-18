import { useId } from 'react';
import { STATUS_LABELS, STATUS_SYMBOLS, STATUSES, type StepStatus } from '../../lib/model';
import './StatusPicker.css';

/**
 * Real radio inputs, so arrow keys move between the four states and screen
 * readers announce the group and the selection without any extra wiring.
 */
export function StatusPicker({
  labelledBy,
  value,
  disabled = false,
  onChange,
}: {
  /** Id of the visible element naming this step — the group borrows it rather
   *  than repeating the name in a hidden legend, which would be read twice. */
  labelledBy: string;
  value: StepStatus;
  disabled?: boolean;
  onChange: (status: StepStatus) => void;
}) {
  const name = useId();

  return (
    // A fieldset is implicitly a plain group; radiogroup says what it actually is.
    <fieldset
      className="status-picker"
      role="radiogroup"
      aria-labelledby={labelledBy}
      disabled={disabled}
    >
      {STATUSES.map((status) => (
        <label key={status} className="status-picker__option" data-status={status}>
          <input
            type="radio"
            name={name}
            value={status}
            checked={value === status}
            onChange={() => {
              onChange(status);
            }}
          />
          <span aria-hidden="true">{STATUS_SYMBOLS[status]}</span>
          <span className="status-picker__label">{STATUS_LABELS[status]}</span>
        </label>
      ))}
    </fieldset>
  );
}
