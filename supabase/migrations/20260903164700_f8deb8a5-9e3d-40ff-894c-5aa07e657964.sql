-- Helper: admin check
CREATE OR REPLACE FUNCTION private.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin');
$$;
REVOKE ALL ON FUNCTION private.is_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_admin(uuid) TO authenticated, service_role;

-- Countries
CREATE TABLE public.countries (
  code text PRIMARY KEY,
  name text NOT NULL,
  dial_code text NOT NULL,
  flag text NOT NULL DEFAULT '',
  timezone text NOT NULL DEFAULT 'America/El_Salvador',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.countries TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.countries TO authenticated;
GRANT ALL ON public.countries TO service_role;
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads active countries" ON public.countries FOR SELECT TO anon, authenticated USING (active);
CREATE POLICY "staff read all countries" ON public.countries FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "admins manage countries" ON public.countries FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE TRIGGER countries_updated_at BEFORE UPDATE ON public.countries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Cities
CREATE TABLE public.cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL REFERENCES public.countries(code) ON DELETE CASCADE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country_code, name)
);
CREATE INDEX cities_country_idx ON public.cities(country_code);
GRANT SELECT ON public.cities TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.cities TO authenticated;
GRANT ALL ON public.cities TO service_role;
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads active cities" ON public.cities FOR SELECT TO anon, authenticated USING (active);
CREATE POLICY "staff read all cities" ON public.cities FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "admins manage cities" ON public.cities FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE TRIGGER cities_updated_at BEFORE UPDATE ON public.cities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Applications: standardized location + phone + consent
ALTER TABLE public.applications
  ADD COLUMN country_code text REFERENCES public.countries(code),
  ADD COLUMN city_id uuid REFERENCES public.cities(id),
  ADD COLUMN city_other text,
  ADD COLUMN phone_e164 text,
  ADD COLUMN phone_country_code text,
  ADD COLUMN contact_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN consent_at timestamptz;
CREATE INDEX applications_country_code_idx ON public.applications(country_code);

-- Staff country permissions
CREATE TABLE public.staff_countries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  country_code text NOT NULL REFERENCES public.countries(code) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, country_code)
);
GRANT SELECT ON public.staff_countries TO authenticated;
GRANT ALL ON public.staff_countries TO service_role;
ALTER TABLE public.staff_countries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read own countries" ON public.staff_countries FOR SELECT TO authenticated USING (auth.uid() = user_id OR private.is_admin(auth.uid()));

-- Country visibility helper: admins see all; recruiters with no assignment see all; otherwise assigned only
CREATE OR REPLACE FUNCTION private.can_view_country(_user_id uuid, _country_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.is_admin(_user_id)
    OR NOT EXISTS (SELECT 1 FROM public.staff_countries WHERE user_id = _user_id)
    OR EXISTS (SELECT 1 FROM public.staff_countries WHERE user_id = _user_id AND country_code = _country_code);
$$;
REVOKE ALL ON FUNCTION private.can_view_country(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_view_country(uuid, text) TO authenticated, service_role;

-- Seed countries
INSERT INTO public.countries (code, name, dial_code, flag, timezone, sort_order) VALUES
  ('SV', 'El Salvador', '+503', '🇸🇻', 'America/El_Salvador', 10),
  ('GT', 'Guatemala', '+502', '🇬🇹', 'America/Guatemala', 20),
  ('NI', 'Nicaragua', '+505', '🇳🇮', 'America/Managua', 30),
  ('HN', 'Honduras', '+504', '🇭🇳', 'America/Tegucigalpa', 40),
  ('MX', 'Mexico', '+52', '🇲🇽', 'America/Mexico_City', 50),
  ('CO', 'Colombia', '+57', '🇨🇴', 'America/Bogota', 60),
  ('OTHER', 'Other', '+1', '🌎', 'America/El_Salvador', 999);

-- Seed cities
INSERT INTO public.cities (country_code, name, sort_order) VALUES
  ('SV','San Salvador',10),('SV','Santa Ana',20),('SV','San Miguel',30),('SV','Soyapango',40),('SV','Santa Tecla',50),('SV','Antiguo Cuscatlán',60),('SV','Mejicanos',70),('SV','Apopa',80),('SV','Sonsonate',90),('SV','Ahuachapán',100),('SV','Usulután',110),('SV','La Libertad',120),
  ('GT','Guatemala City',10),('GT','Mixco',20),('GT','Villa Nueva',30),('GT','Quetzaltenango',40),('GT','Escuintla',50),('GT','Antigua Guatemala',60),('GT','Chimaltenango',70),('GT','Huehuetenango',80),('GT','Cobán',90),('GT','Petén',100),
  ('NI','Managua',10),('NI','León',20),('NI','Masaya',30),('NI','Granada',40),('NI','Chinandega',50),('NI','Estelí',60),('NI','Matagalpa',70),('NI','Jinotega',80),
  ('HN','Tegucigalpa',10),('HN','San Pedro Sula',20),('HN','La Ceiba',30),('HN','Choloma',40),('HN','El Progreso',50),('HN','Comayagua',60),('HN','Choluteca',70),('HN','Danlí',80),
  ('MX','Mexico City',10),('MX','Guadalajara',20),('MX','Monterrey',30),('MX','Puebla',40),('MX','Tijuana',50),('MX','Querétaro',60),('MX','Mérida',70),('MX','León',80),('MX','Toluca',90),('MX','Cancún',100),
  ('CO','Bogotá',10),('CO','Medellín',20),('CO','Cali',30),('CO','Barranquilla',40),('CO','Cartagena',50),('CO','Bucaramanga',60),('CO','Pereira',70),('CO','Manizales',80),('CO','Cúcuta',90),('CO','Santa Marta',100);