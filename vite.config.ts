import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  preview: { port: 4173 },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Recorded calls do not survive into the next test. Without this, asserting
    // that something was *not* called passes or fails depending on which tests
    // ran before it — a test that lies either way.
    clearMocks: true,
    // e2e/ belongs to Playwright, not Vitest.
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
});
