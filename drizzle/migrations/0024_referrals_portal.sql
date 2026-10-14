CREATE TABLE public.referrers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL DEFAULT '',
  email text,
  phone text NOT NULL DEFAULT '',
  email_validated_at timestamptz,
  email_validated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX referrers_email_key ON public.referrers (email) WHERE email IS NOT NULL;
GRANT ALL ON public.referrers TO service_role;
ALTER TABLE public.referrers ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid REFERENCES public.referrers(id) ON DELETE SET NULL,
  application_id uuid REFERENCES public.applications(id) ON DELETE SET NULL,
  referred_name text NOT NULL DEFAULT '',
  referred_email text,
  referred_phone text NOT NULL DEFAULT '',
  lob text NOT NULL DEFAULT '',
  branch text NOT NULL DEFAULT '',
  comments text NOT NULL DEFAULT '',
  bonus_status text NOT NULL DEFAULT 'En validación',
  disputed boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'manual',
  source_sheet text,
  source_row integer,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at timestamptz,
  confirmation_sent_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX referrals_source_row_key ON public.referrals (source_sheet, source_row) WHERE source_sheet IS NOT NULL;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER referrers_updated_at BEFORE UPDATE ON public.referrers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER referrals_updated_at BEFORE UPDATE ON public.referrals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.referral_access_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX referral_access_codes_email_idx ON public.referral_access_codes (email, created_at DESC);
GRANT ALL ON public.referral_access_codes TO service_role;
ALTER TABLE public.referral_access_codes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.referral_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES public.referrers(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.referral_sessions TO service_role;
ALTER TABLE public.referral_sessions ENABLE ROW LEVEL SECURITY;