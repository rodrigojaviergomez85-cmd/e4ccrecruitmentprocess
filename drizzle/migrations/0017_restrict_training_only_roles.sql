CREATE OR REPLACE FUNCTION private.is_active_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = _user_id AND r.role::text IN ('admin', 'manager', 'recruitment', 'recruiter', 'evaluator'))
     AND NOT EXISTS (SELECT 1 FROM public.staff_profiles p WHERE p.user_id = _user_id AND p.active = false);
$$;