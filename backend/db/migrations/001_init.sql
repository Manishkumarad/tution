CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS coachings (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  code VARCHAR(40) NOT NULL,
  email VARCHAR(150) NOT NULL,
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
  coaching_id BIGINT NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(150) NOT NULL,
  phone VARCHAR(20),
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id BIGSERIAL PRIMARY KEY,
  coaching_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fee_plans (
  id BIGSERIAL PRIMARY KEY,
  coaching_id BIGINT NOT NULL,
  name VARCHAR(80) NOT NULL,
  fee_type VARCHAR(20) NOT NULL,
  amount_total NUMERIC(12,2) NOT NULL,
  installment_count INTEGER NOT NULL DEFAULT 1,
  billing_cycle_days INTEGER NOT NULL DEFAULT 30,
  due_day_of_month SMALLINT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS students (
  id BIGSERIAL PRIMARY KEY,
  coaching_id BIGINT NOT NULL,
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
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  qr_token UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_fee_accounts (
  id BIGSERIAL PRIMARY KEY,
  coaching_id BIGINT NOT NULL,
  student_id BIGINT NOT NULL,
  fee_plan_id BIGINT NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_amount NUMERIC(12,2) NOT NULL,
  next_due_date DATE,
  status VARCHAR(20) NOT NULL,
  valid_till DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  coaching_id BIGINT NOT NULL,
  student_id BIGINT NOT NULL,
  fee_account_id BIGINT,
  amount NUMERIC(12,2) NOT NULL,
  method VARCHAR(20) NOT NULL,
  payment_mode VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,
  transaction_ref VARCHAR(120),
  gateway VARCHAR(30),
  gateway_order_id VARCHAR(120),
  gateway_payment_id VARCHAR(120),
  paid_at TIMESTAMPTZ,
  failure_reason TEXT,
  created_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_logs (
  id BIGSERIAL PRIMARY KEY,
  coaching_id BIGINT NOT NULL,
  payment_id BIGINT NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance (
  id BIGSERIAL PRIMARY KEY,
  coaching_id BIGINT NOT NULL,
  student_id BIGINT NOT NULL,
  attendance_date DATE NOT NULL,
  entry_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source VARCHAR(20) NOT NULL,
  scanned_by BIGINT,
  status VARCHAR(20) NOT NULL,
  deny_reason VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  coaching_id BIGINT NOT NULL,
  student_id BIGINT,
  channel VARCHAR(20) NOT NULL,
  template_key VARCHAR(40) NOT NULL,
  recipient VARCHAR(150) NOT NULL,
  payload JSONB,
  status VARCHAR(20) NOT NULL,
  provider_message_id VARCHAR(120),
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_templates (
  id BIGSERIAL PRIMARY KEY,
  coaching_id BIGINT,
  channel VARCHAR(20) NOT NULL,
  template_key VARCHAR(40) NOT NULL,
  language VARCHAR(10) NOT NULL DEFAULT 'en',
  subject VARCHAR(150),
  body TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS qr_scan_events (
  id BIGSERIAL PRIMARY KEY,
  coaching_id BIGINT NOT NULL,
  student_id BIGINT,
  qr_token_hash TEXT NOT NULL,
  scan_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  outcome VARCHAR(20) NOT NULL,
  reason VARCHAR(120)
);
