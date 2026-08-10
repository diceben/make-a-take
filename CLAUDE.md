# Make a Take

Web-App, mit der man den Fortschritt der einzelnen Recording-Schritte eines
Musikstücks verfolgt. Öffentlich nutzbar, jeder mit eigenem Konto.
Sprache der App: **Englisch**. Sprache im Gespräch mit Ben: **Deutsch**.

## Befehle

```bash
npm run dev        # Entwicklungsserver
npm run typecheck  # TypeScript
npm run lint       # ESLint
npm test           # Unit-Tests (Vitest)
npm run test:e2e   # Playwright inkl. axe-Prüfung
npm run build      # Produktionsbuild nach dist/
```

Vor jedem Commit: **`npm run typecheck && npm run lint && npm test`**.
Dieselben Prüfungen laufen in der CI bei jedem Pull Request.

## Das Datenmodell

Projekt (Album/EP) → Song → 7 feste Phasen. Spuren hängen ausschließlich in der
Tracking-Phase.

- **Phasen** (fest, für jeden Song gleich): Writing, Arrangement, Pre-Production,
  Tracking, Editing, Mixing, Mastering.
- **Spuren** (fest): Drums, Bass, Guitars, Keys, Lead Vocals, Backing Vocals.
- **Zustände**: `todo`, `doing`, `review`, `done`.

**Fortschritt ist gewichtet.** Die Gewichte stehen an genau einer Stelle
(`src/lib/progress.ts`) und werden nicht anderswo dupliziert:
Writing 10, Arrangement 10, Pre-Production 10, Tracking 30, Editing 15,
Mixing 20, Mastering 5.

Der Status der Tracking-Phase wird **aus den Spuren abgeleitet**, nie separat
gesetzt — sonst gäbe es zwei Wahrheiten.

## Design-Regeln

- **Alle Farben und Maße sind Tokens** in `src/styles/tokens.css`. Niemals eine
  Farbe direkt in eine Regel schreiben.
- Jede Farbe braucht einen Wert in **beiden** Themes (`dark` und `light`), sonst
  bricht eines von beiden.
- Kontrast mindestens **7:1** für Text, 3:1 für Rahmen. Der axe-Lauf in
  `e2e/smoke.spec.ts` prüft das mit aktivierter Regel `color-contrast-enhanced`.
- Status wird **nie allein über Farbe** gezeigt — immer Farbe plus Symbol plus
  Wort.
- Sichtbare Fokusringe, volle Tastaturbedienung, `prefers-reduced-motion`
  respektieren.
- Die Theme-Logik steht in `src/theme.ts`; das Inline-Skript in `index.html`
  wiederholt sie, um Flackern beim ersten Laden zu vermeiden. **Ändert man eine,
  ändert man beide.**

## Git

Entwicklung auf `claude/*`-Branches, dann Pull Request nach `main`.
Push auf `main` deployt über Vercel.
