CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_active_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
     AND COALESCE((SELECT active FROM public.staff_profiles WHERE user_id = _user_id), true)
$$;

CREATE TABLE public.interview_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'In progress',
  evaluator_id uuid NOT NULL,
  last_edited_by uuid,
  interview_date date,
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  reopened_at timestamptz,
  sections jsonb NOT NULL DEFAULT '{}'::jsonb,
  live_cefr text,
  final_result text,
  not_approved_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  not_approved_other text,
  retake_reason text,
  retake_date date,
  hiring_bonus text,
  last_roleplay_date date,
  comments text,
  red_flags text,
  category_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_score integer,
  compliance_score integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX interview_evaluations_application_uniq ON public.interview_evaluations(application_id);
CREATE INDEX interview_evaluations_evaluator_idx ON public.interview_evaluations(evaluator_id);
CREATE INDEX interview_evaluations_status_idx ON public.interview_evaluations(status);
CREATE TRIGGER interview_evaluations_updated_at BEFORE UPDATE ON public.interview_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT ON public.interview_evaluations TO authenticated;
GRANT ALL ON public.interview_evaluations TO service_role;
ALTER TABLE public.interview_evaluations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active staff can read evaluations" ON public.interview_evaluations
  FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));

CREATE TABLE public.evaluation_verbs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid NOT NULL REFERENCES public.interview_evaluations(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 1,
  verb text NOT NULL,
  correct boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX evaluation_verbs_eval_idx ON public.evaluation_verbs(evaluation_id);
GRANT SELECT ON public.evaluation_verbs TO authenticated;
GRANT ALL ON public.evaluation_verbs TO service_role;
ALTER TABLE public.evaluation_verbs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active staff can read verbs" ON public.evaluation_verbs
  FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));

CREATE TABLE public.evaluation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid NOT NULL REFERENCES public.interview_evaluations(id) ON DELETE CASCADE,
  slot integer NOT NULL DEFAULT 1,
  company text NOT NULL DEFAULT '',
  start_date text NOT NULL DEFAULT '',
  end_date text NOT NULL DEFAULT '',
  position text NOT NULL DEFAULT '',
  hired_to_do text NOT NULL DEFAULT '',
  accomplishment text NOT NULL DEFAULT '',
  biggest_mistake text NOT NULL DEFAULT '',
  supervisor_name text NOT NULL DEFAULT '',
  supervisor_contact text NOT NULL DEFAULT '',
  supervisor_rating integer,
  rating_reason text NOT NULL DEFAULT '',
  reason_for_leaving text NOT NULL DEFAULT '',
  gap_explanation text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX evaluation_jobs_slot_uniq ON public.evaluation_jobs(evaluation_id, slot);
GRANT SELECT ON public.evaluation_jobs TO authenticated;
GRANT ALL ON public.evaluation_jobs TO service_role;
ALTER TABLE public.evaluation_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active staff can read job history" ON public.evaluation_jobs
  FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));

CREATE TABLE public.evaluation_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid NOT NULL REFERENCES public.interview_evaluations(id) ON DELETE CASCADE,
  actor_id uuid,
  actor_email text,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX evaluation_audit_eval_idx ON public.evaluation_audit(evaluation_id);
GRANT SELECT ON public.evaluation_audit TO authenticated;
GRANT ALL ON public.evaluation_audit TO service_role;
ALTER TABLE public.evaluation_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active staff can read evaluation audit" ON public.evaluation_audit
  FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));

CREATE TABLE public.scorecard_weights (
  id boolean PRIMARY KEY DEFAULT true,
  weights jsonb NOT NULL DEFAULT '{"english":20,"grammar":20,"teaching":20,"experience":15,"availability":15,"values":10}'::jsonb,
  thresholds jsonb NOT NULL DEFAULT '{"approve":80,"retake":65}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scorecard_weights_single CHECK (id)
);
GRANT SELECT ON public.scorecard_weights TO authenticated;
GRANT ALL ON public.scorecard_weights TO service_role;
ALTER TABLE public.scorecard_weights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active staff can read weights" ON public.scorecard_weights
  FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));
INSERT INTO public.scorecard_weights (id) VALUES (true) ON CONFLICT (id) DO NOTHING;