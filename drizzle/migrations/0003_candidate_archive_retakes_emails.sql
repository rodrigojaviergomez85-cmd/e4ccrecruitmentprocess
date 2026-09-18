-- Archive support on applications
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid,
  ADD COLUMN IF NOT EXISTS archive_reason text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'portal',
  ADD COLUMN IF NOT EXISTS created_by uuid;

-- Retakes as numbered attempts
ALTER TABLE public.interview_evaluations
  ADD COLUMN IF NOT EXISTS attempt_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS start_section text;

DROP INDEX IF EXISTS public.interview_evaluations_application_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS interview_evaluations_attempt_uniq
  ON public.interview_evaluations (application_id, attempt_number);

-- Follow-up emails sent to candidates
CREATE TABLE IF NOT EXISTS public.candidate_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  evaluation_id uuid REFERENCES public.interview_evaluations(id) ON DELETE SET NULL,
  kind text NOT NULL,
  to_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  error_message text,
  sent_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.candidate_emails TO authenticated;
GRANT ALL ON public.candidate_emails TO service_role;
ALTER TABLE public.candidate_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read candidate emails"
  ON public.candidate_emails FOR SELECT TO authenticated
  USING (public.is_active_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS candidate_emails_application_idx
  ON public.candidate_emails (application_id, created_at DESC);
