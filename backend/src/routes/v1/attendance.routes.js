const express = require('express');
const { z } = require('zod');
const { query } = require('../../config/db');
const { requireAuth } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenant');
const { requireRole } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validate');
const { getPagination } = require('../../utils/pagination');
const { isPassValid } = require('../../services/fee-status');
const { sha256 } = require('../../utils/hash');
const { isDualWriteEnabled, attendanceTable } = require('../../services/partition-cutover');

const router = express.Router();
router.use(requireAuth, requireTenant);

const scanSchema = z.object({
  body: z.object({
    qr_token: z.string().uuid()
  }),
  params: z.any(),
  query: z.any()
});

router.post('/scan', requireRole(['admin', 'faculty', 'receptionist']), validate(scanSchema), async (req, res, next) => {
  try {
    const { coachingId } = req.tenant;
    const { qr_token } = req.validated.body;

    const studentRes = await query(
      `SELECT s.id, s.full_name, s.class_name, s.photo_url,
              sfa.status AS fee_status, sfa.valid_till
       FROM students s
       LEFT JOIN student_fee_accounts sfa ON sfa.student_id = s.id AND sfa.coaching_id = s.coaching_id
       WHERE s.coaching_id = $1 AND s.qr_token = $2`,
      [coachingId, qr_token]
    );

    if (!studentRes.rows[0]) {
      return res.status(404).json({ message: 'Invalid QR token' });
    }

    const student = studentRes.rows[0];
    const duplicateRes = await query(
      `SELECT id FROM attendance
       WHERE coaching_id = $1 AND student_id = $2 AND attendance_date = CURRENT_DATE`,
      [coachingId, student.id]
    );

    let entryResult = 'allowed';
    let reason = 'ok';

    if (duplicateRes.rows[0]) {
      entryResult = 'denied';
      reason = 'duplicate_entry';
    } else if (!isPassValid(student.fee_status, student.valid_till)) {
      entryResult = 'denied';
      reason = 'payment_due';
    }

    await query(
      `INSERT INTO qr_scan_events (coaching_id, student_id, qr_token_hash, outcome, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [coachingId, student.id, sha256(qr_token), entryResult, reason]
    );

    if (entryResult === 'allowed') {
      await query(
        `INSERT INTO attendance (
          coaching_id, student_id, attendance_date, source, scanned_by, status
        ) VALUES ($1, $2, CURRENT_DATE, 'qr', $3, 'present')
        ON CONFLICT (coaching_id, student_id, attendance_date)
        DO NOTHING`,
        [coachingId, student.id, req.user.user_id]
      );

      if (isDualWriteEnabled()) {
        await query(
          `INSERT INTO attendance_p
           SELECT a.*
           FROM attendance a
           WHERE a.coaching_id = $1
             AND a.student_id = $2
             AND a.attendance_date = CURRENT_DATE
             AND NOT EXISTS (
               SELECT 1 FROM attendance_p ap
               WHERE ap.coaching_id = a.coaching_id
                 AND ap.student_id = a.student_id
                 AND ap.attendance_date = a.attendance_date
             )`,
          [coachingId, student.id]
        );
      }
    }

    return res.json({
      student: {
        id: student.id,
        full_name: student.full_name,
        class_name: student.class_name,
        photo_url: student.photo_url
      },
      fee_status: student.fee_status,
      valid_till: student.valid_till,
      entry_result: entryResult,
      reason
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/', requireRole(['admin', 'faculty', 'receptionist']), async (req, res, next) => {
  try {
    const { coachingId } = req.tenant;
    const { page, limit, offset } = getPagination(req.query);
    const date = req.query.date || null;
    const attendTable = attendanceTable();

    const result = await query(
      `SELECT a.*, s.full_name
       FROM ${attendTable} a
       JOIN students s ON s.id = a.student_id AND s.coaching_id = a.coaching_id
       WHERE a.coaching_id = $1
         AND ($2::date IS NULL OR a.attendance_date = $2::date)
       ORDER BY a.entry_time DESC
       LIMIT $3 OFFSET $4`,
      [coachingId, date, limit, offset]
    );

    return res.json({ page, limit, data: result.rows });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
