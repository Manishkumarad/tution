const express = require('express');
const { query } = require('../../config/db');
const { requireAuth } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenant');
const { requireRole } = require('../../middleware/rbac');
const { getPagination } = require('../../utils/pagination');

const router = express.Router();
router.use(requireAuth, requireTenant);

router.get('/students/:id/fee-status', requireRole(['admin', 'faculty', 'receptionist']), async (req, res, next) => {
  try {
    const { coachingId } = req.tenant;
    const studentId = Number(req.params.id);

    const result = await query(
      `SELECT s.id AS student_id, s.full_name, s.parent_name, s.parent_phone,
              sfa.total_amount, sfa.paid_amount, sfa.due_amount,
              sfa.status AS fee_status, sfa.next_due_date, sfa.valid_till
       FROM students s
       LEFT JOIN student_fee_accounts sfa ON sfa.student_id = s.id AND sfa.coaching_id = s.coaching_id
       WHERE s.coaching_id = $1 AND s.id = $2`,
      [coachingId, studentId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: 'Student not found' });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    return next(err);
  }
});

router.get('/students/:id/attendance', requireRole(['admin', 'faculty', 'receptionist']), async (req, res, next) => {
  try {
    const { coachingId } = req.tenant;
    const studentId = Number(req.params.id);
    const { page, limit, offset } = getPagination(req.query);

    const result = await query(
      `SELECT attendance_date, entry_time, source, status, deny_reason
       FROM attendance
       WHERE coaching_id = $1 AND student_id = $2
       ORDER BY attendance_date DESC, entry_time DESC
       LIMIT $3 OFFSET $4`,
      [coachingId, studentId, limit, offset]
    );

    return res.json({ page, limit, data: result.rows });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
