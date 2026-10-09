ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS screening_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS screening_technical_resets integer NOT NULL DEFAULT 0;
UPDATE public.applications SET screening_attempts = 1 WHERE submitted_at IS NOT NULL AND screening_attempts = 0;
ALTER TABLE public.applications ADD CONSTRAINT applications_screening_attempts_max CHECK (screening_attempts BETWEEN 0 AND 2);

CREATE TABLE public.screening_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  kind text NOT NULL DEFAULT 'level',
  ai_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  videos jsonb NOT NULL DEFAULT '[]'::jsonb,
  transcripts jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, attempt_number, kind)
);
GRANT ALL ON public.screening_attempts TO service_role;
GRANT SELECT ON public.screening_attempts TO authenticated;
ALTER TABLE public.screening_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active staff read screening history" ON public.screening_attempts
  FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));

-- Atomically counts a screening submission; returns the attempt number, or 0 when it was already submitted / no attempts left.
CREATE OR REPLACE FUNCTION public.submit_screening(_application_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n integer;
BEGIN
  UPDATE public.applications
     SET submitted_at = now(), screening_attempts = screening_attempts + 1
   WHERE id = _application_id AND submitted_at IS NULL AND screening_attempts < 2
  RETURNING screening_attempts INTO _n;
  RETURN coalesce(_n, 0);
END; $$;
REVOKE EXECUTE ON FUNCTION public.submit_screening(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_screening(uuid) TO service_role;