-- Intentionally a no-op rollback.
-- We do not drop these columns on rollback to avoid accidental data loss.
SELECT 1;
