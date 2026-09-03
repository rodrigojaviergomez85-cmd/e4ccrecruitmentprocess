ALTER TABLE public.recruitment_progress
  ADD COLUMN IF NOT EXISTS work_modality text CHECK (work_modality IN ('online','onsite')),
  ADD COLUMN IF NOT EXISTS internet_speed_mbps numeric,
  ADD COLUMN IF NOT EXISTS system_info_path text,
  ADD COLUMN IF NOT EXISTS system_info_filename text,
  ADD COLUMN IF NOT EXISTS system_info_uploaded_at timestamptz;

ALTER TABLE public.work_references
  ALTER COLUMN supervisor_position DROP NOT NULL,
  ALTER COLUMN country_code DROP NOT NULL;