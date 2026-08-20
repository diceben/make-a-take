import { PHASE_LABELS, type Decision, type PhaseKey } from '../../lib/journey';
import type { Call } from './calls';
import './CheckDecisions.css';

const CALLS: { call: Call; label: string; blurb: string }[] = [
  { call: 'keep', label: 'Keep', blurb: 'It stays as it is' },
  { call: 'rework', label: 'Rework', blurb: 'Come back to it' },
  { call: 'unsure', label: 'Not sure', blurb: 'Leave it for now' },
];

/**
 * The check, as the thing it is meant to be: a sitting where you listen back and
 * make calls.
 *
 * The five stages are the right vocabulary while you are working — they describe
 * where a decision stands. They are the wrong vocabulary at a checkpoint, where
 * the question is not "how far along is this" but "am I done with it". So this
 * screen asks three things instead, and nothing else:
 *
 *   Keep       lock it, move on
 *   Rework     it is not right, and you know it
 *   Not sure   leave it exactly as it is
 *
 * Nothing is written while you go down the list. The calls gather, and one
 * button commits them — because the point of a checkpoint is the sitting, and a
 * screen that saved after every click would turn it back into a list of toggles.
 */
export function CheckDecisions({
  phase,
  decisions,
  made,
  busy,
  onCall,
  onCommit,
}: {
  phase: PhaseKey;
  /** Everything in the round, locked ones included — they are the ground you stand on. */
  decisions: Decision[];
  /** The calls gathered so far, by decision id. */
  made: Record<string, Call>;
  busy: boolean;
  onCall: (decisionId: string, call: Call) => void;
  onCommit: () => void;
}) {
  const open = decisions.filter((decision) => decision.state !== 'locked');
  const settled = decisions.filter((decision) => decision.state === 'locked');
  const keeping = Object.values(made).filter((call) => call === 'keep').length;
  const reworking = Object.values(made).filter((call) => call === 'rework').length;
  const anything = keeping + reworking > 0;

  return (
    <>
      <p className="calls__lead">
        You have made {settled.length === 1 ? '1 decision' : `${String(settled.length)} decisions`}{' '}
        in {PHASE_LABELS[phase].toLowerCase()} so far. Listen back to the song, then decide.
      </p>

      <ul className="calls" aria-label="Decisions to call">
        {open.map((decision) => (
          <li key={decision.id} className="calls__row">
            <div className="calls__what">
              <p className="calls__title">{decision.title}</p>
              {decision.subtitle !== null && <p className="calls__sub">{decision.subtitle}</p>}
            </div>

            <div
              className="calls__options"
              role="group"
              aria-label={`Your call on ${decision.title}`}
            >
              {CALLS.map((option) => (
                <button
                  key={option.call}
                  type="button"
                  className="calls__option"
                  data-call={option.call}
                  aria-pressed={made[decision.id] === option.call}
                  disabled={busy}
                  onClick={() => {
                    onCall(decision.id, option.call);
                  }}
                >
                  <span className="calls__label">{option.label}</span>
                  <span className="calls__blurb">{option.blurb}</span>
                </button>
              ))}
            </div>
          </li>
        ))}

        {settled.map((decision) => (
          <li key={decision.id} className="calls__row calls__row--done">
            <div className="calls__what">
              <p className="calls__title">{decision.title}</p>
            </div>
            {/* Already locked, and not offered again. Going back to a locked
                decision is reopening the phase, which is a bigger act than a
                button in a list. */}
            <p className="calls__locked">Locked</p>
          </li>
        ))}
      </ul>

      <div className="calls__commit">
        <button
          type="button"
          className="calls__button"
          disabled={busy || !anything}
          onClick={onCommit}
        >
          {busy ? 'Saving…' : commitWords(keeping, reworking)}
        </button>
        <p className="calls__fine">
          Nothing is saved until you press this. &ldquo;Not sure&rdquo; leaves a decision exactly as
          it is — it is a way of moving past something, not a state it goes into.
        </p>
      </div>
    </>
  );
}

/** The button says what it will do, in the numbers it will do it to. */
function commitWords(keeping: number, reworking: number): string {
  if (keeping > 0 && reworking > 0) {
    return `Lock ${String(keeping)}, send ${String(reworking)} back`;
  }
  if (keeping > 0) return keeping === 1 ? 'Lock 1 decision' : `Lock ${String(keeping)} decisions`;
  if (reworking > 0) {
    return reworking === 1 ? 'Send 1 back' : `Send ${String(reworking)} back`;
  }
  return 'Make a call first';
}
