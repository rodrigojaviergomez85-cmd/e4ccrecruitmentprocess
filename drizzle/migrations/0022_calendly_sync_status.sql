ALTER TABLE public.interview_settings ADD COLUMN IF NOT EXISTS calendly_last_sync_result jsonb;
ALTER TABLE public.interview_settings ADD COLUMN IF NOT EXISTS calendly_last_sync_error text;
ALTER TABLE public.interview_settings ADD COLUMN IF NOT EXISTS calendly_last_attempt_at timestamptz;
CREATE INDEX IF NOT EXISTS appointments_starts_at_idx ON public.appointments (starts_at);
CREATE INDEX IF NOT EXISTS appointments_calendly_invitee_idx ON public.appointments (calendly_invitee_uri);