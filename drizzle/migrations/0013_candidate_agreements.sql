CREATE TABLE public.candidate_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  manager_evaluation_id uuid,
  kind text NOT NULL CHECK (kind IN ('online','onsite')),
  template_file text NOT NULL,
  template_version text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  storage_path text,
  document_status text NOT NULL DEFAULT 'pending' CHECK (document_status IN ('pending','generated','failed','superseded')),
  email_status text NOT NULL DEFAULT 'pending' CHECK (email_status IN ('pending','pending_agreement','sent','failed','uncertain')),
  error_message text,
  is_test boolean NOT NULL DEFAULT false,
  signed boolean NOT NULL DEFAULT false,
  generated_at timestamptz,
  sent_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.candidate_agreements TO authenticated;
GRANT ALL ON public.candidate_agreements TO service_role;
ALTER TABLE public.candidate_agreements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active staff can read agreements" ON public.candidate_agreements
  FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE INDEX candidate_agreements_app_idx ON public.candidate_agreements(application_id, created_at DESC);
CREATE TRIGGER candidate_agreements_updated_at BEFORE UPDATE ON public.candidate_agreements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
-- Agreement files are only read/written server-side with the service role; no client policies on storage.objects.