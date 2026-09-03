CREATE TABLE IF NOT EXISTS public.staff_profiles (
  user_id uuid PRIMARY KEY,
  full_name text NOT NULL DEFAULT '',
  email text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT false,
  last_login_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.staff_profiles TO authenticated;
GRANT ALL ON public.staff_profiles TO service_role;
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read own profile" ON public.staff_profiles;
CREATE POLICY "staff read own profile" ON public.staff_profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR private.is_admin(auth.uid()));

DROP TRIGGER IF EXISTS staff_profiles_updated_at ON public.staff_profiles;
CREATE TRIGGER staff_profiles_updated_at BEFORE UPDATE ON public.staff_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.staff_profiles (user_id, full_name, email, active)
SELECT DISTINCT ur.user_id,
       COALESCE(u.raw_user_meta_data->>'full_name', ''),
       COALESCE(u.email, ''),
       true
FROM public.user_roles ur
JOIN auth.users u ON u.id = ur.user_id
ON CONFLICT (user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON public.audit_logs (created_at DESC);

GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read audit logs" ON public.audit_logs;
CREATE POLICY "admins read audit logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (private.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION private.is_active_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = _user_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.staff_profiles p
       WHERE p.user_id = _user_id AND p.active = false
     );
$$;

REVOKE ALL ON FUNCTION private.is_active_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_active_staff(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.is_active_staff(_user_id);
$$;

CREATE OR REPLACE FUNCTION private.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = _user_id AND r.role = 'admin'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.staff_profiles p
    WHERE p.user_id = _user_id AND p.active = false
  );
$$;