import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ArtistField } from '../songs/ArtistField';
import './NewSongModal.css';

export type NewSong = { title: string; artist: string; genre: string; bpm: string; key: string };

/**
 * Writing down a new song.
 *
 * Only the title is required. Everything else about a song is settled later than
 * the fact that it exists, and a form that insisted on a tempo would be asking
 * for a number to be invented — which is worse than an empty field, because an
 * invented number looks like information.
 *
 * A dialog rather than a page: it is a short interruption you come straight back
 * from, and the list behind it is the context for what you are typing.
 */
export function NewSongModal({
  known,
  onClose,
  onCreate,
}: {
  known: string[];
  onClose: () => void;
  onCreate: (song: NewSong) => Promise<void>;
}) {
  const id = useId();
  const [song, setSong] = useState<NewSong>({
    title: '',
    artist: '',
    genre: '',
    bpm: '',
    key: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
  }, []);

  // Escape closes, and Tab stays inside. Both are what anything covering the
  // page owes the keyboard; without them the focus wanders behind the dialog
  // and there is no way back except the mouse.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || box.current === null) return;

      const focusable = box.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input, [href], [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [busy, onClose]);

  const set = (field: keyof NewSong) => (value: string) => {
    setSong((current) => ({ ...current, [field]: value }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (song.title.trim() === '') return;

    setBusy(true);
    setError(null);
    try {
      await onCreate(song);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That song was not saved.');
      setBusy(false);
    }
  };

  return (
    <div className="modal">
      <button
        type="button"
        className="modal__scrim"
        disabled={busy}
        onClick={onClose}
        tabIndex={-1}
        aria-hidden="true"
      />

      <div
        className="modal__box"
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
      >
        <h2 id={`${id}-title`} className="modal__heading">
          New song
        </h2>
        <p className="modal__lead">Only the title is needed. The rest can wait.</p>

        <form className="modal__form" onSubmit={(event) => void submit(event)}>
          <label className="modal__field">
            <span className="modal__label">Title</span>
            <input
              ref={first}
              type="text"
              value={song.title}
              placeholder="Midnight Drive"
              onChange={(event) => {
                set('title')(event.target.value);
              }}
            />
          </label>

          <ArtistField
            label="Artist"
            placeholder="Artist (optional)"
            value={song.artist}
            known={known}
            onChange={set('artist')}
          />

          <div className="modal__row">
            <label className="modal__field">
              <span className="modal__label">Genre</span>
              <input
                type="text"
                value={song.genre}
                placeholder="Indie"
                onChange={(event) => {
                  set('genre')(event.target.value);
                }}
              />
            </label>

            <label className="modal__field modal__field--narrow">
              <span className="modal__label">BPM</span>
              <input
                type="number"
                min={20}
                max={400}
                value={song.bpm}
                placeholder="120"
                onChange={(event) => {
                  set('bpm')(event.target.value);
                }}
              />
            </label>

            <label className="modal__field modal__field--narrow">
              <span className="modal__label">Key</span>
              <input
                type="text"
                value={song.key}
                placeholder="A minor"
                onChange={(event) => {
                  set('key')(event.target.value);
                }}
              />
            </label>
          </div>

          {error !== null && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          <div className="modal__actions">
            <button type="button" className="modal__cancel" disabled={busy} onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="modal__create"
              disabled={busy || song.title.trim() === ''}
            >
              {busy ? 'Saving…' : 'Create song'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
