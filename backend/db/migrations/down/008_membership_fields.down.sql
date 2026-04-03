ALTER TABLE coachings
  DROP COLUMN IF EXISTS membership_started_at,
  DROP COLUMN IF EXISTS membership_valid_till;

ALTER TABLE coachings
  ALTER COLUMN max_students SET DEFAULT 1000;
