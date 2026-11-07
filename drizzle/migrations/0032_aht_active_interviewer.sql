ALTER TABLE public.interview_evaluations ADD COLUMN timer_active_user_id uuid;
ALTER TABLE public.manager_evaluations ADD COLUMN timer_active_user_id uuid;
COMMENT ON COLUMN public.interview_evaluations.timer_active_user_id IS 'Current running segment controller; timer_owner_id remains original AHT attribution.';
COMMENT ON COLUMN public.manager_evaluations.timer_active_user_id IS 'Current running segment controller; timer_owner_id remains original AHT attribution.';
UPDATE public.interview_evaluations SET timer_active_user_id = timer_owner_id WHERE timer_started_at IS NOT NULL AND timer_ended_at IS NULL;
UPDATE public.manager_evaluations SET timer_active_user_id = timer_owner_id WHERE timer_started_at IS NOT NULL AND timer_ended_at IS NULL;