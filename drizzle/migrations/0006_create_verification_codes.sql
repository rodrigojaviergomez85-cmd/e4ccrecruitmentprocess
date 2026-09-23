CREATE TABLE IF NOT EXISTS public.verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  application_id uuid REFERENCES public.applications(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  session_hash text,
  expires_at timestamptz NOT NULL,
  session_expires_at timestamptz,
  used_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.verification_codes TO service_role;
ALTER TABLE public.verification_codes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS verification_codes_email_idx
  ON public.verification_codes (email, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS verification_codes_session_hash_unique
  ON public.verification_codes (session_hash)
  WHERE session_hash IS NOT NULL;

COMMENT ON TABLE public.retake_access_tokens IS 'DEPRECATED: replaced by public.verification_codes (email-scoped verification codes).';