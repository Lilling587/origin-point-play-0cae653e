# Förbättringsplan — tre paket

## Paket 1 — Standings (`/tabell`) + Next-match-widget på hemsidan

**Mål:** Snabb överblick av seriens tabell och nästa match för valt lag direkt på dashboarden.

### Backend
- `src/lib/standings.functions.ts` (ny) — `getStandings(season)`:
  - Scrape `stats.swehockey.se/ScheduleAndResults/Standings/<competitionId>` via Firecrawl/cheerio (samma mönster som `fetchScorers`).
  - Returnerar `Array<{ rank, team, gp, w, otw, otl, l, gf, ga, diff, points, lastFive: ("W"|"OTW"|"OTL"|"L")[] }>`.
  - Cache: 12h via befintlig pattern i `stats.server.ts`.
- `getNextMatchForTeam(team, season)` i `src/lib/stats.functions.ts` — återanvänder schema-parsern, returnerar närmsta ospelade match (`date, time, home, away, venue`).

### UI
- `src/routes/tabell.tsx`:
  - `<SeasonPicker>`, sortbar tabell (rank/poäng/diff/GF/GA), klick på lagnamn → fyller dashboard.
  - Form-strip: senaste 5 som färgade pillar.
  - Mobil: kompakt kort per lag.
  - `head()` med egen title/description/og.
- `src/components/dashboard/cards/next-match-card.tsx` (ny) på `/`:
  - Visar motstånd + `TeamLogo`, datum, arena, nedräkning ("om 2d 4h").
  - "Ladda briefing"-knapp som sätter `?home=&away=` query.
- Lägg "Tabell" i header bredvid "Spelschema"/"Spelare".

## Paket 2 — Briefing-export (PDF / clipboard / TV-ready)

**Mål:** Producenter kan ta med briefingen från Lovable till sändning utan att skriva av.

### Komponent
- `src/components/dashboard/export-menu.tsx` (ny) i briefing-headern:
  - Tre val: **Kopiera som text (TV-mall)**, **Kopiera som markdown**, **Ladda ner PDF**.
- TV-mall = plain-text block med fasta etiketter (FORM:, TOPPSCORER:, MV%, PP%, BOX%, H2H 3 senaste, KEY NOTE) — pre-format anpassat för grafik-prompter.
- Markdown = den befintliga briefing-strukturen serialiserad.

### PDF
- Klient-side PDF via `pdf-lib` (Worker-kompatibel; ingen serverless-renderer). Layout: A4, header med båda `TeamLogo` (canvas→PNG), två kolumner (hemma/borta), nyckeltal-tabell, fotnot med datakälla + tidsstämpel.
- Filnamn: `briefing-{home}-vs-{away}-{date}.pdf`.

### Server (frivillig delning)
- `src/routes/api/public/briefing/$id.ts` — read-only public länk till en cachad briefing (slug = hash av home+away+date). Bara läs från `cached_briefings`, ingen PII, narrow `TO anon` SELECT-policy.

## Paket 3 — PWA + scraper-health admin

**Mål:** Installerbar app med offline-cache för senast lästa briefing, och en `/admin/health` för att se att scrapningen funkar.

### PWA (offline, då användaren bett om "PWA + offline cache")
- `vite-plugin-pwa` med `generateSW`, `registerType: "autoUpdate"`, `injectRegister: null`.
- `src/lib/register-sw.ts` wrapper med Lovable-skydd: vägra registrera i dev, iframe, `id-preview--*`, `preview--*`, `*.lovableproject.com`, `*.lovableproject-dev.com`, `beta.lovable.dev`, eller om `?sw=off`. Avregistrera matchande SW i de fallen.
- Strategier:
  - HTML-navigationer: `NetworkFirst`.
  - Hashade assets: `CacheFirst`.
  - Server-fn POST (`/_serverFn/*`): ingen cache.
  - Briefing JSON: `StaleWhileRevalidate` med 24h max-age.
- Manifest (`public/manifest.webmanifest`): namn "Producent-statistik", short_name "Producent", theme `#0F172A`, ikoner 192/512.
- Exkludera `/~oauth` och `/auth*` från navigation fallback.

### Scraper-health admin
- Ny tabell `scrape_metrics` (migration) — kolumner: `id, endpoint, season, status, latency_ms, cache_hit, error, fetched_at`. RLS + GRANT enligt regler; `SELECT` bara för admin via `has_role`.
- Wrap befintliga server-helpers (`fetchScorers`, `fetchGoalies`, `fetchSchedule`, `getStandings`, `getLeaguePlayers`) med en `recordScrape()` helper i `stats.server.ts` som loggar varje hämtning.
- `src/routes/_authenticated/admin.health.tsx` (admin-gate via `requireAdmin` server fn):
  - KPI-rad: success-rate 24h, p95-latens, cache-hit-rate, antal fallback-events.
  - Tabell över senaste 50 hämtningarna med status-färg.
  - Säsongsdetektering: visar `season_check_meta` + pending `season_detections`.
- Lägg admin-länk i headern endast när `has_role(admin)`.

## Filer

```text
Nya:
  src/lib/standings.functions.ts
  src/lib/standings.server.ts
  src/routes/tabell.tsx
  src/components/dashboard/cards/next-match-card.tsx
  src/components/dashboard/export-menu.tsx
  src/lib/briefing-export.ts        (markdown/text/pdf-serializers)
  src/routes/api/public/briefing/$id.ts
  src/lib/register-sw.ts
  public/manifest.webmanifest
  src/routes/_authenticated/admin.health.tsx
  src/lib/scrape-metrics.functions.ts
  supabase/migrations/<ts>_scrape_metrics.sql

Ändras:
  src/routes/index.tsx                 (next-match-card, export-knapp)
  src/routes/__root.tsx                (manifest <link>, SW-bootstrap import, nav-länkar)
  src/components/dashboard/briefing-view.tsx (export-menu i header)
  src/lib/stats.server.ts              (recordScrape-wrap)
  vite.config.ts                       (vite-plugin-pwa)
  package.json                         (pdf-lib, vite-plugin-pwa)
```

## Validering
- `bun run build` grönt; `tsgo` ren.
- `/tabell` renderar 14 lag, sortering funkar, klick fyller dashboard.
- Next-match-card visar rätt nedräkning för favoritlaget.
- Export: text/markdown hamnar i urklipp; PDF öppnas och innehåller båda lagens loggor.
- PWA: i publicerat läge installerbar, offline visar senast lästa briefing; i Lovable preview registreras **ingen** SW (verifiera i DevTools → Application).
- `/admin/health`: kräver admin, visar metrics efter att man laddat dashboard ett par gånger.

Säg till om något paket ska minskas eller delas upp i mindre leveranser innan jag bygger.
