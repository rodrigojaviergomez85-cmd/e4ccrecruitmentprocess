CREATE TABLE public.admon_leads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_key text NOT NULL UNIQUE, source_row integer NOT NULL,
 full_name text NOT NULL, email text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '', country text NOT NULL DEFAULT '', branch text NOT NULL DEFAULT '', position text NOT NULL DEFAULT 'AGENTE DE VENTAS',
 cv_link text NOT NULL DEFAULT '', video_link text NOT NULL DEFAULT '', presentation_link text NOT NULL DEFAULT '', age text NOT NULL DEFAULT '', experience_time text NOT NULL DEFAULT '', experience text NOT NULL DEFAULT '',
 cv_filter text NOT NULL DEFAULT '', contact_status text NOT NULL DEFAULT '', comments text NOT NULL DEFAULT '', submitted_at timestamptz, imported_at timestamptz NOT NULL DEFAULT now(), candidate_id uuid REFERENCES public.admon_candidates(id)
);
GRANT ALL ON public.admon_leads TO service_role;
ALTER TABLE public.admon_leads ENABLE ROW LEVEL SECURITY;
CREATE INDEX admon_leads_recent ON public.admon_leads(submitted_at DESC);
CREATE INDEX admon_leads_email ON public.admon_leads(email);
ALTER TABLE public.admon_candidates ADD COLUMN source_lead_id uuid REFERENCES public.admon_leads(id);
CREATE UNIQUE INDEX admon_candidate_source_lead ON public.admon_candidates(source_lead_id) WHERE source_lead_id IS NOT NULL;