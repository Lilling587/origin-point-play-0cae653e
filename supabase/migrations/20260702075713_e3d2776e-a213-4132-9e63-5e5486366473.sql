CREATE TABLE public.vmix_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_date date NOT NULL,
  home_team text NOT NULL,
  away_team text NOT NULL,
  venue text,
  standings_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  home_lineup_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  away_lineup_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.vmix_publications TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vmix_publications TO authenticated;
GRANT ALL ON public.vmix_publications TO service_role;

ALTER TABLE public.vmix_publications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read vmix publications"
  ON public.vmix_publications FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert vmix publications"
  ON public.vmix_publications FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update vmix publications"
  ON public.vmix_publications FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete vmix publications"
  ON public.vmix_publications FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER vmix_publications_set_updated_at
  BEFORE UPDATE ON public.vmix_publications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX vmix_publications_active_idx
  ON public.vmix_publications (is_active, published_at DESC);