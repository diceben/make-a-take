# Make a Take

Track every recording step of a song — from writing to master.

Recording a song is a long chain of small steps, and the status of that chain
usually lives in your head, on a scrap of paper, or in a DAW project name. Make a
Take puts it on one page: every song shows which of its seven phases are done,
which tracks are still missing, and what is actually holding it up.

Each song moves through **Writing → Arrangement → Pre-Production → Tracking →
Editing → Mixing → Mastering**. Inside the tracking phase every instrument —
drums, bass, guitars, keys, lead vocals, backing vocals — carries its own state:
to do, in progress, needs review, or done. Overall progress is weighted, so
finishing the mix moves the bar further than picking a title.

**Status: early.** The app is being built in stages; this is stage 0, the
scaffolding. It does not store anything yet.

## Install

Requires Node 22 or newer.

```bash
npm install
cp .env.example .env.local   # fill in once a Supabase project exists
```

## Usage

```bash
npm run dev        # development server on http://localhost:5173
npm run build      # production build into dist/
npm run preview    # serve the production build
```

## Development

```bash
npm run typecheck  # TypeScript, no emit
npm run lint       # ESLint
npm run format     # Prettier
npm test           # unit tests (Vitest)
npm run test:e2e   # browser tests including accessibility checks (Playwright + axe)
```

All of the above run in CI on every pull request.

## License

MIT — see [LICENSE](LICENSE).
