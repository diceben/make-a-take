import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import {
  deleteSong,
  getSong,
  setPhaseStatus,
  setSongNotes,
  setSongTitle,
  setTrackStatus,
  setTrackStatuses,
} from '../../lib/data';
import {
  PHASE_LABELS,
  PHASES,
  TRACK_LABELS,
  type SongWithSteps,
  type StepStatus,
} from '../../lib/model';
import { currentPhase, phaseProgress, songProgress, toPercent } from '../../lib/progress';
import { ProgressBar } from './ProgressBar';
import { StatusPicker } from './StatusPicker';
import './SongPage.css';

export function SongPage() {
  const { id } = useParams<{ id: string }>();
  const { client } = useAuth();

  const navigate = useNavigate();

  const [song, setSong] = useState<SongWithSteps | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setSong(await getSong(client, id));
      setState('ready');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load this song.');
      setState('failed');
    }
  }, [client, id]);

  useEffect(() => {
    // The rule flags any call that can reach setState. Here every setState in
    // load() happens after an await, which is the asynchronous pattern the rule
    // is meant to permit — it simply cannot see through the function call.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  /**
   * Status changes apply locally first so the click feels instant, then go to
   * the server. If the write fails the change is rolled back and said out loud —
   * silently keeping a value the database rejected would be worse than a stutter.
   */
  const changeStatus = async (kind: 'phase' | 'track', stepId: string, status: StepStatus) => {
    if (!song) return;
    const previous = song;

    setSong({
      ...song,
      phase_states:
        kind === 'phase'
          ? song.phase_states.map((step) => (step.id === stepId ? { ...step, status } : step))
          : song.phase_states,
      track_states:
        kind === 'track'
          ? song.track_states.map((step) => (step.id === stepId ? { ...step, status } : step))
          : song.track_states,
    });
    setError(null);

    try {
      if (kind === 'phase') await setPhaseStatus(client, stepId, status);
      else await setTrackStatus(client, stepId, status);
    } catch (cause) {
      setSong(previous);
      setError(cause instanceof Error ? cause.message : 'That change was not saved.');
    }
  };

  /**
   * Tracking has no status of its own, so resetting it means resetting all six
   * tracks — in one write, because six that half succeed would leave the phase
   * in a state nobody asked for.
   */
  const resetTracking = async () => {
    if (!song) return;
    const previous = song;
    const ids = song.track_states.map((step) => step.id);

    setSong({
      ...song,
      track_states: song.track_states.map((step) => ({ ...step, status: 'todo' })),
    });
    setError(null);

    try {
      await setTrackStatuses(client, ids, 'todo');
    } catch (cause) {
      setSong(previous);
      setError(cause instanceof Error ? cause.message : 'That change was not saved.');
    }
  };

  if (state === 'loading') return <p role="status">Loading…</p>;

  if (state === 'failed' || !song) {
    return (
      <>
        <p className="error" role="alert">
          {error ?? 'This song could not be found.'}
        </p>
        <Link to="/">Back to your songs</Link>
      </>
    );
  }

  const progress = songProgress(song.phase_states, song.track_states);
  const phase = currentPhase(song.phase_states, song.track_states);

  return (
    <>
      <p className="breadcrumb">
        <Link to="/">← Your songs</Link>
      </p>

      {renaming ? (
        <RenameSong
          title={song.title}
          onCancel={() => {
            setRenaming(false);
          }}
          onSave={async (title) => {
            await setSongTitle(client, song.id, title);
            setSong({ ...song, title: title.trim() });
            setRenaming(false);
          }}
        />
      ) : (
        <div className="song-title">
          <h1>{song.title}</h1>
          <button
            type="button"
            className="song-title__edit"
            aria-label={`Rename ${song.title}`}
            onClick={() => {
              setRenaming(true);
            }}
          >
            Edit
          </button>
        </div>
      )}

      <div className="song-summary">
        <ProgressBar progress={progress} label={`Progress of ${song.title}`} />
        <p className="song-summary__phase">
          {phase ? `Currently in ${PHASE_LABELS[phase]}` : 'Finished'}
        </p>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <h2 className="app-section-title">Phases</h2>
      <ul className="steps">
        {PHASES.map((name) => {
          const step = song.phase_states.find((candidate) => candidate.phase === name);

          if (name === 'tracking') {
            // Tracking has no status of its own — it is the tracks nested below.
            const trackingPercent = toPercent(
              phaseProgress('tracking', song.phase_states, song.track_states),
            );
            const untouched = song.track_states.every((track) => track.status === 'todo');
            return (
              <li key={name} className="steps__group">
                <div className="steps__row steps__row--derived">
                  <span className="steps__name">{PHASE_LABELS[name]}</span>
                  <span className="steps__derived">{trackingPercent}% — from the tracks below</span>
                  <ResetButton
                    step={PHASE_LABELS[name]}
                    disabled={untouched}
                    onClick={() => void resetTracking()}
                  />
                </div>
                <ul className="steps steps--nested">
                  {song.track_states.map((track) => (
                    <li key={track.id} className="steps__row">
                      <span className="steps__name" id={`track-${track.track}`}>
                        {TRACK_LABELS[track.track]}
                      </span>
                      <StatusPicker
                        labelledBy={`track-${track.track}`}
                        value={track.status}
                        onChange={(status) => void changeStatus('track', track.id, status)}
                      />
                    </li>
                  ))}
                </ul>
              </li>
            );
          }

          if (!step) return null;
          return (
            <li key={name} className="steps__row">
              <span className="steps__name" id={`phase-${name}`}>
                {PHASE_LABELS[name]}
              </span>
              <StatusPicker
                labelledBy={`phase-${name}`}
                value={step.status}
                onChange={(status) => void changeStatus('phase', step.id, status)}
              />
              <ResetButton
                step={PHASE_LABELS[name]}
                disabled={step.status === 'todo'}
                onClick={() => void changeStatus('phase', step.id, 'todo')}
              />
            </li>
          );
        })}
      </ul>

      <h2 className="app-section-title">Notes</h2>
      <SongNotes
        song={song}
        onSaved={(notes) => {
          setSong({ ...song, notes });
        }}
      />

      <DeleteSong
        song={song}
        onDeleted={() => {
          void navigate('/');
        }}
      />
    </>
  );
}

/** Renaming the song, in the place its name already is. */
function RenameSong({
  title,
  onCancel,
  onSave,
}: {
  title: string;
  onCancel: () => void;
  onSave: (title: string) => Promise<void>;
}) {
  const [value, setValue] = useState(title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    field.current?.select();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    // A song with no name at all could not be found again in the list.
    if (trimmed === '') return;

    setBusy(true);
    setError(null);
    try {
      await onSave(trimmed);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That title was not saved.');
      setBusy(false);
    }
  };

  return (
    <form className="song-title-form" onSubmit={(event) => void submit(event)}>
      <label htmlFor="song-title" className="visually-hidden">
        Song title
      </label>
      <input
        id="song-title"
        ref={field}
        type="text"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
        }}
      />
      <button type="submit" disabled={busy || value.trim() === ''}>
        {busy ? 'Saving…' : 'Save'}
      </button>
      <button type="button" onClick={onCancel} disabled={busy}>
        Cancel
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

/**
 * Deleting sits at the foot of the page, away from everything used daily, and
 * asks first. The question names what else goes — thirteen rows of state that
 * are easy to forget about while looking at one title.
 */
function DeleteSong({ song, onDeleted }: { song: SongWithSteps; onDeleted: () => void }) {
  const { client } = useAuth();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Focus lands on the way out, not on the irreversible button.
    if (asking) cancel.current?.focus();
  }, [asking]);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteSong(client, song.id);
      onDeleted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That song was not deleted.');
      setBusy(false);
    }
  };

  if (!asking) {
    return (
      <div className="danger">
        <button
          type="button"
          className="danger__button"
          onClick={() => {
            setAsking(true);
          }}
        >
          Delete this song
        </button>
      </div>
    );
  }

  // Escape backs out from either button, which is where focus can be while the
  // question is up. It hangs off the buttons rather than the panel around them,
  // because a div that listens for keys is a control nothing can reach.
  const escapes = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape' && !busy) setAsking(false);
  };

  return (
    <div className="danger">
      <p className="danger__question" role="alert">
        Delete <strong>{song.title}</strong>? Its seven phases and six tracks go with it. This
        cannot be undone.
      </p>
      <div className="danger__actions">
        <button
          type="button"
          ref={cancel}
          disabled={busy}
          onKeyDown={escapes}
          onClick={() => {
            setAsking(false);
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          className="danger__button"
          disabled={busy}
          onKeyDown={escapes}
          onClick={() => void remove()}
        >
          {busy ? 'Deleting…' : `Delete ${song.title}`}
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Back to the start for one phase. The status picker can already do this with
 * its "To do" option; this is the one-click way out of a phase that was carried
 * too far, and for tracking it is the only way, since tracking has no picker.
 *
 * Disabled when there is nothing to undo, so the button never lies about having
 * done something.
 */
function ResetButton({
  step,
  disabled,
  onClick,
}: {
  step: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    // The name says which step, because "Reset" seven times over tells a screen
    // reader nothing. It still starts with the visible word, so saying "reset"
    // to a voice control matches it.
    <button
      type="button"
      className="steps__reset"
      aria-label={`Reset ${step}`}
      disabled={disabled}
      onClick={onClick}
    >
      Reset
    </button>
  );
}

/**
 * Notes save when the field loses focus rather than on every keystroke — one
 * request per thought instead of one per letter.
 */
function SongNotes({ song, onSaved }: { song: SongWithSteps; onSaved: (notes: string) => void }) {
  const { client } = useAuth();
  const [value, setValue] = useState(song.notes);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const saved = useRef(song.notes);

  const save = async () => {
    if (value === saved.current) return;
    setStatus('saving');
    try {
      await setSongNotes(client, song.id, value);
      saved.current = value;
      onSaved(value);
      setStatus('saved');
    } catch {
      setStatus('failed');
    }
  };

  return (
    <div className="notes">
      <label htmlFor="song-notes" className="visually-hidden">
        Notes about {song.title}
      </label>
      <textarea
        id="song-notes"
        rows={4}
        value={value}
        placeholder="Snare needs another take, timing around bar 32…"
        onChange={(event) => {
          setValue(event.target.value);
          setStatus('idle');
        }}
        onBlur={() => void save()}
      />
      <p className="notes__status" role="status">
        {status === 'saving' && 'Saving…'}
        {status === 'saved' && 'Saved.'}
        {status === 'failed' && 'Could not save that note.'}
      </p>
    </div>
  );
}
