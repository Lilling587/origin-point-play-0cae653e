CREATE TABLE public.team_logos (
  team_name text PRIMARY KEY,
  logo_url text,
  status text NOT NULL DEFAULT 'ok',
  source text,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.team_logos TO anon, authenticated;
GRANT ALL ON public.team_logos TO service_role;
ALTER TABLE public.team_logos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read cached logos"
  ON public.team_logos FOR SELECT
  TO anon, authenticated
  USING (true);