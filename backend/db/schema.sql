CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================
-- Core tenant tables
-- =====================================================

CREATE TABLE IF NOT EXISTS coachings (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  code VARCHAR(40) UNIQUE NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  phone VARCHAR(20),
  payment_upi_id VARCHAR(80),
  payment_qr_url TEXT,
  bank_account_name VARCHAR(150),
  bank_account_number VARCHAR(40),
  bank_ifsc VARCHAR(20),
  bank_name VARCHAR(120),
  plan_type VARCHAR(30) NOT NULL DEFAULT 'starter',
  max_students INTEGER NOT NULL DEFAULT 1000,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  coaching_id BIGINT NOT NULL REFERENCES coachings(id) ON DELETE CASCADE,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(150) NOT NULL,
  phone VARCHAR(20),
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'faculty', 'receptionist')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (coaching_id, id),
  UNIQUE (coaching_id, email)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id BIGSERIAL PRIMARY KEY,
  coaching_id BIGINT NOT NULL REFERENCES coachings(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (coaching_id, user_id) REFERENCES users(coaching_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fee_plans (
  id BIGSERIAL PRIMARY KEY,
  coaching_id BIGINT NOT NULL REFERENCES coachings(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  fee_type VARCHAR(20) NOT NULL CHECK (fee_type IN ('full', 'half', 'monthly')),
  amount_total NUMERIC(12,2) NOT NULL CHECK (amount_total >= 0),
  installment_count INTEGER NOT NULL DEFAULT 1,
  billing_cycle_days INTEGER NOT NULL DEFAULT 30,
  due_day_of_month SMALLINT CHECK (due_day_of_month BETWEEN 1 AND 28),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (coaching_id, id),
  UNIQUE (coaching_id, name)
);

CREATE TABLE IF NOT EXISTS students (
  id BIGSERIAL PRIMARY KEY,
  coaching_id BIGINT NOT NULL REFERENCES coachings(id) ON DELETE CASCADE,
  student_code VARCHAR(40) NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(150),
  photo_url TEXT,
  phone VARCHAR(20),
  parent_name VARCHAR(120),
  parent_phone VARCHAR(20),
  class_name VARCHAR(50),
  fee_plan_id BIGINT,
  teacher_id BIGINT,
  admission_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  qr_token UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (coaching_id, id),
  FOREIGN KEY (coaching_id, fee_plan_id) REFERENCES fee_plans(coaching_id, id) ON DELETE SET NULL,
  FOREIGN KEY (coaching_id, teacher_id) REFERENCES users(coaching_id, id) ON DELETE SET NULL,
  UNIQUE (coaching_id, student_code)
);

CREATE TABLE IF NOT EXISTS student_fee_accounts (
  id BIGSERIAL PRIMARY KEY,
  coaching_id BIGINT NOT NULL REFERENCES coachings(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL,
  fee_plan_id BIGINT NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  due_amount NUMERIC(12,2) NOT NULL CHECK (due_amount >= 0),
  next_due_date DATE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('paid', 'partial', 'due', 'overdue')),
  valid_till DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (coaching_id, id),
  FOREIGN KEY (coaching_id, student_id) REFERENCES students(coaching_id, id) ON DELETE CASCADE,
  FOREIGN KEY (coaching_id, fee_plan_id) REFERENCES fee_plans(coaching_id, id) ON DELETE RESTRICT,
  UNIQUE (coaching_id, student_id)
);

CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  coaching_id BIGINT NOT NULL REFERENCES coachings(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL,
  fee_account_id BIGINT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method VARCHAR(20) NOT NULL CHECK (method IN ('cash', 'upi', 'card', 'netbanking', 'razorpay')),
  payment_mode VARCHAR(20) NOT NULL CHECK (payment_mode IN ('full', 'partial', 'monthly')),
  status VARCHAR(20) NOT NULL CHECK (status IN ('created', 'success', 'failed', 'refunded')),
  transaction_ref VARCHAR(120),
  gateway VARCHAR(30),
  gateway_order_id VARCHAR(120),
  gateway_payment_id VARCHAR(120),
  paid_at TIMESTAMPTZ,
  failure_reason TEXT,
  created_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (coaching_id, id),
  FOREIGN KEY (coaching_id, student_id) REFERENCES students(coaching_id, id) ON DELETE CASCADE,
  FOREIGN KEY (coaching_id, fee_account_id) REFERENCES student_fee_accounts(coaching_id, id) ON DELETE SET NULL,
  FOREIGN KEY (coaching_id, created_by) REFERENCES users(coaching_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS payment_logs (
  id BIGSERIAL PRIMARY KEY,
  coaching_id BIGINT NOT NULL REFERENCES coachings(id) ON DELETE CASCADE,
  payment_id BIGINT NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (coaching_id, payment_id) REFERENCES payments(coaching_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attendance (
  id BIGSERIAL PRIMARY KEY,
  coaching_id BIGINT NOT NULL REFERENCES coachings(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL,
  attendance_date DATE NOT NULL,
  entry_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source VARCHAR(20) NOT NULL CHECK (source IN ('qr', 'manual')),
  scanned_by BIGINT,
  status VARCHAR(20) NOT NULL CHECK (status IN ('present', 'late', 'denied')),
  deny_reason VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (coaching_id, student_id) REFERENCES students(coaching_id, id) ON DELETE CASCADE,
  FOREIGN KEY (coaching_id, scanned_by) REFERENCES users(coaching_id, id) ON DELETE SET NULL,
  UNIQUE (coaching_id, student_id, attendance_date)
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  coaching_id BIGINT NOT NULL REFERENCES coachings(id) ON DELETE CASCADE,
  student_id BIGINT,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
  template_key VARCHAR(40) NOT NULL,
  recipient VARCHAR(150) NOT NULL,
  payload JSONB,
  status VARCHAR(20) NOT NULL CHECK (status IN ('queued', 'sent', 'failed')),
  provider_message_id VARCHAR(120),
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (coaching_id, student_id) REFERENCES students(coaching_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notification_templates (
  id BIGSERIAL PRIMARY KEY,
  coaching_id BIGINT REFERENCES coachings(id) ON DELETE CASCADE,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
  template_key VARCHAR(40) NOT NULL,
  language VARCHAR(10) NOT NULL DEFAULT 'en',
  subject VARCHAR(150),
  body TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (coaching_id, channel, template_key, language)
);

CREATE TABLE IF NOT EXISTS qr_scan_events (
  id BIGSERIAL PRIMARY KEY,
  coaching_id BIGINT NOT NULL REFERENCES coachings(id) ON DELETE CASCADE,
  student_id BIGINT,
  qr_token_hash TEXT NOT NULL,
  scan_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  outcome VARCHAR(20) NOT NULL CHECK (outcome IN ('allowed', 'denied')),
  reason VARCHAR(120),
  FOREIGN KEY (coaching_id, student_id) REFERENCES students(coaching_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS receipts (
  id BIGSERIAL PRIMARY KEY,
  coaching_id BIGINT NOT NULL REFERENCES coachings(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL,
  payment_id BIGINT NOT NULL,
  receipt_number VARCHAR(80) NOT NULL UNIQUE,
  file_path TEXT NOT NULL,
  receipt_url TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (coaching_id, id),
  UNIQUE (coaching_id, payment_id),
  FOREIGN KEY (coaching_id, student_id) REFERENCES students(coaching_id, id) ON DELETE CASCADE,
  FOREIGN KEY (coaching_id, payment_id) REFERENCES payments(coaching_id, id) ON DELETE CASCADE
);

-- =====================================================
-- Indexing strategy for scale
-- =====================================================

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
CREATE INDEX IF NOT EXISTS idx_receipts_coaching_created ON receipts (coaching_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_coaching_student ON receipts (coaching_id, student_id);

-- =====================================================
-- Row level security policies (defense in depth)
-- =====================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_fee_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_scan_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_users ON users;
CREATE POLICY tenant_isolation_users ON users
  USING (coaching_id = current_setting('app.coaching_id', true)::BIGINT)
  WITH CHECK (coaching_id = current_setting('app.coaching_id', true)::BIGINT);

DROP POLICY IF EXISTS tenant_isolation_fee_plans ON fee_plans;
CREATE POLICY tenant_isolation_fee_plans ON fee_plans
  USING (coaching_id = current_setting('app.coaching_id', true)::BIGINT)
  WITH CHECK (coaching_id = current_setting('app.coaching_id', true)::BIGINT);

DROP POLICY IF EXISTS tenant_isolation_students ON students;
CREATE POLICY tenant_isolation_students ON students
  USING (coaching_id = current_setting('app.coaching_id', true)::BIGINT)
  WITH CHECK (coaching_id = current_setting('app.coaching_id', true)::BIGINT);

DROP POLICY IF EXISTS tenant_isolation_fee_accounts ON student_fee_accounts;
CREATE POLICY tenant_isolation_fee_accounts ON student_fee_accounts
  USING (coaching_id = current_setting('app.coaching_id', true)::BIGINT)
  WITH CHECK (coaching_id = current_setting('app.coaching_id', true)::BIGINT);

DROP POLICY IF EXISTS tenant_isolation_payments ON payments;
CREATE POLICY tenant_isolation_payments ON payments
  USING (coaching_id = current_setting('app.coaching_id', true)::BIGINT)
  WITH CHECK (coaching_id = current_setting('app.coaching_id', true)::BIGINT);

DROP POLICY IF EXISTS tenant_isolation_payment_logs ON payment_logs;
CREATE POLICY tenant_isolation_payment_logs ON payment_logs
  USING (coaching_id = current_setting('app.coaching_id', true)::BIGINT)
  WITH CHECK (coaching_id = current_setting('app.coaching_id', true)::BIGINT);

DROP POLICY IF EXISTS tenant_isolation_attendance ON attendance;
CREATE POLICY tenant_isolation_attendance ON attendance
  USING (coaching_id = current_setting('app.coaching_id', true)::BIGINT)
  WITH CHECK (coaching_id = current_setting('app.coaching_id', true)::BIGINT);

DROP POLICY IF EXISTS tenant_isolation_notifications ON notifications;
CREATE POLICY tenant_isolation_notifications ON notifications
  USING (coaching_id = current_setting('app.coaching_id', true)::BIGINT)
  WITH CHECK (coaching_id = current_setting('app.coaching_id', true)::BIGINT);

DROP POLICY IF EXISTS tenant_isolation_notification_templates ON notification_templates;
CREATE POLICY tenant_isolation_notification_templates ON notification_templates
  USING (
    coaching_id IS NULL
    OR coaching_id = current_setting('app.coaching_id', true)::BIGINT
  )
  WITH CHECK (
    coaching_id IS NULL
    OR coaching_id = current_setting('app.coaching_id', true)::BIGINT
  );

DROP POLICY IF EXISTS tenant_isolation_qr_scan_events ON qr_scan_events;
CREATE POLICY tenant_isolation_qr_scan_events ON qr_scan_events
  USING (coaching_id = current_setting('app.coaching_id', true)::BIGINT)
  WITH CHECK (coaching_id = current_setting('app.coaching_id', true)::BIGINT);

DROP POLICY IF EXISTS tenant_isolation_refresh_tokens ON refresh_tokens;
CREATE POLICY tenant_isolation_refresh_tokens ON refresh_tokens
  USING (coaching_id = current_setting('app.coaching_id', true)::BIGINT)
  WITH CHECK (coaching_id = current_setting('app.coaching_id', true)::BIGINT);

DROP POLICY IF EXISTS tenant_isolation_receipts ON receipts;
CREATE POLICY tenant_isolation_receipts ON receipts
  USING (coaching_id = current_setting('app.coaching_id', true)::BIGINT)
  WITH CHECK (coaching_id = current_setting('app.coaching_id', true)::BIGINT);
