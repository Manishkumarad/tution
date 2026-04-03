ALTER TABLE coachings
  ALTER COLUMN max_students SET DEFAULT 5;

UPDATE coachings
SET plan_type = 'starter',
    max_students = 5
WHERE plan_type = 'starter'
  AND (max_students IS NULL OR max_students > 5);

ALTER TABLE coachings
  ADD COLUMN IF NOT EXISTS membership_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS membership_valid_till TIMESTAMPTZ;
