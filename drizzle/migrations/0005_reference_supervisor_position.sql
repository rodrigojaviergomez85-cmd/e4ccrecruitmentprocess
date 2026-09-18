ALTER TABLE public.work_references
  ADD COLUMN IF NOT EXISTS supervisor_position text;