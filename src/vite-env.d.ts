/// <reference types="vite/client" />

// Without this, import.meta.env.VITE_* is `any` and every use of it silently
// escapes type checking.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
