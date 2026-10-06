-- Trainer-only accounts must not inherit the broad staff read access used by RLS.
CREATE OR REPLACE FUNCTION private.is_active_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = _user_id AND r.role::text <> 'trainer')
     AND NOT EXISTS (
       SELECT 1 FROM public.staff_profiles p
       WHERE p.user_id = _user_id AND p.active = false
     );
$$;

CREATE TABLE public.training_roster (
  application_id uuid PRIMARY KEY REFERENCES public.applications(id) ON DELETE CASCADE,
  wave_start date,
  request_date date,
  hiring_date date,
  status text NOT NULL DEFAULT 'RECLUTADO',
  agreed_schedule text NOT NULL DEFAULT '',
  comments text NOT NULL DEFAULT '',
  documents jsonb NOT NULL DEFAULT '{}'::jsonb,
  reference_call text NOT NULL DEFAULT 'pending',
  reference_details text NOT NULL DEFAULT '',
  reference_called_by uuid,
  reference_called_at timestamptz,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.training_roster TO service_role;
ALTER TABLE public.training_roster ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER training_roster_updated_at BEFORE UPDATE ON public.training_roster
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();