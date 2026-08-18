import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { Shell } from './App';
import { AuthProvider } from './features/auth/AuthProvider';
import { THEME_STORAGE_KEY } from './theme';
import * as data from './lib/data';

// The signed-in view loads the songs; this stage only cares that the
// right view appears, so the database layer is stubbed out empty.
vi.mock('./lib/data');

/**
 * A stand-in for the parts of the Supabase client the app touches. Small on
 * purpose: if the app starts using more of the API, this stops compiling, which
 * is exactly the reminder we want.
 */
function fakeClient({
  session = null,
  signInError,
}: { session?: Session | null; signInError?: Error } = {}) {
  const listeners: ((event: string, session: Session | null) => void)[] = [];
  const fakeSession = { user: { id: 'user-1', email: 'ben@example.com' } } as Session;

  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session } }),
      onAuthStateChange: (callback: (event: string, session: Session | null) => void) => {
        listeners.push(callback);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      signInWithPassword: vi.fn(() => {
        if (signInError) return Promise.resolve({ data: null, error: signInError });
        for (const listener of listeners) listener('SIGNED_IN', fakeSession);
        return Promise.resolve({ data: { session: fakeSession }, error: null });
      }),
      signUp: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      signOut: vi.fn(() => {
        for (const listener of listeners) listener('SIGNED_OUT', null);
        return Promise.resolve({ error: null });
      }),
    },
  } as unknown as SupabaseClient;
}

const renderApp = (client: SupabaseClient) => {
  vi.mocked(data.listSongs).mockResolvedValue([]);
  return render(
    <MemoryRouter>
      <AuthProvider client={client}>
        <Shell />
      </AuthProvider>
    </MemoryRouter>,
  );
};

describe('signed out', () => {
  it('shows the sign-in form', async () => {
    renderApp(fakeClient());
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
  });

  it('rejects a malformed address before contacting the server', async () => {
    const user = userEvent.setup();
    const client = fakeClient();
    renderApp(client);
    await screen.findByRole('heading', { level: 1, name: 'Sign in' });

    await user.type(screen.getByLabelText('Email'), 'not-an-address');
    await user.type(screen.getByLabelText('Password'), 'longenough');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByRole('status')).toHaveTextContent('does not look like an email address');
    expect(client.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('rejects a short password before contacting the server', async () => {
    const user = userEvent.setup();
    const client = fakeClient();
    renderApp(client);
    await screen.findByRole('heading', { level: 1, name: 'Sign in' });

    await user.type(screen.getByLabelText('Email'), 'ben@example.com');
    await user.type(screen.getByLabelText('Password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByRole('status')).toHaveTextContent('at least 8 characters');
    expect(client.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('shows the reason when the server refuses', async () => {
    const user = userEvent.setup();
    renderApp(fakeClient({ signInError: new Error('Invalid login credentials') }));
    await screen.findByRole('heading', { level: 1, name: 'Sign in' });

    await user.type(screen.getByLabelText('Email'), 'ben@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrongpassword');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Invalid login credentials')).toBeInTheDocument();
  });

  it('signs in with valid credentials', async () => {
    const user = userEvent.setup();
    renderApp(fakeClient());
    await screen.findByRole('heading', { level: 1, name: 'Sign in' });

    await user.type(screen.getByLabelText('Email'), 'ben@example.com');
    await user.type(screen.getByLabelText('Password'), 'correcthorse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Your songs' }),
    ).toBeInTheDocument();
  });

  it('switches to the sign-up form and back', async () => {
    const user = userEvent.setup();
    renderApp(fakeClient());
    await screen.findByRole('heading', { level: 1, name: 'Sign in' });

    await user.click(screen.getByRole('button', { name: /Create one/ }));
    expect(
      screen.getByRole('heading', { level: 1, name: 'Create an account' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Already have an account/ }));
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
  });

  it('asks the new user to confirm their address', async () => {
    const user = userEvent.setup();
    renderApp(fakeClient());
    await screen.findByRole('heading', { level: 1, name: 'Sign in' });

    await user.click(screen.getByRole('button', { name: /Create one/ }));
    await user.type(screen.getByLabelText('Email'), 'ben@example.com');
    await user.type(screen.getByLabelText('Password'), 'correcthorse');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText(/Check your inbox/)).toBeInTheDocument();
  });
});

describe('signed in', () => {
  const session = { user: { id: 'user-1', email: 'ben@example.com' } } as Session;

  it('shows the song list', async () => {
    renderApp(fakeClient({ session }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Your songs' }),
    ).toBeInTheDocument();
  });

  it('signs out again', async () => {
    const user = userEvent.setup();
    renderApp(fakeClient({ session }));
    await screen.findByRole('heading', { level: 1, name: 'Your songs' });

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument(),
    );
  });
});

describe('theme', () => {
  it('switches and remembers the choice', async () => {
    const user = userEvent.setup();
    renderApp(fakeClient());
    await screen.findByRole('heading', { level: 1, name: 'Sign in' });

    expect(document.documentElement.dataset['theme']).toBe('dark');

    await user.click(screen.getByRole('button', { name: 'Light theme' }));

    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });
});
