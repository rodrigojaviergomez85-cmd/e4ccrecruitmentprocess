-- Staff = recruitment, manager or admin (legacy evaluator/recruiter still count as recruitment). Viewer and applicant do not.
CREATE OR REPLACE FUNCTION private.is_active_staff(_user_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = _user_id
                 AND r.role::text IN ('admin','recruitment','manager','evaluator','recruiter'))
     AND NOT EXISTS (SELECT 1 FROM public.staff_profiles p WHERE p.user_id = _user_id AND p.active = false);
$$;

CREATE OR REPLACE FUNCTION public.is_active_staff(_user_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT private.is_active_staff(_user_id) $$;

-- Strict country scope: admin sees all; others only assigned countries (none assigned = none).
CREATE OR REPLACE FUNCTION private.can_view_country(_user_id uuid, _country_code text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT private.is_admin(_user_id)
    OR (private.is_active_staff(_user_id) AND EXISTS (
         SELECT 1 FROM public.staff_countries WHERE user_id = _user_id AND country_code = _country_code));
$$;

CREATE OR REPLACE FUNCTION private.can_view_application(_user_id uuid, _application_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.applications a WHERE a.id = _application_id
                 AND private.can_view_country(_user_id, a.country_code));
$$;

DROP POLICY IF EXISTS "staff read applications" ON public.applications;
CREATE POLICY "staff read applications" ON public.applications FOR SELECT TO authenticated
  USING (private.can_view_country(auth.uid(), country_code));
DROP POLICY IF EXISTS "staff update applications" ON public.applications;
CREATE POLICY "staff update applications" ON public.applications FOR UPDATE TO authenticated
  USING (private.can_view_country(auth.uid(), country_code));

DROP POLICY IF EXISTS "staff read evaluations" ON public.ai_evaluations;
CREATE POLICY "staff read evaluations" ON public.ai_evaluations FOR SELECT TO authenticated
  USING (private.can_view_application(auth.uid(), application_id));
DROP POLICY IF EXISTS "staff read appointments" ON public.appointments;
CREATE POLICY "staff read appointments" ON public.appointments FOR SELECT TO authenticated
  USING (private.can_view_application(auth.uid(), application_id));
DROP POLICY IF EXISTS "staff update appointments" ON public.appointments;
CREATE POLICY "staff update appointments" ON public.appointments FOR UPDATE TO authenticated
  USING (private.can_view_application(auth.uid(), application_id));
DROP POLICY IF EXISTS "Staff can read candidate emails" ON public.candidate_emails;
CREATE POLICY "Staff can read candidate emails" ON public.candidate_emails FOR SELECT TO authenticated
  USING (private.can_view_application(auth.uid(), application_id));
DROP POLICY IF EXISTS "Active staff can read evaluations" ON public.interview_evaluations;
CREATE POLICY "Active staff can read evaluations" ON public.interview_evaluations FOR SELECT TO authenticated
  USING (private.can_view_application(auth.uid(), application_id));
DROP POLICY IF EXISTS "staff read recruitment progress" ON public.recruitment_progress;
CREATE POLICY "staff read recruitment progress" ON public.recruitment_progress FOR SELECT TO authenticated
  USING (private.can_view_application(auth.uid(), application_id));
DROP POLICY IF EXISTS "staff update recruitment progress" ON public.recruitment_progress;
CREATE POLICY "staff update recruitment progress" ON public.recruitment_progress FOR UPDATE TO authenticated
  USING (private.can_view_application(auth.uid(), application_id));
DROP POLICY IF EXISTS "staff read transcripts" ON public.transcripts;
CREATE POLICY "staff read transcripts" ON public.transcripts FOR SELECT TO authenticated
  USING (private.can_view_application(auth.uid(), application_id));
DROP POLICY IF EXISTS "staff read videos" ON public.videos;
CREATE POLICY "staff read videos" ON public.videos FOR SELECT TO authenticated
  USING (private.can_view_application(auth.uid(), application_id));
DROP POLICY IF EXISTS "staff read work references" ON public.work_references;
CREATE POLICY "staff read work references" ON public.work_references FOR SELECT TO authenticated
  USING (private.can_view_application(auth.uid(), application_id));
DROP POLICY IF EXISTS "staff update work references" ON public.work_references;
CREATE POLICY "staff update work references" ON public.work_references FOR UPDATE TO authenticated
  USING (private.can_view_application(auth.uid(), application_id));

-- Decision tracking on interviews
ALTER TABLE public.interview_evaluations
  ADD COLUMN IF NOT EXISTS decision_stage text,
  ADD COLUMN IF NOT EXISTS decided_by uuid,
  ADD COLUMN IF NOT EXISTS decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS decision_reason text;

-- Extended audit
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS actor_role text,
  ADD COLUMN IF NOT EXISTS application_id uuid,
  ADD COLUMN IF NOT EXISTS old_value jsonb,
  ADD COLUMN IF NOT EXISTS new_value jsonb;
CREATE INDEX IF NOT EXISTS audit_logs_application_idx ON public.audit_logs(application_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON public.audit_logs(created_at DESC);