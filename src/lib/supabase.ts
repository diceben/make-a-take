import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Both values below are meant to be public — they ship inside the browser
 * bundle. What protects the data is row level security, not their secrecy.
 * The service role key is a different matter and must never appear here.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isConfigured = Boolean(url && publishableKey);

/**
 * Missing configuration is a deployment mistake, not a user error, so it fails
 * loudly here rather than turning into a blank page or a confusing network
 * error later. Callers check `isConfigured` first.
 */
export function getSupabase(): SupabaseClient {
  if (!url || !publishableKey) {
    throw new Error(
      'Supabase is not configured. Copy .env.example to .env.local and fill in ' +
        'VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.',
    );
  }
  return client ?? (client = createClient(url, publishableKey));
}

let client: SupabaseClient | undefined;
