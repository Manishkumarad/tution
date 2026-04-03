-- Foreign keys to coachings
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_coaching') THEN
    ALTER TABLE users ADD CONSTRAINT fk_users_coaching
      FOREIGN KEY (coaching_id) REFERENCES coachings(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_refresh_tokens_coaching') THEN
    ALTER TABLE refresh_tokens ADD CONSTRAINT fk_refresh_tokens_coaching
      FOREIGN KEY (coaching_id) REFERENCES coachings(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_fee_plans_coaching') THEN
    ALTER TABLE fee_plans ADD CONSTRAINT fk_fee_plans_coaching
      FOREIGN KEY (coaching_id) REFERENCES coachings(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_students_coaching') THEN
    ALTER TABLE students ADD CONSTRAINT fk_students_coaching
      FOREIGN KEY (coaching_id) REFERENCES coachings(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_student_fee_accounts_coaching') THEN
    ALTER TABLE student_fee_accounts ADD CONSTRAINT fk_student_fee_accounts_coaching
      FOREIGN KEY (coaching_id) REFERENCES coachings(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_payments_coaching') THEN
    ALTER TABLE payments ADD CONSTRAINT fk_payments_coaching
      FOREIGN KEY (coaching_id) REFERENCES coachings(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_payment_logs_coaching') THEN
    ALTER TABLE payment_logs ADD CONSTRAINT fk_payment_logs_coaching
      FOREIGN KEY (coaching_id) REFERENCES coachings(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_attendance_coaching') THEN
    ALTER TABLE attendance ADD CONSTRAINT fk_attendance_coaching
      FOREIGN KEY (coaching_id) REFERENCES coachings(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_notifications_coaching') THEN
    ALTER TABLE notifications ADD CONSTRAINT fk_notifications_coaching
      FOREIGN KEY (coaching_id) REFERENCES coachings(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_notification_templates_coaching') THEN
    ALTER TABLE notification_templates ADD CONSTRAINT fk_notification_templates_coaching
      FOREIGN KEY (coaching_id) REFERENCES coachings(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_qr_scan_events_coaching') THEN
    ALTER TABLE qr_scan_events ADD CONSTRAINT fk_qr_scan_events_coaching
      FOREIGN KEY (coaching_id) REFERENCES coachings(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Unique keys for tenant-safe composite foreign keys
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_coachings_code') THEN
    ALTER TABLE coachings ADD CONSTRAINT uq_coachings_code UNIQUE (code);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_coachings_email') THEN
    ALTER TABLE coachings ADD CONSTRAINT uq_coachings_email UNIQUE (email);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_users_coaching_id_id') THEN
    ALTER TABLE users ADD CONSTRAINT uq_users_coaching_id_id UNIQUE (coaching_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_users_coaching_email') THEN
    ALTER TABLE users ADD CONSTRAINT uq_users_coaching_email UNIQUE (coaching_id, email);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_fee_plans_coaching_id_id') THEN
    ALTER TABLE fee_plans ADD CONSTRAINT uq_fee_plans_coaching_id_id UNIQUE (coaching_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_fee_plans_coaching_name') THEN
    ALTER TABLE fee_plans ADD CONSTRAINT uq_fee_plans_coaching_name UNIQUE (coaching_id, name);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_students_coaching_id_id') THEN
    ALTER TABLE students ADD CONSTRAINT uq_students_coaching_id_id UNIQUE (coaching_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_students_coaching_student_code') THEN
    ALTER TABLE students ADD CONSTRAINT uq_students_coaching_student_code UNIQUE (coaching_id, student_code);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_student_fee_accounts_coaching_id_id') THEN
    ALTER TABLE student_fee_accounts ADD CONSTRAINT uq_student_fee_accounts_coaching_id_id UNIQUE (coaching_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_student_fee_accounts_coaching_student') THEN
    ALTER TABLE student_fee_accounts ADD CONSTRAINT uq_student_fee_accounts_coaching_student UNIQUE (coaching_id, student_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_payments_coaching_id_id') THEN
    ALTER TABLE payments ADD CONSTRAINT uq_payments_coaching_id_id UNIQUE (coaching_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_attendance_coaching_student_date') THEN
    ALTER TABLE attendance ADD CONSTRAINT uq_attendance_coaching_student_date UNIQUE (coaching_id, student_id, attendance_date);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_notification_templates_scope') THEN
    ALTER TABLE notification_templates ADD CONSTRAINT uq_notification_templates_scope
      UNIQUE (coaching_id, channel, template_key, language);
  END IF;
END $$;

-- Domain checks
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_users_role') THEN
    ALTER TABLE users ADD CONSTRAINT ck_users_role
      CHECK (role IN ('admin', 'faculty', 'receptionist'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_fee_plans_fee_type') THEN
    ALTER TABLE fee_plans ADD CONSTRAINT ck_fee_plans_fee_type
      CHECK (fee_type IN ('full', 'half', 'monthly'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_fee_plans_amount_total') THEN
    ALTER TABLE fee_plans ADD CONSTRAINT ck_fee_plans_amount_total
      CHECK (amount_total >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_fee_plans_due_day') THEN
    ALTER TABLE fee_plans ADD CONSTRAINT ck_fee_plans_due_day
      CHECK (due_day_of_month IS NULL OR due_day_of_month BETWEEN 1 AND 28);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_students_status') THEN
    ALTER TABLE students ADD CONSTRAINT ck_students_status
      CHECK (status IN ('active', 'inactive'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_sfa_amounts') THEN
    ALTER TABLE student_fee_accounts ADD CONSTRAINT ck_sfa_amounts
      CHECK (total_amount >= 0 AND paid_amount >= 0 AND due_amount >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_sfa_status') THEN
    ALTER TABLE student_fee_accounts ADD CONSTRAINT ck_sfa_status
      CHECK (status IN ('paid', 'partial', 'due', 'overdue'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_payments_amount') THEN
    ALTER TABLE payments ADD CONSTRAINT ck_payments_amount
      CHECK (amount > 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_payments_method') THEN
    ALTER TABLE payments ADD CONSTRAINT ck_payments_method
      CHECK (method IN ('cash', 'upi', 'card', 'netbanking', 'razorpay'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_payments_payment_mode') THEN
    ALTER TABLE payments ADD CONSTRAINT ck_payments_payment_mode
      CHECK (payment_mode IN ('full', 'partial', 'monthly'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_payments_status') THEN
    ALTER TABLE payments ADD CONSTRAINT ck_payments_status
      CHECK (status IN ('created', 'success', 'failed', 'refunded'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_attendance_source') THEN
    ALTER TABLE attendance ADD CONSTRAINT ck_attendance_source
      CHECK (source IN ('qr', 'manual'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_attendance_status') THEN
    ALTER TABLE attendance ADD CONSTRAINT ck_attendance_status
      CHECK (status IN ('present', 'late', 'denied'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_notifications_channel') THEN
    ALTER TABLE notifications ADD CONSTRAINT ck_notifications_channel
      CHECK (channel IN ('email', 'sms', 'whatsapp'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_notifications_status') THEN
    ALTER TABLE notifications ADD CONSTRAINT ck_notifications_status
      CHECK (status IN ('queued', 'sent', 'failed'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_notification_templates_channel') THEN
    ALTER TABLE notification_templates ADD CONSTRAINT ck_notification_templates_channel
      CHECK (channel IN ('email', 'sms', 'whatsapp'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_qr_scan_events_outcome') THEN
    ALTER TABLE qr_scan_events ADD CONSTRAINT ck_qr_scan_events_outcome
      CHECK (outcome IN ('allowed', 'denied'));
  END IF;
END $$;

-- Composite tenant-safe references
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_refresh_tokens_user_tenant') THEN
    ALTER TABLE refresh_tokens ADD CONSTRAINT fk_refresh_tokens_user_tenant
      FOREIGN KEY (coaching_id, user_id) REFERENCES users(coaching_id, id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_students_fee_plan_tenant') THEN
    ALTER TABLE students ADD CONSTRAINT fk_students_fee_plan_tenant
      FOREIGN KEY (coaching_id, fee_plan_id) REFERENCES fee_plans(coaching_id, id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_students_teacher_tenant') THEN
    ALTER TABLE students ADD CONSTRAINT fk_students_teacher_tenant
      FOREIGN KEY (coaching_id, teacher_id) REFERENCES users(coaching_id, id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sfa_student_tenant') THEN
    ALTER TABLE student_fee_accounts ADD CONSTRAINT fk_sfa_student_tenant
      FOREIGN KEY (coaching_id, student_id) REFERENCES students(coaching_id, id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sfa_fee_plan_tenant') THEN
    ALTER TABLE student_fee_accounts ADD CONSTRAINT fk_sfa_fee_plan_tenant
      FOREIGN KEY (coaching_id, fee_plan_id) REFERENCES fee_plans(coaching_id, id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_payments_student_tenant') THEN
    ALTER TABLE payments ADD CONSTRAINT fk_payments_student_tenant
      FOREIGN KEY (coaching_id, student_id) REFERENCES students(coaching_id, id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_payments_fee_account_tenant') THEN
    ALTER TABLE payments ADD CONSTRAINT fk_payments_fee_account_tenant
      FOREIGN KEY (coaching_id, fee_account_id) REFERENCES student_fee_accounts(coaching_id, id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_payments_created_by_tenant') THEN
    ALTER TABLE payments ADD CONSTRAINT fk_payments_created_by_tenant
      FOREIGN KEY (coaching_id, created_by) REFERENCES users(coaching_id, id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_payment_logs_payment_tenant') THEN
    ALTER TABLE payment_logs ADD CONSTRAINT fk_payment_logs_payment_tenant
      FOREIGN KEY (coaching_id, payment_id) REFERENCES payments(coaching_id, id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_attendance_student_tenant') THEN
    ALTER TABLE attendance ADD CONSTRAINT fk_attendance_student_tenant
      FOREIGN KEY (coaching_id, student_id) REFERENCES students(coaching_id, id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_attendance_scanned_by_tenant') THEN
    ALTER TABLE attendance ADD CONSTRAINT fk_attendance_scanned_by_tenant
      FOREIGN KEY (coaching_id, scanned_by) REFERENCES users(coaching_id, id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_notifications_student_tenant') THEN
    ALTER TABLE notifications ADD CONSTRAINT fk_notifications_student_tenant
      FOREIGN KEY (coaching_id, student_id) REFERENCES students(coaching_id, id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_qr_scan_events_student_tenant') THEN
    ALTER TABLE qr_scan_events ADD CONSTRAINT fk_qr_scan_events_student_tenant
      FOREIGN KEY (coaching_id, student_id) REFERENCES students(coaching_id, id) ON DELETE CASCADE;
  END IF;
END $$;

-- RLS policies
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
  USING (coaching_id IS NULL OR coaching_id = current_setting('app.coaching_id', true)::BIGINT)
  WITH CHECK (coaching_id IS NULL OR coaching_id = current_setting('app.coaching_id', true)::BIGINT);

DROP POLICY IF EXISTS tenant_isolation_qr_scan_events ON qr_scan_events;
CREATE POLICY tenant_isolation_qr_scan_events ON qr_scan_events
  USING (coaching_id = current_setting('app.coaching_id', true)::BIGINT)
  WITH CHECK (coaching_id = current_setting('app.coaching_id', true)::BIGINT);

DROP POLICY IF EXISTS tenant_isolation_refresh_tokens ON refresh_tokens;
CREATE POLICY tenant_isolation_refresh_tokens ON refresh_tokens
  USING (coaching_id = current_setting('app.coaching_id', true)::BIGINT)
  WITH CHECK (coaching_id = current_setting('app.coaching_id', true)::BIGINT);
