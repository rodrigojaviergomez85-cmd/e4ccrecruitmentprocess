ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS callcenter_experience_level text NOT NULL DEFAULT 'No experience';

UPDATE public.applications
SET callcenter_experience_level = CASE WHEN callcenter_experience THEN '1–2 years' ELSE 'No experience' END
WHERE callcenter_experience_level = 'No experience';