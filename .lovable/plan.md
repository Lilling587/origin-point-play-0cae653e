## Spår 2 — Punkt 3 & 6

### Punkt 3: Spelarsök över hela ligan (`/spelare`)

Ny route där man kan söka på spelarnamn över alla lag i HockeyEttan istället för att klicka sig igenom lag för lag.

**Server**
- `getLeaguePlayers(season)` i `src/lib/stats.functions.ts` + server‑helper i `stats.server.ts` som scrapar `Teams/Info/PlayersByTeam/<competitionId>` och returnerar en flat lista:
  ```ts
  type LeaguePlayer = {
    team: string;
    name: string;        // "Berndtsson, Hampus"
    position: string;    // "F" | "D" | "G"
    gamesPlayed: number | null;
    goals: number | null;
    assists: number | null;
    points: number | null;
    pim: number | null;
  };
  ```
- Återanvänder befintlig HTML‑fetch + cheerio‑parsning från `fetchScorers`/`fetchGoalies` — lyfter ut till en gemensam `parseAllPlayersFromHtml`.
- Cache: 12h (samma TTL som övriga säsongsdata).

**UI**
- `src/routes/spelare.tsx` (file‑based route, mappar till `/spelare`).
- Säsongsväljare (samma `<SeasonPicker>` som schema‑routen).
- Sökfält (klient‑side `filter` på namn + lag, debounced 150ms).
- Position‑chips (Alla / Forwards / Backar / Målvakter).
- Sortering: poäng (default), mål, assist, GP, PIM.
- Tabell: rank, namn, lag, pos, GP, G, A, P, PIM. Mobil = kort med samma fält.
- Lägg "Spelare" i headern bredvid "Spelschema".

### Punkt 6: Lag‑loggor

Inga riktiga logo‑filer hostas på stats.swehockey.se — sajten visar bara textnamn. Pragmatisk lösning: generera en konsekvent **avatar** per lag (initialer + deterministisk färg från hashad lagnamn) och visa den överallt där lagnamnet visas idag.

- Ny komponent `src/components/team-logo.tsx`:
  - Props: `team: string`, `size?: "sm" | "md" | "lg"`.
  - Rund/rounded‑square div med initialer (max 2 bokstäver, t.ex. "GIK", "BIK").
  - Bakgrundsfärg = HSL från `hash(team)` med fast S/L så det blir läsbart i både ljust och mörkt tema.
  - Stöder ev. override‑map `src/lib/team-logos.ts` för manuella URL:er senare (tomt initialt).
- Använd `<TeamLogo>` i:
  - `src/components/dashboard/cards/team-header.tsx` (bredvid lagnamn).
  - `src/routes/index.tsx` lag‑väljare (i Select‑items, mobil tabs).
  - `src/routes/schema.tsx` (vid varje match).
  - Den nya `/spelare` (vid lag‑kolumn).
- Inga nätverksanrop, ingen ny dependency.

### Bugfix på vägen
- `ThemeToggle` hydration‑mismatch: rendera knappen som disabled placeholder (med `<Sun>` standard) tills `useEffect` markerat `mounted=true`. Servern och första klient‑render blir identiska, sedan swappar vi till rätt ikon.

### Filer
- Nya: `src/routes/spelare.tsx`, `src/components/team-logo.tsx`, `src/lib/team-logos.ts`.
- Ändras: `src/lib/stats.functions.ts`, `src/lib/stats.server.ts`, `src/components/theme-toggle.tsx`, `src/components/dashboard/cards/team-header.tsx`, `src/routes/index.tsx`, `src/routes/schema.tsx`.

### Validering
- `bun run build` grön.
- Manuellt: `/spelare` → sök "berndt" → ser bara matchande spelare; växla säsong; sortera kolumner.
- Manuellt: alla vyer visar TeamLogo bredvid lagnamn; ingen hydration‑varning kvar i konsolen.
