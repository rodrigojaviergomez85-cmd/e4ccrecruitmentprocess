ALTER TABLE public.recruitment_progress
  ADD COLUMN IF NOT EXISTS internet_download_mbps numeric,
  ADD COLUMN IF NOT EXISTS internet_upload_mbps numeric,
  ADD COLUMN IF NOT EXISTS internet_ping_ms numeric,
  ADD COLUMN IF NOT EXISTS internet_tested_at timestamptz,
  ADD COLUMN IF NOT EXISTS internet_test_passed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS internet_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS internet_override_note text,
  ADD COLUMN IF NOT EXISTS internet_override_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS internet_override_at timestamptz,
  ADD COLUMN IF NOT EXISTS resume_replaced_at timestamptz;

ALTER TABLE public.interview_settings
  ADD COLUMN IF NOT EXISTS minimum_download_mbps numeric NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS minimum_upload_mbps numeric NOT NULL DEFAULT 10;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS calendly_event_uri text,
  ADD COLUMN IF NOT EXISTS calendly_invitee_uri text;

CREATE UNIQUE INDEX IF NOT EXISTS appointments_calendly_invitee_unique
  ON public.appointments (calendly_invitee_uri)
  WHERE calendly_invitee_uri IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.retake_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  session_hash text,
  expires_at timestamptz NOT NULL,
  session_expires_at timestamptz,
  used_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.retake_access_tokens TO service_role;
ALTER TABLE public.retake_access_tokens ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS retake_access_tokens_application_idx
  ON public.retake_access_tokens (application_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS retake_access_tokens_session_hash_unique
  ON public.retake_access_tokens (session_hash)
  WHERE session_hash IS NOT NULL;

ALTER TABLE public.work_references
  DROP CONSTRAINT IF EXISTS work_references_slot_check;
ALTER TABLE public.work_references
  ADD CONSTRAINT work_references_slot_check CHECK (slot BETWEEN 1 AND 5);