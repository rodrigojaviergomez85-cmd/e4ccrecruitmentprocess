CREATE TABLE public.training_requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lob_group text NOT NULL,
  branch text NOT NULL DEFAULT '',
  wave_start date,
  request_date date,
  spot_type text NOT NULL DEFAULT 'NEEDED',
  agreed_schedule text NOT NULL DEFAULT '',
  comments text NOT NULL DEFAULT '',
  filled_application_id uuid UNIQUE REFERENCES public.applications(id) ON DELETE SET NULL,
  filled_at timestamptz,
  filled_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.training_requisitions TO service_role;
ALTER TABLE public.training_requisitions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER training_requisitions_updated_at BEFORE UPDATE ON public.training_requisitions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();