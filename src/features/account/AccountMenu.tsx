import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/auth-context';
import { getProfile, setDisplayName } from '../../lib/data';
import './AccountMenu.css';

/**
 * The account corner: who you are, what the app calls itself, and the two
 * settings there are.
 *
 * Built as a disclosure — a button with aria-expanded controlling a panel of
 * ordinary controls — rather than a true ARIA menu. A menu widget owes the
 * keyboard its own roving focus, typeahead and wrap-around; a panel of buttons
 * owes it nothing beyond tab, which the browser already does correctly.
 */
export function AccountMenu() {
  const auth = useAuth();
  const email = auth.status === 'signed-in' ? (auth.session.user.email ?? '') : '';
  const userId = auth.status === 'signed-in' ? auth.session.user.id : null;

  const [open, setOpen] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const corner = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    button.current?.focus();
  }, []);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    // A profile that cannot be read is not worth an error in the corner of the
    // screen: the menu falls back to the email address, which is always there.
    void getProfile(auth.client, userId)
      .then((profile) => {
        if (active) setName(profile?.display_name ?? null);
      })
      .catch(() => null);

    return () => {
      active = false;
    };
  }, [auth.client, userId]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (corner.current && !corner.current.contains(event.target as Node)) setOpen(false);
    };

    // On the document rather than on the panel: Escape should close it from
    // wherever the focus happens to be, and a div that listens for keys is a
    // control nothing can tab to.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  return (
    <div className="account" ref={corner}>
      <button
        type="button"
        ref={button}
        className="account__avatar"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Account: ${name ?? email}`}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        <span aria-hidden="true">{initials(name, email)}</span>
      </button>

      {open && (
        <div className="account__panel">
          <p className="account__who">
            <span className="account__name">{name ?? email}</span>
            {name !== null && <span className="account__email">{email}</span>}
          </p>

          <DisplayNameField
            value={name ?? ''}
            onSave={async (next) => {
              if (!userId) return;
              setName(await setDisplayName(auth.client, userId, next));
            }}
          />

          <div className="account__about">
            <p>Make a Take — every recording step of a song, from writing to master.</p>
            <p className="account__version">Version {__APP_VERSION__}</p>
          </div>

          <button type="button" className="account__signout" onClick={() => void auth.signOut()}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/** Up to two letters, from the name if there is one and the address if not. */
function initials(name: string | null, email: string): string {
  const source = name?.trim() ?? '';
  if (source !== '') {
    const words = source.split(/\s+/).slice(0, 2);
    return words
      .map((word) => [...word][0] ?? '')
      .join('')
      .toUpperCase();
  }
  return [...(email.split('@')[0] ?? '?')][0]?.toUpperCase() ?? '?';
}

/** The one setting the database actually has a column for. */
function DisplayNameField({
  value,
  onSave,
}: {
  value: string;
  onSave: (value: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (draft.trim() === value.trim()) return;
    setState('saving');
    try {
      await onSave(draft);
      setState('saved');
    } catch {
      setState('failed');
    }
  };

  return (
    <form className="account__field" onSubmit={(event) => void submit(event)}>
      <label htmlFor="display-name">Display name</label>
      <div className="account__field-row">
        <input
          id="display-name"
          type="text"
          placeholder="Not set"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setState('idle');
          }}
        />
        <button type="submit" disabled={state === 'saving' || draft.trim() === value.trim()}>
          Save
        </button>
      </div>
      <p className="account__status" role="status">
        {state === 'saving' && 'Saving…'}
        {state === 'saved' && 'Saved.'}
        {state === 'failed' && 'That name was not saved.'}
      </p>
    </form>
  );
}
