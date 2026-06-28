CREATE TABLE public.scrape_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint text NOT NULL,
  season text,
  status text NOT NULL CHECK (status IN ('ok','error')),
  latency_ms integer NOT NULL,
  cache_hit boolean NOT NULL DEFAULT false,
  error text,
  context jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX scrape_metrics_fetched_at_idx ON public.scrape_metrics (fetched_at DESC);
CREATE INDEX scrape_metrics_endpoint_idx ON public.scrape_metrics (endpoint, fetched_at DESC);

GRANT SELECT ON public.scrape_metrics TO authenticated;
GRANT ALL ON public.scrape_metrics TO service_role;

ALTER TABLE public.scrape_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read scrape metrics"
  ON public.scrape_metrics
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));