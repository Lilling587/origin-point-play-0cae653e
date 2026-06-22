CREATE TABLE public.cached_briefings (
  matchup_key TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.cached_briefings TO service_role;
ALTER TABLE public.cached_briefings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "no_client_access" ON public.cached_briefings FOR SELECT USING (false);

CREATE TABLE public.fallback_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text,
  matchup text NOT NULL,
  home_team text NOT NULL,
  away_team text NOT NULL,
  field_name text NOT NULL,
  team_side text NOT NULL,
  status text NOT NULL,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fallback_events TO service_role;
ALTER TABLE public.fallback_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY no_client_access ON public.fallback_events FOR SELECT USING (false);
CREATE INDEX idx_fallback_events_created_at ON public.fallback_events (created_at DESC);
CREATE INDEX idx_fallback_events_matchup ON public.fallback_events (matchup);
CREATE INDEX idx_fallback_events_field ON public.fallback_events (field_name, status);