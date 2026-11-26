CREATE TABLE public.admon_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  cv_link text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT '',
  branch text NOT NULL DEFAULT '',
  position text NOT NULL DEFAULT '',
  stage text NOT NULL DEFAULT 'screening',
  screening jsonb NOT NULL DEFAULT '{}'::jsonb,
  operations jsonb NOT NULL DEFAULT '{}'::jsonb,
  technical jsonb NOT NULL DEFAULT '{}'::jsonb,
  screening_by uuid,
  screening_decision text,
  screening_at timestamptz,
  operations_interviewer uuid,
  operations_decision text,
  operations_at timestamptz,
  technical_interviewer uuid,
  technical_decision text,
  technical_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.admon_candidates TO service_role;
ALTER TABLE public.admon_candidates ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER admon_candidates_updated BEFORE UPDATE ON public.admon_candidates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX admon_candidates_stage_idx ON public.admon_candidates(stage, created_at DESC);