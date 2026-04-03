CREATE OR REPLACE VIEW admin_coaching_overview AS
SELECT
  c.id AS coaching_id,
  c.name AS coaching_name,
  c.code AS coaching_code,
  c.email AS coaching_email,
  c.phone AS coaching_phone,
  c.plan_type,
  c.max_students,
  c.is_active AS coaching_active,
  c.created_at AS coaching_created_at,
  u.id AS admin_user_id,
  u.full_name AS admin_name,
  u.email AS admin_email,
  u.phone AS admin_phone,
  u.last_login_at AS admin_last_login_at,
  COALESCE(s.student_count, 0) AS total_students,
  COALESCE(p.total_collected, 0::numeric) AS total_collected,
  COALESCE(f.pending_amount, 0::numeric) AS total_pending
FROM coachings c
LEFT JOIN LATERAL (
  SELECT id, full_name, email, phone, last_login_at
  FROM users
  WHERE coaching_id = c.id AND role = 'admin'
  ORDER BY id ASC
  LIMIT 1
) u ON TRUE
LEFT JOIN LATERAL (
  SELECT COUNT(*)::int AS student_count
  FROM students
  WHERE coaching_id = c.id
) s ON TRUE
LEFT JOIN LATERAL (
  SELECT SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END)::numeric AS total_collected
  FROM payments
  WHERE coaching_id = c.id
) p ON TRUE
LEFT JOIN LATERAL (
  SELECT SUM(due_amount)::numeric AS pending_amount
  FROM student_fee_accounts
  WHERE coaching_id = c.id
) f ON TRUE;
