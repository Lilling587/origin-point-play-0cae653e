# Grästorps IK — Producent-statistik

A TanStack Start app that builds pre-game and post-game statistics briefings for Swedish ice hockey commentators covering **HockeyEttan Södra**. It scrapes raw data from `stats.swehockey.se`, enriches it with AI, caches results, and exposes a clean dashboard for producers.

## Features

- **Matchup briefing** — current form, league position, games played, top scorers, goalies, powerplay/penalty-kill, head-to-head history, venue splits, and period goal distribution.
- **Auto-fill today’s opponent** when the home team has a scheduled game.
- **Favorite team** support persisted in `localStorage`.
- **Compare teams** side-by-side on `/compare`.
- **Auth & notifications** — users can sign in and manage email notification preferences on `/notifications`.
- **Season detection** — background scan for new seasons/competition IDs with admin confirmation.
- **Email webhooks** — `/api/public/hooks/pregame-emails` and `/api/public/hooks/postgame-emails` for external scheduling.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | TanStack Start v1, React 19, TypeScript |
| Build tool | Vite 8 |
| Styling | Tailwind CSS v4, shadcn/ui, CSS custom properties |
| Backend / Auth | Lovable Cloud (Supabase) |
| Data scraping | stats.swehockey.se via Firecrawl |
| AI | Lovable AI Gateway (`google/gemini-2.5-flash`) |
| Email | Resend |
| Package manager | Bun |

## Prerequisites

- [Bun](https://bun.sh/) 1.2 or later
- A Lovable Cloud project with the migrations in `supabase/migrations/` applied
- External service keys for the features you plan to use:
  - Firecrawl API key (data scraping)
  - Lovable AI Gateway key (AI enrichment)
  - Resend API key (email notifications)

## Environment Variables

Create a `.env` file in the project root with the variables below. Public values that the browser needs must be prefixed with `VITE_`.

```bash
# Supabase / Lovable Cloud — public client values
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
VITE_SUPABASE_PROJECT_ID=your-project-id

# Supabase — server-only
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# External integrations
FIRECRAWL_API_KEY=your-firecrawl-api-key
LOVABLE_API_KEY=your-lovable-ai-gateway-key
RESEND_API_KEY=your-resend-api-key
```

> Never commit real secrets. The public `VITE_*` values are shipped to the browser, so keep them limited to non-sensitive keys.

## Scripts

| Script | Purpose |
|--------|---------|
| `bun run dev` | Start the Vite development server |
| `bun run build` | Production build (cleans stale output first) |
| `bun run build:dev` | Development build (cleans stale output first) |
| `bun run build:verify` | Verify that `dist/` is newer than `src/` |
| `bun run clean` | Remove generated directories and caches |
| `bun run preview` | Preview the last production build locally |
| `bun run lint` | Run ESLint |
| `bun run format` | Format the codebase with Prettier |

## Project Structure

```text
.
├── scripts/
│   ├── clean.mjs          # Cross-platform clean helper
│   └── verify-build.mjs   # Detects stale build output
├── src/
│   ├── components/        # Reusable UI components
│   ├── hooks/             # React hooks
│   ├── integrations/      # Lovable Cloud / Supabase integrations
│   ├── lib/               # Server functions, AI gateway, utilities
│   ├── routes/            # TanStack file-based routes
│   │   ├── __root.tsx     # Root layout and shell
│   │   ├── index.tsx      # Home / producer dashboard
│   │   ├── compare.tsx    # Side-by-side team comparison
│   │   ├── auth.tsx       # Sign-in / sign-up
│   │   ├── _authenticated/
│   │   │   ├── route.tsx  # Auth-guarded layout
│   │   │   └── notifications.tsx
│   │   └── api/public/hooks/
│   │       ├── pregame-emails.ts
│   │       └── postgame-emails.ts
│   ├── router.tsx         # Router factory
│   ├── server.ts          # SSR Worker entry
│   ├── start.ts           # TanStack Start instance + middleware
│   └── styles.css         # Tailwind theme tokens
├── supabase/migrations/   # Database schema
├── vite.config.ts
├── package.json
└── tsconfig.json
```

## Database

Migrations in `supabase/migrations/` create the following tables:

- `cached_briefings` — AI-generated matchup briefings and TTL cache
- `fallback_events` — raw fallback data captured during scraping
- `season_detections` — pending/confirmed new season IDs
- `season_overrides` — manual competition ID overrides
- `season_check_meta` — last scan status and timing
- `notification_prefs` — per-user email notification settings (RLS-protected)

Apply these through your Lovable Cloud backend before running the app.

## Development Notes

- This project uses **file-based routing**. Do not create a `src/pages/` directory or Next.js/Remix-style layouts; the router is generated from `src/routes/`.
- Server functions live in `src/lib/*.functions.ts` and use TanStack `createServerFn`.
- Routes that require an authenticated user are nested under `src/routes/_authenticated/`.
- Public webhook endpoints live under `src/routes/api/public/`.
- `src/start.ts` registers `attachSupabaseAuth`; removing it will break authenticated server functions.
- The production target is a serverless Worker (Cloudflare). Avoid Node-only packages that rely on `child_process`, native binaries, or filesystem watchers.

## Deployment

The app is built and deployed through Lovable. If you deploy the build artifact elsewhere, make sure:

- All environment variables above are available to the runtime.
- Supabase migrations are applied and RLS policies are active.
- `vite.config.ts` does **not** set `ssr.external` for the Worker environment.

## License

Private — not licensed for public use.
