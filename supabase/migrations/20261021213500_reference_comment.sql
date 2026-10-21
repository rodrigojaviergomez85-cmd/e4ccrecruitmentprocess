ALTER TABLE public.evaluation_jobs ADD COLUMN IF NOT EXISTS reference_comment text NOT NULL DEFAULT '';
