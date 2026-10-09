ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS calendly_event_name text, ADD COLUMN IF NOT EXISTS calendly_host_name text;
ALTER TABLE public.interview_settings ADD COLUMN IF NOT EXISTS calendly_last_synced_at timestamptz;
ALTER TABLE public.applications ALTER COLUMN taught_children DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS appointments_calendly_invitee_uri_key ON public.appointments (calendly_invitee_uri) WHERE calendly_invitee_uri IS NOT NULL;