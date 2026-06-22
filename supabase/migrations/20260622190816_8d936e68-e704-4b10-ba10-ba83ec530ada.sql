CREATE TABLE public.season_detections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text,
  competition_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  source_url text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
GRANT ALL ON public.season_detections TO service_role;
ALTER TABLE public.season_detections ENABLE ROW LEVEL SECURITY;
CREATE POLICY no_client_access ON public.season_detections FOR SELECT USING (false);

CREATE TABLE public.season_overrides (
  label text PRIMARY KEY,
  competition_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.season_overrides TO service_role;
ALTER TABLE public.season_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY no_client_access ON public.season_overrides FOR SELECT USING (false);

CREATE TABLE public.season_check_meta (
  id integer PRIMARY KEY,
  last_checked_at timestamptz,
  last_status text,
  last_error text
);
GRANT ALL ON public.season_check_meta TO service_role;
ALTER TABLE public.season_check_meta ENABLE ROW LEVEL SECURITY;
CREATE POLICY no_client_access ON public.season_check_meta FOR SELECT USING (false);