import { useState, type FormEvent } from 'react';
import {
  PHASE_KEYS,
  PHASE_LABELS,
  notesWaitingIn,
  type Note,
  type PhaseKey,
} from '../../lib/journey';
import './PhaseNotes.css';

/**
 * Notes, and where they are going.
 *
 * The third defect in the old model: a note written while tracking — "snare
 * needs another round" — is wanted in the mix, and lived at the foot of the page
 * where nobody in the mix would look. A note now names the phase it is for, and
 * appears there and nowhere else.
 */
export function WaitingNotes({
  phase,
  notes,
  onResolve,
}: {
  phase: PhaseKey;
  notes: Note[];
  onResolve: (id: string) => void;
}) {
  const waiting = notesWaitingIn(notes, phase);
  if (waiting.length === 0) return null;

  return (
    <section className="waiting" aria-labelledby="waiting-heading">
      <h2 className="waiting__heading" id="waiting-heading">
        Waiting for you in {PHASE_LABELS[phase]}
      </h2>

      <ul className="waiting__list">
        {waiting.map((note) => (
          <li key={note.id} className="waiting__item">
            <p className="waiting__text">{note.body}</p>
            <p className="waiting__meta">
              <span>
                {PHASE_LABELS[note.origin_phase].toLowerCase()} ·{' '}
                {new Date(note.created_at).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                })}
              </span>
              <button
                type="button"
                className="waiting__done"
                onClick={() => {
                  onResolve(note.id);
                }}
              >
                Done with it
              </button>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Writing one. The target defaults to the phase being worked in — most notes are
 * about what is in front of you — and the other choices are the later phases and
 * the next song.
 */
export function AddNote({
  phase,
  onAdd,
}: {
  phase: PhaseKey;
  onAdd: (body: string, target: PhaseKey | null, forNextSong: boolean) => Promise<void>;
}) {
  const [body, setBody] = useState('');
  const [target, setTarget] = useState<string>('now');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (body.trim() === '') return;

    setBusy(true);
    setError(null);
    try {
      await onAdd(
        body,
        target === 'now' || target === 'next_song' ? null : (target as PhaseKey),
        target === 'next_song',
      );
      setBody('');
      setTarget('now');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That note was not saved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="note-form" onSubmit={(event) => void submit(event)}>
      <label className="visually-hidden" htmlFor="note-body">
        Note
      </label>
      <input
        id="note-body"
        type="text"
        placeholder="Note — snare needs another round"
        value={body}
        onChange={(event) => {
          setBody(event.target.value);
        }}
      />

      <label className="note-form__target">
        <span className="visually-hidden">Where the note is wanted</span>
        <select
          value={target}
          onChange={(event) => {
            setTarget(event.target.value);
          }}
        >
          <option value="now">Now, in {PHASE_LABELS[phase]}</option>
          {PHASE_KEYS.filter((key) => key !== phase).map((key) => (
            <option key={key} value={key}>
              In {PHASE_LABELS[key]}
            </option>
          ))}
          <option value="next_song">Next song</option>
        </select>
      </label>

      <button type="submit" disabled={busy || body.trim() === ''}>
        {busy ? 'Saving…' : 'Keep it'}
      </button>

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
