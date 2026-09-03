CREATE TABLE public.recruitment_progress (
  application_id uuid PRIMARY KEY REFERENCES public.applications(id) ON DELETE CASCADE,
  device_confirmed boolean NOT NULL DEFAULT false,
  grammar_test_status text NOT NULL DEFAULT 'Not started',
  grammar_test_confirmed boolean NOT NULL DEFAULT false,
  grammar_test_score integer,
  grammar_test_verified boolean NOT NULL DEFAULT false,
  grammar_test_notes text NOT NULL DEFAULT '',
  grammar_topics_confirmed boolean NOT NULL DEFAULT false,
  resume_path text,
  resume_filename text,
  resume_uploaded_at timestamp with time zone,
  references_declaration boolean NOT NULL DEFAULT false,
  sample_class_confirmed boolean NOT NULL DEFAULT false,
  scheduling_status text NOT NULL DEFAULT 'Locked',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.recruitment_progress TO authenticated;
GRANT ALL ON public.recruitment_progress TO service_role;
ALTER TABLE public.recruitment_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read recruitment progress" ON public.recruitment_progress
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "staff update recruitment progress" ON public.recruitment_progress
  FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

CREATE TRIGGER recruitment_progress_updated_at BEFORE UPDATE ON public.recruitment_progress
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.work_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  slot smallint NOT NULL,
  company text NOT NULL DEFAULT '',
  position text NOT NULL DEFAULT '',
  start_date date,
  end_date date,
  currently_working boolean NOT NULL DEFAULT false,
  supervisor_name text NOT NULL DEFAULT '',
  supervisor_position text NOT NULL DEFAULT '',
  supervisor_phone text NOT NULL DEFAULT '',
  supervisor_email text NOT NULL DEFAULT '',
  country_code text,
  reason_for_leaving text NOT NULL DEFAULT '',
  may_contact boolean NOT NULL DEFAULT true,
  verification_status text NOT NULL DEFAULT 'Pending verification',
  verification_notes text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (application_id, slot)
);

GRANT SELECT, UPDATE ON public.work_references TO authenticated;
GRANT ALL ON public.work_references TO service_role;
ALTER TABLE public.work_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read work references" ON public.work_references
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "staff update work references" ON public.work_references
  FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

CREATE TRIGGER work_references_updated_at BEFORE UPDATE ON public.work_references
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();