CREATE TABLE public.error_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,
  level text NOT NULL DEFAULT 'error',
  message text NOT NULL,
  stack text,
  context jsonb,
  route text,
  user_agent text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX error_log_created_at_idx ON public.error_log (created_at DESC);
CREATE INDEX error_log_source_idx ON public.error_log (source);

GRANT SELECT ON public.error_log TO authenticated;
GRANT ALL ON public.error_log TO service_role;

ALTER TABLE public.error_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read error logs"
ON public.error_log FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));