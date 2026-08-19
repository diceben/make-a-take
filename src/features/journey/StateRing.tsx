import type { DecisionState } from '../../lib/journey';
import './StateRing.css';

/**
 * The ring shows the **stage**, never the count of finished steps.
 *
 * A full ring beside the words NOT QUITE THERE reads as a fault. The five stages
 * are themselves the axis of progress, so that is what the ring draws — in five
 * fixed positions and no values between them. A smooth curve would claim a
 * continuous measurement that does not exist.
 *
 * It is aria-hidden. The meaning is carried by the badge word; this only makes
 * the list quicker to scan.
 */

const RADIUS = 8.5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS; // 53.41

const FILL: Record<DecisionState, number> = {
  not_touched: 0,
  direction_set: 0.25,
  not_quite_there: 0.5,
  feels_right: 0.75,
  locked: 1,
};

export function StateRing({ state }: { state: DecisionState }) {
  const fraction = FILL[state];

  return (
    <svg
      className="ring"
      width="22"
      height="22"
      viewBox="0 0 22 22"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="11"
        cy="11"
        r={RADIUS}
        fill="none"
        strokeWidth="2"
        className={state === 'locked' ? 'ring__track ring__track--locked' : 'ring__track'}
      />

      {/* At the end the arc goes and the circle is simply whole, with the tick
          that only ever appears here. */}
      {state === 'locked' ? (
        <path
          d="M7.2 11.2 L9.9 13.9 L14.8 8.6"
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="ring__tick"
        />
      ) : (
        fraction > 0 && (
          <circle
            cx="11"
            cy="11"
            r={RADIUS}
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            // From twelve o'clock, clockwise.
            transform="rotate(-90 11 11)"
            strokeDasharray={`${(CIRCUMFERENCE * fraction).toFixed(2)} ${CIRCUMFERENCE.toFixed(2)}`}
            className="ring__fill"
            data-state={state}
          />
        )
      )}
    </svg>
  );
}
