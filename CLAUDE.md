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
npm run test:db    # Schema + RLS gegen eine Wegwerf-Datenbank
npm run build      # Produktionsbuild nach dist/
```

`test:db` braucht einen erreichbaren PostgreSQL-16-Server, z. B.
`PGHOST=localhost PGUSER=postgres npm run test:db`.

Vor jedem Commit: **`npm run typecheck && npm run lint && npm test`**.
Dieselben Prüfungen laufen in der CI bei jedem Pull Request.

## Supabase

Zugangsdaten kommen aus `.env.local` (Vorlage: `.env.example`). Beide Werte sind
für den Browser bestimmt — geschützt wird über Row Level Security, nicht über
Geheimhaltung. Der `service_role`-Key gehört **niemals** ins Repo oder in eine
`VITE_`-Variable.

Das Schema liegt in `supabase/migrations/` und ist die einzige Wahrheit.
Struktur **nie** im Supabase-Dashboard zusammenklicken — siehe
`supabase/README.md`.

## Das Datenmodell

**Im Umbau.** Das Modell unten (Song → Phase → Runde → Entscheidung → Step,
plus Notizen mit Zielphase) ist ab `20260819080000` in der Datenbank. Die
Oberfläche liest noch das alte `phase_states`/`track_states` und zieht
schrittweise nach; eine spätere Migration wirft die alten Tabellen weg. Solange
existieren beide Formen nebeneinander — das ist Absicht, nicht Schlamperei.

Song → 7 Phasen (`capture, write, produce, track, edit, mix, master`) → Runden →
**Entscheidungen** → Steps.

- Eine **Entscheidung** wird beurteilt, nicht abgehakt: fünf Stufen
  `not_touched, direction_set, not_quite_there, feels_right, locked`. Die
  Verhaltensdefinition jeder Stufe gehört in den Picker — die Labels dürfen nie
  ohne sie auftreten.
- Ein **Step** ist überprüfbar und binär. Faustregel: würden zwei Leute
  unabhängig dasselbe feststellen, ist es ein Step. Ein Item ist nie beides.
- **Zurückgehen erzeugt eine Runde**, es löscht nichts. Deshalb gibt es kein
  Reset mehr.
- **Kein songweiter Prozentwert.** Innerhalb einer Phase `n von m locked`,
  songweit nur gezählte Kennzahlen.
- **Notizen tragen eine Zielphase.** Im Tracking geschrieben, im Mix gebraucht.

### Das alte Modell (noch in der Oberfläche)

Song → 7 feste Phasen. Spuren hängen ausschließlich in der Tracking-Phase.

**Der Song ist die Einheit**, es gibt nichts darüber. Ein Song gehört einer
Person (`owner_id`) und nennt optional eine `artist`-Zeichenkette; die Liste
gruppiert danach. Ein Artist ist also ein Wort auf dem Song, keine eigene
Tabelle — es gibt nichts, was aus dem Tritt geraten könnte. Songs ohne Artist
sammeln sich am Ende unter einer eigenen Überschrift.

Es gab früher eine Projekt-Ebene (Album/EP) darüber. Die ist weg
(`20260818090000_songs_stand_alone.sql`) — sie zwang dazu, erst eine
Veröffentlichung zu erfinden, bevor man einen Song aufschreiben konnte.

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
