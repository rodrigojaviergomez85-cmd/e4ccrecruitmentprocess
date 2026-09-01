CREATE TYPE public.app_role AS ENUM ('admin','recruiter');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION private.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','recruiter'))
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_staff(uuid) TO authenticated, service_role;

CREATE TABLE public.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submit_token uuid NOT NULL DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  country text NOT NULL,
  city text NOT NULL,
  teaching_experience text NOT NULL,
  taught_children boolean NOT NULL,
  status text NOT NULL DEFAULT 'new',
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX applications_created_at_idx ON public.applications (created_at DESC);
CREATE INDEX applications_status_idx ON public.applications (status);
CREATE INDEX applications_country_idx ON public.applications (country);
GRANT SELECT, UPDATE ON public.applications TO authenticated;
GRANT ALL ON public.applications TO service_role;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read applications" ON public.applications FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "staff update applications" ON public.applications FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

CREATE TABLE public.videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  slot smallint NOT NULL,
  question text NOT NULL,
  video_path text NOT NULL,
  audio_path text,
  duration_seconds numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, slot)
);
CREATE INDEX videos_application_idx ON public.videos (application_id);
GRANT SELECT ON public.videos TO authenticated;
GRANT ALL ON public.videos TO service_role;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read videos" ON public.videos FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

CREATE TABLE public.transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  slot smallint NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (video_id)
);
CREATE INDEX transcripts_application_idx ON public.transcripts (application_id);
GRANT SELECT ON public.transcripts TO authenticated;
GRANT ALL ON public.transcripts TO service_role;
ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read transcripts" ON public.transcripts FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

CREATE TABLE public.ai_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'pending',
  error_message text,
  cefr text,
  overall_score integer,
  scores jsonb,
  strengths jsonb,
  areas_to_review jsonb,
  grammar_evidence jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id)
);
GRANT SELECT ON public.ai_evaluations TO authenticated;
GRANT ALL ON public.ai_evaluations TO service_role;
ALTER TABLE public.ai_evaluations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read evaluations" ON public.ai_evaluations FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER applications_updated_at BEFORE UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ai_evaluations_updated_at BEFORE UPDATE ON public.ai_evaluations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "staff read candidate media" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'candidate-media' AND private.is_staff(auth.uid()));