import { createContext, use } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';

export type AuthState =
  { status: 'loading' } | { status: 'signed-out' } | { status: 'signed-in'; session: Session };

export type Auth = AuthState & {
  // The same client the provider is driving. Passing it down here keeps tests
  // able to swap in a fake without a second injection mechanism.
  client: SupabaseClient;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
};

// Kept out of AuthProvider.tsx so that file exports a component and nothing
// else, which is what Fast Refresh needs to reload it cleanly.
export const AuthContext = createContext<Auth | null>(null);

export function useAuth(): Auth {
  const auth = use(AuthContext);
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>');
  return auth;
}
