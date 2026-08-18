import { toPercent } from '../../lib/progress';
import './ProgressBar.css';

/**
 * The bar is decorative; the number beside it carries the same information for
 * anyone who cannot see the fill.
 */
export function ProgressBar({ progress, label }: { progress: number; label: string }) {
  const percent = toPercent(progress);

  return (
    <div className="progress">
      <div
        className="progress__track"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="progress__fill" style={{ width: `${String(percent)}%` }} />
      </div>
      <span className="progress__value">{percent}%</span>
    </div>
  );
}
