import { useId, useState, type FormEvent } from 'react';
import { useAuth } from './auth-context';
import { checkEmail, checkPassword, describeProblem, MIN_PASSWORD_LENGTH } from './credentials';
import './SignInForm.css';

type Mode = 'sign-in' | 'sign-up';

export function SignInForm() {
  const auth = useAuth();
  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();

  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    const problem = checkEmail(email) ?? checkPassword(password);
    if (problem) {
      setMessage({ tone: 'error', text: describeProblem(problem) });
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      if (mode === 'sign-in') {
        await auth.signIn(email, password);
      } else {
        const { needsConfirmation } = await auth.signUp(email, password);
        if (needsConfirmation) {
          setMessage({
            tone: 'info',
            text: 'Check your inbox — follow the link to finish creating the account.',
          });
        }
      }
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Something went wrong. Try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="sign-in" onSubmit={(event) => void submit(event)} noValidate>
      <h1>{mode === 'sign-in' ? 'Sign in' : 'Create an account'}</h1>

      <div className="sign-in__field">
        <label htmlFor={emailId}>Email</label>
        <input
          id={emailId}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <div className="sign-in__field">
        <label htmlFor={passwordId}>Password</label>
        <input
          id={passwordId}
          type="password"
          autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-describedby={mode === 'sign-up' ? `${passwordId}-hint` : undefined}
        />
        {mode === 'sign-up' && (
          <p id={`${passwordId}-hint`} className="sign-in__hint">
            At least {MIN_PASSWORD_LENGTH} characters.
          </p>
        )}
      </div>

      {/* Announced to screen readers as soon as it appears. */}
      <p
        id={errorId}
        className={`sign-in__message sign-in__message--${message?.tone ?? 'none'}`}
        role="status"
      >
        {message?.text ?? ''}
      </p>

      <button type="submit" className="sign-in__submit" disabled={busy}>
        {busy ? 'Working…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
      </button>

      <button
        type="button"
        className="sign-in__switch"
        onClick={() => {
          setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
          setMessage(null);
        }}
      >
        {mode === 'sign-in' ? 'No account yet? Create one' : 'Already have an account? Sign in'}
      </button>
    </form>
  );
}
