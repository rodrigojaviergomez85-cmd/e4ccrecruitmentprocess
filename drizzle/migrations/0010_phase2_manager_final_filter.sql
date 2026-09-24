ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS assigned_manager_id uuid,
  ADD COLUMN IF NOT EXISTS recruitment_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_contact_at timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawn_stage text,
  ADD COLUMN IF NOT EXISTS withdrawn_reason text;

CREATE TABLE public.manager_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL DEFAULT 1,
  manager_id uuid,
  evaluator_id uuid,
  status text NOT NULL DEFAULT 'In progress',
  demo_topic text,
  scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  checks jsonb NOT NULL DEFAULT '{}'::jsonb,
  critical_red_flag boolean NOT NULL DEFAULT false,
  red_flags text,
  internal_comments text,
  improvement_areas text,
  total_score integer,
  gates jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommendation text,
  final_decision text,
  decision_stage text NOT NULL DEFAULT 'manager_final_filter',
  decision_reason text,
  eligible_again_date date,
  appointment_at timestamptz,
  no_show_marked_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  decided_by uuid,
  decided_at timestamptz,
  reopened_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, attempt_number)
);
GRANT SELECT ON public.manager_evaluations TO authenticated;
GRANT ALL ON public.manager_evaluations TO service_role;
ALTER TABLE public.manager_evaluations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read manager evaluations in their countries" ON public.manager_evaluations
  FOR SELECT TO authenticated USING (private.can_view_application(auth.uid(), application_id));
CREATE TRIGGER manager_evaluations_updated_at BEFORE UPDATE ON public.manager_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.candidate_action_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  purpose text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.candidate_action_tokens TO service_role;
ALTER TABLE public.candidate_action_tokens ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.candidate_emails ADD COLUMN IF NOT EXISTS manager_evaluation_id uuid REFERENCES public.manager_evaluations(id) ON DELETE SET NULL;