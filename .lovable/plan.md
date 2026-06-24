
# Refaktor av `src/routes/index.tsx` (2 927 rader)

Mål: routefilen orkestrerar bara state, queries och layout (~250–350 rader). Alla presentationskomponenter och rena hjälpfunktioner flyttas till `src/components/dashboard/` respektive `src/lib/dashboard-utils.ts`. Inga beteendeförändringar — bara filuppdelning.

## Ny filstruktur

```text
src/
  routes/
    index.tsx                       // Dashboard route: loader, state, layout
  components/dashboard/
    season-picker.tsx               // SeasonPicker
    searchable-team-picker.tsx      // SearchableTeamPicker
    pending-seasons-banner.tsx      // PendingSeasonsBanner + PendingSeasonRow
    briefing-skeleton.tsx           // BriefingSkeleton
    briefing-view.tsx               // BriefingView (orkestrering av kort)
    cards/
      team-header.tsx               // TeamHeader
      form-card.tsx                 // FormCard
      venue-streak-card.tsx         // VenueStreakCard + VenueRow
      period-goals-card.tsx         // PeriodGoalsCard
      scorers-card.tsx              // ScorersCard
      goalies-card.tsx              // GoaliesCard
      shot-volume-card.tsx          // ShotVolumeCard
      special-teams-card.tsx        // SpecialTeamsCard
      win-probability-card.tsx      // WinProbabilityCard
      hottest-player-card.tsx       // HottestPlayerCard
      streak-alerts-card.tsx        // StreakAlertsCard
      form-trend-card.tsx           // FormTrendCard
      rest-days-card.tsx            // RestDaysCard
      discipline-card.tsx           // DisciplineCard
    postgame/
      postgame-recap-card.tsx       // PostgameRecapCard (~500 rader, egen fil)
      last-meeting-card.tsx         // LastMeetingCard
      season-trajectory-card.tsx    // SeasonTrajectoryCard + TrajectoryChart(Inner)
      all-time-h2h-card.tsx         // AllTimeH2HCard + AllTimeH2HBody
      historical-depth-section.tsx  // HistoricalDepthSection (wrapper)
  lib/
    dashboard-utils.ts              // resultVariant, resultLabel, resultPoints,
                                    // venueWinRate, teamPpg, currentStreak,
                                    // streakLabel, streakVariant, recordStr,
                                    // fmtPct1, lastFivePpg, parseGameDate,
                                    // daysSinceLast, strongestPeriod,
                                    // todayInStockholm
```

## Tillvägagångssätt

1. **Skapa `src/lib/dashboard-utils.ts`** med alla rena hjälpfunktioner (rader 1032–1042, 1107–1117, 1389–1424, 1635–1637, 1728–1739, 2643–2647, 2741–2745, 2780–2811, 2858–2868). Exportera typ-aliaset `type TeamData = Briefing["home"]` här.
2. **Skapa kortkomponenter** under `src/components/dashboard/cards/` — en fil per komponent. Varje fil:
   - Importerar bara det den behöver från `@/components/ui/*`, `lucide-react`, `@/lib/dashboard-utils` och `@/lib/stats.functions` för typer.
   - Är default- eller named-export — använd named export (matchar projektets stil).
3. **Skapa postgame-komponenter** under `src/components/dashboard/postgame/`. `PostgameRecapCard` är den största (rader 1741–2255) och blir egen fil. `HistoricalDepthSection` orkestrerar `AllTimeH2HCard` + `LastMeetingCard` + `SeasonTrajectoryCard`.
4. **Skapa `briefing-view.tsx`** som bara renderar grid + delegerar till korten. Behåller `id="briefing-capture"` och `handleShareImage` (html-to-image-dynamic-import stannar här eftersom det är knutet till `BriefingView`).
5. **Skapa `season-picker.tsx`, `searchable-team-picker.tsx`, `pending-seasons-banner.tsx`, `briefing-skeleton.tsx`** — flytt utan ändring.
6. **Banta `src/routes/index.tsx`** ner till:
   - `searchSchema`, query-options, `Route`-definition, loader.
   - `RouteError`, `NotFound`.
   - `Dashboard`-komponenten (state, queries, validation, header/main JSX) som importerar allt ovan.
7. **Verifiering:**
   - `bunx tsgo` (typecheck) ska gå grön.
   - `bun run build` ska gå grön.
   - Snabb Playwright-rundtur på `/` för att se att Briefing renderas, Refresh fungerar, tab-byte fungerar.

## Vad ändras INTE

- Inga ändringar i `stats.functions.ts`, server-funktioner eller datamodeller.
- Inga ändringar i URL-schema, search-params eller routing.
- Inga ändringar i query keys, cache-strategi eller HMR-konfiguration.
- Inga visuella ändringar — pixel-identisk output.

## Risker & motåtgärder

- **Circular imports**: alla kort importerar bara `dashboard-utils` + types — ingen kortfil importerar `briefing-view`. Säker DAG.
- **Type narrowing**: `Briefing["home"]` används brett — exportera `TeamData` från `dashboard-utils.ts` så typerna delas konsekvent.
- **Bundle-storlek**: oförändrad totalt; faktiskt något bättre eftersom code-splitter kan dela upp efter route-byte.
- **Subtle behavior drift**: `handleShareImage` använder `document.getElementById("briefing-capture")` — det ID:t måste behållas i `briefing-view.tsx`.

## Uppskattning

~20 filer skapas, 1 fil bantas. Inga nya deps. Förväntad resultat: `index.tsx` går från 2 927 → ~300 rader.
