-- Interview scheduling (Phase 3) — additive only

CREATE TABLE public.interview_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  timezone text NOT NULL DEFAULT 'America/El_Salvador',
  duration_minutes integer NOT NULL DEFAULT 15,
  buffer_minutes integer NOT NULL DEFAULT 5,
  min_notice_hours integer NOT NULL DEFAULT 12,
  max_booking_days integer NOT NULL DEFAULT 21,
  max_per_slot integer NOT NULL DEFAULT 1,
  weekly_hours jsonb NOT NULL DEFAULT '{"1":[["09:00","17:00"]],"2":[["09:00","17:00"]],"3":[["09:00","17:00"]],"4":[["09:00","17:00"]],"5":[["09:00","16:00"]]}'::jsonb,
  default_meeting_link text NOT NULL DEFAULT '',
  reminder_offsets_minutes integer[] NOT NULL DEFAULT ARRAY[1440, 60],
  token_expiry_days integer NOT NULL DEFAULT 14,
  allow_reapply_days integer NOT NULL DEFAULT 90,
  assignment_mode text NOT NULL DEFAULT 'round_robin' CHECK (assignment_mode IN ('round_robin','country')),
  templates jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.interview_settings TO authenticated;
GRANT ALL ON public.interview_settings TO service_role;
ALTER TABLE public.interview_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read interview settings" ON public.interview_settings FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "admins manage interview settings" ON public.interview_settings FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE TRIGGER interview_settings_updated_at BEFORE UPDATE ON public.interview_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.interview_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TABLE public.interviewers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL,
  meeting_link text NOT NULL DEFAULT '',
  country_codes text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interviewers TO authenticated;
GRANT ALL ON public.interviewers TO service_role;
ALTER TABLE public.interviewers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read interviewers" ON public.interviewers FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "admins manage interviewers" ON public.interviewers FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE TRIGGER interviewers_updated_at BEFORE UPDATE ON public.interviewers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.interviewer_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interviewer_id uuid NOT NULL REFERENCES public.interviewers(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interviewer_availability TO authenticated;
GRANT ALL ON public.interviewer_availability TO service_role;
ALTER TABLE public.interviewer_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read availability" ON public.interviewer_availability FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "admins manage availability" ON public.interviewer_availability FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

CREATE TABLE public.blocked_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interviewer_id uuid REFERENCES public.interviewers(id) ON DELETE CASCADE,
  blocked_on date NOT NULL,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocked_dates TO authenticated;
GRANT ALL ON public.blocked_dates TO service_role;
ALTER TABLE public.blocked_dates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read blocked dates" ON public.blocked_dates FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "admins manage blocked dates" ON public.blocked_dates FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  interviewer_id uuid REFERENCES public.interviewers(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Scheduled','Confirmed','Completed','No-show','Rescheduled','Canceled')),
  candidate_timezone text NOT NULL DEFAULT 'America/El_Salvador',
  meeting_link text NOT NULL DEFAULT '',
  reschedule_count integer NOT NULL DEFAULT 0,
  notes text,
  canceled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read appointments" ON public.appointments FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "staff update appointments" ON public.appointments FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE TRIGGER appointments_updated_at BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
-- Prevents double booking at the database level, not only in the UI.
CREATE UNIQUE INDEX appointments_slot_unique ON public.appointments (interviewer_id, starts_at) WHERE status IN ('Scheduled','Confirmed');
CREATE INDEX appointments_application_idx ON public.appointments (application_id);
CREATE INDEX appointments_starts_at_idx ON public.appointments (starts_at);

CREATE TABLE public.scheduling_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  purpose text NOT NULL DEFAULT 'schedule' CHECK (purpose IN ('schedule','manage')),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.scheduling_tokens TO service_role;
ALTER TABLE public.scheduling_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read scheduling tokens" ON public.scheduling_tokens FOR SELECT TO authenticated USING (private.is_admin(auth.uid()));

CREATE TABLE public.reminder_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email','whatsapp')),
  kind text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  sent_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped')),
  attempts integer NOT NULL DEFAULT 0,
  provider_response text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.reminder_logs TO authenticated;
GRANT ALL ON public.reminder_logs TO service_role;
ALTER TABLE public.reminder_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read reminder logs" ON public.reminder_logs FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE TRIGGER reminder_logs_updated_at BEFORE UPDATE ON public.reminder_logs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE UNIQUE INDEX reminder_logs_unique ON public.reminder_logs (appointment_id, channel, kind);

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS eligibility_override boolean,
  ADD COLUMN IF NOT EXISTS eligibility_note text,
  ADD COLUMN IF NOT EXISTS eligibility_override_by uuid,
  ADD COLUMN IF NOT EXISTS eligibility_override_at timestamptz;

-- Transactional booking: exactly one candidate can win a slot.
CREATE OR REPLACE FUNCTION public.book_appointment(
  _application_id uuid,
  _interviewer_id uuid,
  _starts_at timestamptz,
  _ends_at timestamptz,
  _candidate_timezone text,
  _meeting_link text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _id uuid;
BEGIN
  UPDATE public.appointments
     SET status = 'Rescheduled', updated_at = now()
   WHERE application_id = _application_id AND status IN ('Scheduled','Confirmed');

  INSERT INTO public.appointments (application_id, interviewer_id, starts_at, ends_at, candidate_timezone, meeting_link)
  VALUES (_application_id, _interviewer_id, _starts_at, _ends_at, _candidate_timezone, _meeting_link)
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;
REVOKE ALL ON FUNCTION public.book_appointment(uuid, uuid, timestamptz, timestamptz, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.book_appointment(uuid, uuid, timestamptz, timestamptz, text, text) TO service_role;