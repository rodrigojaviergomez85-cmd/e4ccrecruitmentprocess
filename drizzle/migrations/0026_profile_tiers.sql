ALTER TABLE public.interview_evaluations
  ADD COLUMN IF NOT EXISTS profile_tier text CHECK (profile_tier IN ('A','B','C')),
  ADD COLUMN IF NOT EXISTS profile_tier_reason text,
  ADD COLUMN IF NOT EXISTS profile_tier_by uuid,
  ADD COLUMN IF NOT EXISTS profile_tier_at timestamptz;
ALTER TABLE public.manager_evaluations
  ADD COLUMN IF NOT EXISTS profile_tier text CHECK (profile_tier IN ('A','B','C')),
  ADD COLUMN IF NOT EXISTS profile_tier_reason text,
  ADD COLUMN IF NOT EXISTS profile_tier_by uuid,
  ADD COLUMN IF NOT EXISTS profile_tier_at timestamptz;