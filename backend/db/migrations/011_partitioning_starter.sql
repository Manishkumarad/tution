-- Partitioning starter for million-scale growth.
-- This migration creates partitioned shadow tables for gradual cutover.
-- No application writes are redirected automatically in this step.

CREATE TABLE IF NOT EXISTS payments_p (
  LIKE payments INCLUDING DEFAULTS INCLUDING GENERATED INCLUDING IDENTITY INCLUDING STORAGE INCLUDING COMMENTS
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS attendance_p (
  LIKE attendance INCLUDING DEFAULTS INCLUDING GENERATED INCLUDING IDENTITY INCLUDING STORAGE INCLUDING COMMENTS
) PARTITION BY RANGE (created_at);

-- Current month + next month partitions (example windows)
DO $$
DECLARE
  month_start TIMESTAMPTZ := date_trunc('month', NOW());
  next_month TIMESTAMPTZ := date_trunc('month', NOW()) + INTERVAL '1 month';
  next_next_month TIMESTAMPTZ := date_trunc('month', NOW()) + INTERVAL '2 month';
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS payments_p_%s PARTITION OF payments_p FOR VALUES FROM (%L) TO (%L);',
    to_char(month_start, 'YYYYMM'), month_start, next_month
  );

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS payments_p_%s PARTITION OF payments_p FOR VALUES FROM (%L) TO (%L);',
    to_char(next_month, 'YYYYMM'), next_month, next_next_month
  );

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS attendance_p_%s PARTITION OF attendance_p FOR VALUES FROM (%L) TO (%L);',
    to_char(month_start, 'YYYYMM'), month_start, next_month
  );

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS attendance_p_%s PARTITION OF attendance_p FOR VALUES FROM (%L) TO (%L);',
    to_char(next_month, 'YYYYMM'), next_month, next_next_month
  );
END $$;

CREATE INDEX IF NOT EXISTS idx_payments_p_coaching_created ON payments_p (coaching_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_p_coaching_date ON attendance_p (coaching_id, attendance_date);
