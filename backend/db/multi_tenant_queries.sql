-- Multi-tenant query cookbook
-- Always set tenant context per request/session:
--   SET LOCAL app.coaching_id = '<<coaching_id>>';
-- and also pass coaching_id in WHERE clauses for explicitness.

-- =====================================================
-- AUTH / USER QUERIES
-- =====================================================

-- Login by coaching code + email (prevents cross-tenant same-email mixup)
SELECT u.id, u.coaching_id, u.full_name, u.email, u.role, u.password_hash
FROM users u
JOIN coachings c ON c.id = u.coaching_id
WHERE c.code = $1
  AND u.email = $2
  AND u.is_active = TRUE
LIMIT 1;

-- Create faculty/reception user inside tenant
INSERT INTO users (coaching_id, full_name, email, phone, password_hash, role)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, coaching_id, full_name, email, role;

-- =====================================================
-- STUDENTS (1000+ per coaching)
-- =====================================================

-- Paginated list with search and status
SELECT id, student_code, full_name, phone, class_name, status, fee_plan_id, created_at
FROM students
WHERE coaching_id = $1
  AND ($2::text IS NULL OR full_name ILIKE '%' || $2 || '%')
  AND ($3::text IS NULL OR status = $3)
ORDER BY id DESC
LIMIT $4 OFFSET $5;

-- Total count for pagination
SELECT COUNT(*)::int AS total
FROM students
WHERE coaching_id = $1
  AND ($2::text IS NULL OR full_name ILIKE '%' || $2 || '%')
  AND ($3::text IS NULL OR status = $3);

-- Student details with fee account
SELECT s.*, sfa.total_amount, sfa.paid_amount, sfa.due_amount, sfa.status AS fee_status,
       sfa.next_due_date, sfa.valid_till
FROM students s
LEFT JOIN student_fee_accounts sfa
  ON sfa.coaching_id = s.coaching_id
 AND sfa.student_id = s.id
WHERE s.coaching_id = $1
  AND s.id = $2;

-- Add student + fee account in one transaction
BEGIN;

INSERT INTO students (
  coaching_id, student_code, full_name, phone, parent_name, parent_phone,
  class_name, fee_plan_id, teacher_id, admission_date, photo_url
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::date, CURRENT_DATE), $11)
RETURNING id;

-- Use returned student id in application code as :student_id
INSERT INTO student_fee_accounts (
  coaching_id, student_id, fee_plan_id, total_amount, paid_amount, due_amount,
  next_due_date, status, valid_till
)
VALUES ($1, :student_id, $8, $12, 0, $12, $13, 'due', $13);

COMMIT;

-- =====================================================
-- FEE / PAYMENTS
-- =====================================================

-- Create fee plan
INSERT INTO fee_plans (
  coaching_id, name, fee_type, amount_total, installment_count, billing_cycle_days, due_day_of_month
)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- Lock fee account before payment update
SELECT *
FROM student_fee_accounts
WHERE coaching_id = $1
  AND student_id = $2
FOR UPDATE;

-- Insert manual payment
INSERT INTO payments (
  coaching_id, student_id, fee_account_id, amount, method, payment_mode, status,
  transaction_ref, paid_at, created_by
)
VALUES ($1, $2, $3, $4, $5, $6, 'success', $7, NOW(), $8)
RETURNING *;

-- Update fee account after payment
UPDATE student_fee_accounts
SET paid_amount = $1,
    due_amount = $2,
    status = $3,
    valid_till = $4,
    updated_at = NOW()
WHERE coaching_id = $5
  AND student_id = $6
RETURNING *;

-- Payment history by student
SELECT p.*
FROM payments p
WHERE p.coaching_id = $1
  AND p.student_id = $2
ORDER BY p.created_at DESC
LIMIT $3 OFFSET $4;

-- =====================================================
-- ATTENDANCE / QR ENTRY
-- =====================================================

-- Find student by QR token within tenant
SELECT s.id, s.full_name, s.class_name, s.photo_url,
       sfa.status AS fee_status, sfa.valid_till
FROM students s
LEFT JOIN student_fee_accounts sfa
  ON sfa.coaching_id = s.coaching_id
 AND sfa.student_id = s.id
WHERE s.coaching_id = $1
  AND s.qr_token = $2
LIMIT 1;

-- Check duplicate same-day entry
SELECT id
FROM attendance
WHERE coaching_id = $1
  AND student_id = $2
  AND attendance_date = CURRENT_DATE
LIMIT 1;

-- Mark attendance (idempotent)
INSERT INTO attendance (
  coaching_id, student_id, attendance_date, source, scanned_by, status
)
VALUES ($1, $2, CURRENT_DATE, 'qr', $3, 'present')
ON CONFLICT (coaching_id, student_id, attendance_date)
DO NOTHING;

-- =====================================================
-- DASHBOARD / ANALYTICS
-- =====================================================

-- Summary cards
SELECT
  (SELECT COUNT(*)::int FROM students WHERE coaching_id = $1 AND status = 'active') AS total_students,
  (SELECT COUNT(*)::int FROM student_fee_accounts WHERE coaching_id = $1 AND status = 'paid') AS paid_students,
  (SELECT COUNT(*)::int FROM student_fee_accounts WHERE coaching_id = $1 AND status IN ('due','partial','overdue')) AS pending_students,
  (SELECT COALESCE(SUM(due_amount), 0)::numeric(12,2) FROM student_fee_accounts WHERE coaching_id = $1) AS pending_dues,
  (SELECT COUNT(*)::int FROM attendance WHERE coaching_id = $1 AND attendance_date = CURRENT_DATE) AS today_entries,
  (SELECT COALESCE(SUM(amount), 0)::numeric(12,2)
   FROM payments
   WHERE coaching_id = $1
     AND status = 'success'
     AND date_trunc('month', paid_at) = date_trunc('month', NOW())) AS month_revenue;

-- Revenue trend by month
SELECT date_trunc('month', paid_at)::date AS month,
       COALESCE(SUM(amount), 0)::numeric(12,2) AS revenue
FROM payments
WHERE coaching_id = $1
  AND status = 'success'
  AND ($2::date IS NULL OR paid_at::date >= $2::date)
  AND ($3::date IS NULL OR paid_at::date <= $3::date)
GROUP BY date_trunc('month', paid_at)
ORDER BY month;

-- =====================================================
-- REMINDERS / NOTIFICATIONS
-- =====================================================

-- Due in 3 days, due today, overdue
SELECT sfa.coaching_id, sfa.student_id, sfa.next_due_date, sfa.due_amount,
       s.full_name, s.parent_name, s.parent_phone
FROM student_fee_accounts sfa
JOIN students s
  ON s.coaching_id = sfa.coaching_id
 AND s.id = sfa.student_id
WHERE sfa.coaching_id = $1
  AND sfa.due_amount > 0
  AND (
    sfa.next_due_date = CURRENT_DATE + INTERVAL '3 days'
    OR sfa.next_due_date = CURRENT_DATE
    OR sfa.next_due_date < CURRENT_DATE
  );

-- Queue notification
INSERT INTO notifications (
  coaching_id, student_id, channel, template_key, recipient, payload, status
)
VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'queued')
RETURNING id;

-- Fetch ready notifications
SELECT *
FROM notifications
WHERE coaching_id = $1
  AND (
    status = 'queued'
    OR (status = 'failed' AND next_retry_at <= NOW() AND retry_count < 5)
  )
ORDER BY created_at ASC
LIMIT $2;

-- =====================================================
-- RAZORPAY WEBHOOK IDEMPOTENCY
-- =====================================================

-- Find payment by gateway order
SELECT *
FROM payments
WHERE coaching_id = $1
  AND gateway_order_id = $2
FOR UPDATE;

-- Check if webhook event already processed
SELECT id
FROM payment_logs
WHERE coaching_id = $1
  AND payment_id = $2
  AND event_type = 'webhook_event'
  AND payload->>'event_id' = $3
LIMIT 1;

-- Store webhook processing log
INSERT INTO payment_logs (coaching_id, payment_id, event_type, payload)
VALUES ($1, $2, 'webhook_event', $3::jsonb);
