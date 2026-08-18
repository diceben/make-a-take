import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '../../lib/supabase';
import { AuthContext, type Auth, type AuthState } from './auth-context';

/**
 * `client` is injectable so tests can drive the whole sign-in flow without a
 * network. Everything else takes the real one.
 */
export function AuthProvider({
  children,
  client = getSupabase(),
}: {
  children: ReactNode;
  client?: SupabaseClient;
}) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    const settle = (session: Session | null) => {
      if (active) setState(session ? { status: 'signed-in', session } : { status: 'signed-out' });
    };

    // A failure here means we cannot reach Supabase. Treat that as signed out —
    // the sign-in form can say what went wrong, an endless spinner cannot.
    void client.auth
      .getSession()
      .then(({ data }) => settle(data.session))
      .catch(() => settle(null));

    const { data } = client.auth.onAuthStateChange((_event, session) => settle(session));

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  const auth = useMemo<Auth>(
    () => ({
      ...state,
      signIn: async (email, password) => {
        const { error } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      },
      signUp: async (email, password) => {
        const { data, error } = await client.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        // With email confirmation switched on, Supabase returns a user but no
        // session — the account only becomes usable after the link is followed.
        return { needsConfirmation: data.session === null };
      },
      signOut: async () => {
        const { error } = await client.auth.signOut();
        if (error) throw error;
      },
    }),
    [state, client],
  );

  return <AuthContext value={auth}>{children}</AuthContext>;
}
