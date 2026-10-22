CREATE TABLE public.recruitment_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lob text NOT NULL,
  source_sheet text NOT NULL,
  source_row integer NOT NULL,
  lead_created_at timestamptz,
  lead_country text NOT NULL DEFAULT '',
  branch text NOT NULL DEFAULT '',
  full_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  email_norm text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  filtro_lead text NOT NULL DEFAULT '',
  mensaje text NOT NULL DEFAULT '',
  msg_recruiter text NOT NULL DEFAULT '',
  msg_date text NOT NULL DEFAULT '',
  msg_time text NOT NULL DEFAULT '',
  llamada text NOT NULL DEFAULT '',
  call_recruiter text NOT NULL DEFAULT '',
  call_date text NOT NULL DEFAULT '',
  call_time text NOT NULL DEFAULT '',
  interview_date text NOT NULL DEFAULT '',
  interview_result text NOT NULL DEFAULT '',
  comment text NOT NULL DEFAULT '',
  msg_at timestamptz,
  call_at timestamptz,
  edited_in_app_at timestamptz,
  edited_by uuid,
  imported_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_sheet, source_row)
);
CREATE INDEX recruitment_leads_email_idx ON public.recruitment_leads (email_norm);
CREATE INDEX recruitment_leads_lob_idx ON public.recruitment_leads (lob, lead_created_at DESC);
GRANT ALL ON public.recruitment_leads TO service_role;
ALTER TABLE public.recruitment_leads ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER recruitment_leads_updated_at BEFORE UPDATE ON public.recruitment_leads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();