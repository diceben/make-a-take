import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ArtistField } from '../songs/ArtistField';
import './NewSongModal.css';

export type NewSong = { title: string; artist: string; genre: string; bpm: string; key: string };

type Mode = 'song' | 'idea';

/**
 * Writing down a new song — or an idea, which is not the same thing.
 *
 * Two modes, because two situations. Sometimes you know the song: it has a
 * title, a tempo, a key, and writing them down is just admin. Sometimes there is
 * only a shape in your head at two in the morning, and being asked for a key is
 * being asked to invent one. An invented number is worse than an empty field,
 * because it looks like information.
 *
 * So IDEA asks for as little as it can — nothing at all, if you have nothing —
 * and SONG asks for what you have. The same row lands in the database either
 * way; the difference is entirely in what the form has the nerve to demand.
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
  const [mode, setMode] = useState<Mode>('song');
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
    // An idea may genuinely have no name yet. Refusing to record it until it
    // does is the app deciding an idea is not real until it is labelled.
    const titled =
      song.title.trim() === ''
        ? { ...song, title: 'Untitled idea' }
        : { ...song, title: song.title };
    if (mode === 'song' && titled.title.trim() === '') return;

    setBusy(true);
    setError(null);
    try {
      await onCreate(mode === 'idea' ? { ...titled, genre: '', bpm: '', key: '' } : titled);
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
          What are we making?
        </h2>

        <div className="modal__modes" role="group" aria-label="What are we making?">
          <button
            type="button"
            className="modal__mode"
            aria-pressed={mode === 'song'}
            onClick={() => {
              setMode('song');
            }}
          >
            <span className="modal__mode-label">Song</span>
            <span className="modal__mode-blurb">I know what this is</span>
          </button>
          <button
            type="button"
            className="modal__mode"
            aria-pressed={mode === 'idea'}
            onClick={() => {
              setMode('idea');
            }}
          >
            <span className="modal__mode-label">Idea</span>
            <span className="modal__mode-blurb">Just catching it</span>
          </button>
        </div>

        <form className="modal__form" onSubmit={(event) => void submit(event)}>
          <label className="modal__field">
            <span className="modal__label">{mode === 'idea' ? 'Call it something' : 'Title'}</span>
            <input
              ref={first}
              type="text"
              value={song.title}
              placeholder={mode === 'idea' ? 'Untitled idea' : 'Midnight Drive'}
              onChange={(event) => {
                set('title')(event.target.value);
              }}
            />
          </label>

          {mode === 'idea' ? (
            <p className="modal__idea">
              That is all it needs. Tempo, key and the rest can arrive when they arrive — and the
              seven phases are waiting either way.
            </p>
          ) : (
            <>
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
            </>
          )}

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
              disabled={busy || (mode === 'song' && song.title.trim() === '')}
            >
              {busy ? 'Saving…' : mode === 'idea' ? 'Catch it' : 'Create song'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
