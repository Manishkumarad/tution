CREATE INDEX IF NOT EXISTS idx_users_coaching_role ON users (coaching_id, role);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens (coaching_id, user_id);

CREATE INDEX IF NOT EXISTS idx_students_coaching_name ON students (coaching_id, full_name);
CREATE INDEX IF NOT EXISTS idx_students_coaching_class ON students (coaching_id, class_name);
CREATE INDEX IF NOT EXISTS idx_students_coaching_status ON students (coaching_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_coaching_qr_token ON students (coaching_id, qr_token);

CREATE INDEX IF NOT EXISTS idx_fee_accounts_coaching_status ON student_fee_accounts (coaching_id, status);
CREATE INDEX IF NOT EXISTS idx_fee_accounts_coaching_due_date ON student_fee_accounts (coaching_id, next_due_date);

CREATE INDEX IF NOT EXISTS idx_payments_coaching_student_time ON payments (coaching_id, student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_coaching_status_time ON payments (coaching_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_gateway_order ON payments (gateway_order_id);

CREATE INDEX IF NOT EXISTS idx_attendance_coaching_date ON attendance (coaching_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_notifications_coaching_status_retry ON notifications (coaching_id, status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_notifications_coaching_created ON notifications (coaching_id, created_at DESC);
