const express = require('express');
const { query } = require('../../config/db');
const { requireAuth } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenant');
const { requireRole } = require('../../middleware/rbac');
const { getJson, setJson } = require('../../services/cache');
const { paymentsTable, attendanceTable } = require('../../services/partition-cutover');

const router = express.Router();
router.use(requireAuth, requireTenant);

const DASHBOARD_CACHE_TTL_SEC = 20;

router.get('/summary', requireRole(['admin', 'faculty', 'receptionist']), async (req, res, next) => {
  try {
    const { coachingId } = req.tenant;
    const cacheKey = `summary:${coachingId}`;
    const cached = await getJson(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const monthEnd = new Date(monthStart);
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
    const paymentsReadTable = paymentsTable();
    const attendanceReadTable = attendanceTable();

    const [studentsRes, feeRes, attendanceRes, revenueRes, todayStudentsRes, todayFeeRes] = await Promise.all([
      query(
        `SELECT COUNT(*)::int AS total_students
         FROM students WHERE coaching_id = $1 AND status = 'active'`,
        [coachingId]
      ),
      query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'paid')::int AS paid_students,
           COUNT(*) FILTER (WHERE status IN ('due', 'partial', 'overdue'))::int AS pending_students,
           COALESCE(SUM(due_amount), 0)::numeric(12,2) AS pending_dues
         FROM student_fee_accounts WHERE coaching_id = $1`,
        [coachingId]
      ),
      query(
        `SELECT COUNT(*)::int AS today_entries
         FROM ${attendanceReadTable} WHERE coaching_id = $1 AND attendance_date = CURRENT_DATE`,
        [coachingId]
      ),
      query(
        `SELECT COALESCE(SUM(amount), 0)::numeric(12,2) AS month_revenue
         FROM ${paymentsReadTable}
         WHERE coaching_id = $1
           AND status = 'success'
           AND paid_at >= $2
           AND paid_at < $3`,
        [coachingId, monthStart, monthEnd]
      ),
      query(
        `SELECT COUNT(*)::int AS today_new_students
         FROM students
         WHERE coaching_id = $1
           AND created_at::date = CURRENT_DATE`,
        [coachingId]
      ),
      query(
        `SELECT COALESCE(SUM(amount), 0)::numeric(12,2) AS today_fee_collection
         FROM ${paymentsReadTable}
         WHERE coaching_id = $1
           AND status = 'success'
           AND paid_at::date = CURRENT_DATE`,
        [coachingId]
      )
    ]);

    const response = {
      total_students: studentsRes.rows[0].total_students,
      paid_students: feeRes.rows[0].paid_students,
      pending_students: feeRes.rows[0].pending_students,
      pending_dues: feeRes.rows[0].pending_dues,
      today_entries: attendanceRes.rows[0].today_entries,
      month_revenue: revenueRes.rows[0].month_revenue,
      today_new_students: todayStudentsRes.rows[0].today_new_students,
      today_fee_collection: todayFeeRes.rows[0].today_fee_collection
    };

    await setJson(cacheKey, response, DASHBOARD_CACHE_TTL_SEC);
    return res.json(response);
  } catch (err) {
    return next(err);
  }
});

router.get('/revenue', requireRole(['admin', 'faculty']), async (req, res, next) => {
  try {
    const { coachingId } = req.tenant;
    const from = req.query.from || null;
    const to = req.query.to || null;
    const paymentsReadTable = paymentsTable();
    const cacheKey = `revenue:${coachingId}:${from || 'na'}:${to || 'na'}`;
    const cached = await getJson(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const result = await query(
      `SELECT date_trunc('month', paid_at)::date AS month,
              COALESCE(SUM(amount), 0)::numeric(12,2) AS revenue
       FROM ${paymentsReadTable}
       WHERE coaching_id = $1
         AND status = 'success'
         AND ($2::date IS NULL OR paid_at >= $2::date)
         AND ($3::date IS NULL OR paid_at < ($3::date + INTERVAL '1 day'))
       GROUP BY date_trunc('month', paid_at)
       ORDER BY month`,
      [coachingId, from, to]
    );

    await setJson(cacheKey, result.rows, DASHBOARD_CACHE_TTL_SEC);
    return res.json(result.rows);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
