CREATE INDEX IF NOT EXISTS idx_payments_coaching_paidat_success
  ON payments (coaching_id, paid_at DESC)
  WHERE status = 'success';

CREATE INDEX IF NOT EXISTS idx_students_coaching_active
  ON students (coaching_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_fee_accounts_coaching_due
  ON student_fee_accounts (coaching_id, due_amount)
  WHERE due_amount > 0;
