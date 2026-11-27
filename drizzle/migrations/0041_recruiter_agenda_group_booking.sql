CREATE TABLE public.recruiter_agenda (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
 title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
 category text NOT NULL CHECK (category IN ('interview_coach','interview_admon','calls_coach','calls_admon','references','admin','break')),
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL CHECK (ends_at > starts_at AND ends_at <= starts_at + interval '16 hours'),
 status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','done','canceled')),
 target_count integer NOT NULL DEFAULT 0 CHECK (target_count BETWEEN 0 AND 1000),
 actual_count integer NOT NULL DEFAULT 0 CHECK (actual_count BETWEEN 0 AND 1000),
 connected_count integer NOT NULL DEFAULT 0 CHECK (connected_count BETWEEN 0 AND actual_count),
 notes text NOT NULL DEFAULT '', source_key text UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.recruiter_agenda TO authenticated;
GRANT ALL ON public.recruiter_agenda TO service_role;
ALTER TABLE public.recruiter_agenda ENABLE ROW LEVEL SECURITY;
CREATE POLICY agenda_read ON public.recruiter_agenda FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'recruitment'));
CREATE POLICY agenda_insert ON public.recruiter_agenda FOR INSERT TO authenticated WITH CHECK (source_key IS NULL AND (public.has_role(auth.uid(),'admin') OR (user_id=auth.uid() AND public.has_role(auth.uid(),'recruitment'))));
CREATE POLICY agenda_update ON public.recruiter_agenda FOR UPDATE TO authenticated USING (source_key IS NULL AND (public.has_role(auth.uid(),'admin') OR (user_id=auth.uid() AND public.has_role(auth.uid(),'recruitment')))) WITH CHECK (source_key IS NULL AND (public.has_role(auth.uid(),'admin') OR (user_id=auth.uid() AND public.has_role(auth.uid(),'recruitment'))));
CREATE POLICY agenda_delete ON public.recruiter_agenda FOR DELETE TO authenticated USING (source_key IS NULL AND (public.has_role(auth.uid(),'admin') OR (user_id=auth.uid() AND public.has_role(auth.uid(),'recruitment'))));
CREATE INDEX agenda_user_time ON public.recruiter_agenda(user_id,starts_at);
CREATE FUNCTION public.capture_agenda_interview_segment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE delta integer; candidate_name text;
BEGIN
 delta := coalesce(NEW.handle_seconds,0)-coalesce(OLD.handle_seconds,0);
 IF OLD.timer_started_at IS NULL OR OLD.timer_active_user_id IS NULL OR delta<=0 OR delta>5400 THEN RETURN NEW; END IF;
 SELECT full_name INTO candidate_name FROM public.applications WHERE id=NEW.application_id;
 INSERT INTO public.recruiter_agenda(user_id,title,category,starts_at,ends_at,status,source_key)
 VALUES(OLD.timer_active_user_id,left(coalesce(candidate_name,'Entrevista Coach'),200),'interview_coach',OLD.timer_started_at,OLD.timer_started_at+make_interval(secs=>delta),'done',TG_TABLE_NAME||':'||NEW.id||':'||OLD.timer_started_at) ON CONFLICT(source_key) DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_agenda_interview_segment() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER agenda_interview_segment AFTER UPDATE OF handle_seconds ON public.interview_evaluations FOR EACH ROW EXECUTE FUNCTION public.capture_agenda_interview_segment();
CREATE TRIGGER agenda_manager_segment AFTER UPDATE OF handle_seconds ON public.manager_evaluations FOR EACH ROW EXECUTE FUNCTION public.capture_agenda_interview_segment();
ALTER TABLE public.interview_settings ADD COLUMN native_booking_enabled boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.interview_settings.native_booking_enabled IS 'Native candidate booking rollout switch; old Calendly appointments remain readable.';
-- Advisory locks serialize both candidate bookings and shared slot capacity; failed reservations roll back rescheduling.
DROP INDEX IF EXISTS public.appointments_slot_unique;
CREATE OR REPLACE FUNCTION public.book_appointment(_application_id uuid,_interviewer_id uuid,_starts_at timestamptz,_ends_at timestamptz,_candidate_timezone text,_meeting_link text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _id uuid; _capacity integer; _existing uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(_application_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended(_starts_at::text,1));
 SELECT max_per_slot INTO _capacity FROM public.interview_settings WHERE id=true;
 SELECT id INTO _existing FROM public.appointments WHERE application_id=_application_id AND status IN ('Scheduled','Confirmed') AND starts_at=_starts_at LIMIT 1;
 IF _existing IS NOT NULL THEN RETURN _existing; END IF;
 IF (SELECT count(*) FROM public.appointments WHERE status IN ('Scheduled','Confirmed') AND starts_at=_starts_at AND application_id<>_application_id)>=_capacity THEN RAISE EXCEPTION 'That time is full. Please pick another slot.'; END IF;
 UPDATE public.appointments SET status='Rescheduled',updated_at=now() WHERE application_id=_application_id AND status IN ('Scheduled','Confirmed');
 INSERT INTO public.appointments(application_id,interviewer_id,starts_at,ends_at,candidate_timezone,meeting_link) VALUES(_application_id,_interviewer_id,_starts_at,_ends_at,_candidate_timezone,_meeting_link) RETURNING id INTO _id;
 RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.book_appointment(uuid,uuid,timestamptz,timestamptz,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.book_appointment(uuid,uuid,timestamptz,timestamptz,text,text) TO service_role;