import { useState } from 'react';
import { toPercent } from '../../lib/progress';
import './ProgressBar.css';

/**
 * The bar is decorative; the number beside it carries the same information for
 * anyone who cannot see the fill.
 *
 * A step forward flashes across the bar once. The weights are the point of this
 * app — mixing moves it four times as far as mastering — and that was true but
 * invisible while the bar just slid.
 */
export function ProgressBar({ progress, label }: { progress: number; label: string }) {
  const percent = toPercent(progress);

  // Adjusting state during render rather than in an effect: the pulse is a
  // function of the value changing, and an effect would fire a render later.
  const [previous, setPrevious] = useState(percent);
  const [pulses, setPulses] = useState(0);

  if (percent !== previous) {
    setPrevious(percent);
    // Only forwards. Undoing something is not an achievement.
    if (percent > previous) setPulses((count) => count + 1);
  }

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
        {pulses > 0 && <span key={pulses} className="progress__pulse" aria-hidden="true" />}
      </div>
      <span className="progress__value">{percent}%</span>
    </div>
  );
}
