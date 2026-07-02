# vMix Data Source for Grästorps IK broadcast graphics

## Goal

Expose stable HTTP endpoints on the app that vMix GT Designer (on another LAN computer) polls as Data Sources. Contents: full Hockeyettan Södra standings, home lineup, and away lineup for today's Grästorps IK game. A "Publish to vMix" admin button controls which game is active and when the data goes live.

Endpoints will be served by the published Lovable URL over the internet (vMix reaches them from any LAN as long as the broadcast machine has internet). No local file writes, no shared folders.

## Endpoints (public, read-only JSON)

Under `src/routes/api/public/vmix/`:

- `GET /api/public/vmix/current.json` — currently published game metadata (teams, date, venue, status, `publishedAt`).
- `GET /api/public/vmix/standings.json` — full Hockeyettan Södra standings for the active season.
- `GET /api/public/vmix/home-lineup.json` — home team lineup for the published game.
- `GET /api/public/vmix/away-lineup.json` — away team lineup for the published game.

All responses include permissive CORS headers (`Access-Control-Allow-Origin: *`) and short `Cache-Control: public, max-age=15` so vMix can poll safely without hammering the origin. `OPTIONS` handler on each route.

If no game is currently published, endpoints return `{ "published": false, "updatedAt": "..." }` with HTTP 200 (vMix hates 404s).

## Data model

New table `vmix_publications` (one row per active broadcast; usually just one):

```
id uuid pk
game_date date
home_team text
away_team text          -- one of these is always "Grästorps IK"
venue text nullable
standings_json jsonb    -- snapshot at publish time
home_lineup_json jsonb  -- { players: [{ number, name, position, line? }], goalies: [...], coach? }
away_lineup_json jsonb
published_at timestamptz default now()
published_by uuid references auth.users(id)
is_active boolean default true
```

RLS: `SELECT` to `anon` and `authenticated` (endpoints read via anon). Writes: admin only via server function (`has_role(auth.uid(), 'admin')`).

## Admin UI: `/admin/vmix`

New authenticated admin route. Sections:

1. **Today's Grästorp game** — auto-detects home/away opponent from the schedule for today. Falls back to a manual team picker if no game today.
2. **Standings preview** — pulls current standings via existing `fetchFullStandings` server function; shows table.
3. **Home lineup editor** and **Away lineup editor** — each has:
   - "Hämta från roster" button → calls a new server function that scrapes the team's roster page (reuses existing swehockey URLs; extracts number, name, position from the team roster HTML) and populates the editor.
   - Editable table: line/pair, number, name, position. Add/remove rows. Mark starters.
   - Coach + notes (free text).
4. **Publish to vMix** button — snapshots standings + both lineups into `vmix_publications`, sets `is_active = true`, marks previous rows inactive.
5. **Unpublish** button — sets `is_active = false`.
6. **Copy vMix URLs** — quick-copy buttons for the four endpoint URLs.

## Server functions and routes

New files:

- `src/lib/vmix.server.ts` — pure server helpers: `scrapeTeamRoster(teamName, season)`, `buildStandingsPayload(season)`, `buildVmixResponse(pub, kind)`.
- `src/lib/vmix.functions.ts` — `getActivePublication`, `publishVmix({ game, homeLineup, awayLineup })`, `unpublishVmix()`, `fetchTeamRoster({ team })`. All admin-write functions use `requireSupabaseAuth` + `has_role('admin')` check.
- `src/routes/api/public/vmix/current.ts`, `standings.ts`, `home-lineup.ts`, `away-lineup.ts` — thin handlers that read the active row via server-side publishable Supabase client and return the snapshot JSON.
- `src/routes/_authenticated/admin.vmix.tsx` — admin editor UI (shadcn Table + Input + Button).

## Migration

- Create `vmix_publications` table + grants + RLS policies (`SELECT` for anon/authenticated; `ALL` for service_role; admin writes go through server functions using `requireSupabaseAuth`).

## JSON shape (example: home-lineup.json)

```json
{
  "published": true,
  "updatedAt": "2026-07-02T17:30:00Z",
  "game": { "date": "2026-07-02", "home": "Grästorps IK", "away": "IF Troja-Ljungby", "venue": "Ishuset Grästorp" },
  "team": "Grästorps IK",
  "goalies": [{ "number": 30, "name": "...", "starter": true }],
  "skaters": [
    { "line": 1, "position": "LW", "number": 11, "name": "..." },
    { "line": 1, "position": "C",  "number": 19, "name": "..." }
  ],
  "coach": "..."
}
```

vMix GT Designer binds fields directly to these keys.

## Out of scope

- Auto-scraping of live/game-specific lineups (Hockeyettan rarely publishes them pre-game in machine-readable form). Manual editor with roster-prefill is the reliable path.
- LAN file delivery — dropped in favor of HTTP polling per your choice.
- Auto-refresh trigger — publishing is manual per your choice; re-press "Publish to vMix" to snapshot new standings mid-broadcast.
