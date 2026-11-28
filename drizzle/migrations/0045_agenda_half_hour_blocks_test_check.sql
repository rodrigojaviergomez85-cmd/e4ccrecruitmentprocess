CREATE OR REPLACE FUNCTION public.capture_agenda_interview_segment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE delta integer; candidate_name text; bucket timestamptz; seg_end timestamptz;
BEGIN
 delta := coalesce(NEW.handle_seconds,0)-coalesce(OLD.handle_seconds,0);
 IF OLD.timer_started_at IS NULL OR OLD.timer_active_user_id IS NULL OR delta<=0 OR delta>5400 THEN RETURN NEW; END IF;
 IF coalesce(to_jsonb(NEW)->>'is_test','false')='true' THEN RETURN NEW; END IF;
 SELECT full_name INTO candidate_name FROM public.applications WHERE id=NEW.application_id;
 bucket := to_timestamp(floor(extract(epoch FROM OLD.timer_started_at)/1800)*1800);
 seg_end := OLD.timer_started_at+make_interval(secs=>delta);
 INSERT INTO public.recruiter_agenda(user_id,title,category,starts_at,ends_at,status,source_key)
 VALUES(OLD.timer_active_user_id,left(coalesce(candidate_name,'Entrevista Coach'),200),'interview_coach',OLD.timer_started_at,seg_end,'done',
   TG_TABLE_NAME||':'||NEW.id||':'||OLD.timer_active_user_id||':'||to_char(bucket AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI'))
 ON CONFLICT(source_key) DO UPDATE SET
   starts_at=least(recruiter_agenda.starts_at,EXCLUDED.starts_at),
   ends_at=least(greatest(recruiter_agenda.ends_at,EXCLUDED.ends_at),least(recruiter_agenda.starts_at,EXCLUDED.starts_at)+interval '16 hours'),
   updated_at=now();
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_agenda_interview_segment() FROM PUBLIC,anon,authenticated;