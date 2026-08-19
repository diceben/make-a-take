import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { isConfigured } from './lib/supabase';
import { AuthProvider } from './features/auth/AuthProvider';
import { useAuth } from './features/auth/auth-context';
import { SignInForm } from './features/auth/SignInForm';
import { SongsPage } from './features/songs/SongsPage';
import { SongJourneyPage } from './features/journey/SongJourneyPage';
import { CheckpointPage } from './features/journey/CheckpointPage';
import { AccountMenu } from './features/account/AccountMenu';
import './App.css';

export function App() {
  if (!isConfigured) return <ConfigurationNotice />;

  return (
    <BrowserRouter>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </BrowserRouter>
  );
}

/** Exported for tests, which supply their own Supabase client to AuthProvider. */
export function Shell() {
  const auth = useAuth();

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="app-header">
        <span className="app-header__name">Make a Take</span>
        {auth.status === 'signed-in' && <AccountMenu />}
      </header>

      <main id="main" className="app-main">
        {auth.status === 'loading' && <p role="status">Loading…</p>}
        {auth.status === 'signed-out' && <SignInForm />}
        {auth.status === 'signed-in' && (
          <Routes>
            <Route path="/" element={<SongsPage />} />
            <Route path="/songs/:id" element={<SongJourneyPage />} />
            <Route path="/songs/:id/:phase" element={<SongJourneyPage />} />
            {/* The check is its own address, not a layer over the phase:
                stopping to consider a pass is an act of its own, and one worth
                being able to come back to. */}
            <Route path="/songs/:id/:phase/check" element={<CheckpointPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        )}
      </main>
    </>
  );
}

function NotFound() {
  return (
    <>
      <h1>Nothing here</h1>
      <p className="app-lead">That address does not match anything in Make a Take.</p>
    </>
  );
}

/**
 * A deployment without the two environment variables cannot do anything useful.
 * Saying so plainly beats a blank page or a stack trace in the console.
 */
function ConfigurationNotice() {
  return (
    <main id="main" className="app-main">
      <h1>Make a Take is not configured</h1>
      <p className="app-lead">
        Copy <code>.env.example</code> to <code>.env.local</code> and fill in{' '}
        <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>, then restart
        the dev server.
      </p>
    </main>
  );
}
