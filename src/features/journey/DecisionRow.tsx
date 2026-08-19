import { useState } from 'react';
import { heardOnce, type Decision, type DecisionState } from '../../lib/journey';
import { StateRing } from './StateRing';
import { StatePicker } from './StatePicker';
import './DecisionRow.css';

/**
 * One decision: the ring, what it is, and the judgement.
 *
 * Steps live underneath, behind a disclosure, and they are checkboxes because
 * they are checkable — two people listening separately would agree on whether
 * the vocal is comped. The judgement is a scale because they would not agree on
 * whether it sits in the mix. Nothing here is ever both.
 */
export function DecisionRow({
  decision,
  siblings,
  readOnly = false,
  onJudge,
  onStep,
}: {
  decision: Decision;
  siblings: Decision[];
  readOnly?: boolean;
  onJudge: (state: DecisionState) => void;
  onStep: (stepId: string, done: boolean) => void;
}) {
  const [showSteps, setShowSteps] = useState(false);
  const steps = [...decision.steps].sort((a, b) => a.position - b.position);
  const done = steps.filter((step) => step.done).length;

  return (
    <li className="decision">
      <div className="decision__row">
        <StateRing state={decision.state} />

        <div className="decision__main">
          <p className="decision__title">
            {decision.title}
            {heardOnce(decision) && (
              // Passive on purpose: a marker, not a notification, not a lock.
              <span className="decision__heard">heard once</span>
            )}
          </p>

          {(decision.subtitle !== null || steps.length > 0) && (
            <p className="decision__sub">
              {decision.subtitle}
              {decision.subtitle !== null && steps.length > 0 && ' · '}
              {steps.length > 0 && (
                <button
                  type="button"
                  className="decision__steps-toggle"
                  aria-expanded={showSteps}
                  onClick={() => {
                    setShowSteps((current) => !current);
                  }}
                >
                  {done} of {steps.length} steps
                </button>
              )}
            </p>
          )}
        </div>

        <StatePicker
          decision={decision}
          siblings={siblings}
          disabled={readOnly}
          onChoose={onJudge}
        />
      </div>

      {showSteps && steps.length > 0 && (
        <ul className="decision__steps">
          {steps.map((step) => (
            <li key={step.id}>
              <label className="decision__step">
                <input
                  type="checkbox"
                  checked={step.done}
                  disabled={readOnly}
                  onChange={(event) => {
                    onStep(step.id, event.target.checked);
                  }}
                />
                <span>{step.label}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
