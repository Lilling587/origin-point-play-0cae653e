# Spår 1 — Punkt 2 & 3

## Punkt 2: Print-ready briefing
Gör briefing-vyn utskriftsvänlig så producenter kan ta med ett papper i båset.

- Lägg till en "Skriv ut"-knapp i `BriefingView`-headern (bredvid uppdatera-knappen) som kallar `window.print()`.
- Lägg till print-stilar i `src/styles.css` via `@media print`:
  - Dölj header, tabs, lag-väljaren, knappar, banners (`.no-print`-klass + selektorer för `header`, `[role="tablist"]`, etc.).
  - Tvinga ljus bakgrund, svart text, ta bort skuggor/borders som inte syns på papper.
  - `break-inside: avoid` på varje `Card` så kort inte delas mitt itu.
  - Sätt `@page { size: A4; margin: 12mm; }`.
  - Visa hemma- vs bortalag + datum överst i en print-only header.
- Markera dolda element med `className="no-print"` där det behövs (knappar, refresh-status).

## Punkt 3: Svenska felmeddelanden
Idag visas råa engelska Error-meddelanden från server functions ("Failed to fetch", "HTTPError" osv). Översätt till begriplig svenska.

- Skapa `src/lib/error-messages.ts` med `translateError(err: unknown): string` som mappar kända mönster:
  - Network/fetch fel → "Kunde inte nå servern. Kontrollera din anslutning."
  - 404/not found → "Hittade inte matchdata för valt lag."
  - 500/HTTPError → "Något gick fel på servern. Försök igen om en stund."
  - Timeout → "Begäran tog för lång tid. Försök igen."
  - Validation (lag saknas) → behåll befintliga svenska texter.
  - Fallback → "Ett oväntat fel uppstod." (loggar original till console).
- Använd `translateError` i:
  - `src/routes/index.tsx` (briefingMut.onError, RouteError, teamsQuery-error-banner).
  - `src/components/dashboard/postgame/postgame-recap-card.tsx` (om den visar error).
  - `BriefingView` refresh-error.
- Behåll engelska originalet i `console.error` för debug.

## Tekniska detaljer
- Inga nya beroenden.
- Inga schema- eller server-fn-ändringar.
- Filer som ändras: `src/styles.css`, `src/components/dashboard/briefing-view.tsx`, `src/routes/index.tsx`.
- Ny fil: `src/lib/error-messages.ts`.

## Validering
- `bun run build` ska gå igenom.
- Manuellt: öppna briefing → Cmd+P → kontrollera att bara kortinnehåll syns.
- Manuellt: stäng av nätverk → klicka "Ladda statistik" → svensk text visas.
