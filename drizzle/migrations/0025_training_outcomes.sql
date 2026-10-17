ALTER TABLE public.training_roster
  ADD COLUMN IF NOT EXISTS incorporation_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS started_at date,
  ADD COLUMN IF NOT EXISTS outcome_at date,
  ADD COLUMN IF NOT EXISTS outcome_reason text,
  ADD COLUMN IF NOT EXISTS canceled_before_start boolean NOT NULL DEFAULT false;

CREATE TABLE public.training_cohort_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  old_wave_start date,
  new_wave_start date,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.training_cohort_changes TO service_role;
ALTER TABLE public.training_cohort_changes ENABLE ROW LEVEL SECURITY;