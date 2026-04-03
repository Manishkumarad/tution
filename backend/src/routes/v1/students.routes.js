const express = require('express');
const { z } = require('zod');
const QRCode = require('qrcode');
const { query, withTransaction } = require('../../config/db');
const { requireAuth } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenant');
const { requireRole } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validate');
const { getPagination } = require('../../utils/pagination');
const { deriveFeeStatus, isPassValid } = require('../../services/fee-status');
const { getMembershipPlan } = require('../../config/membership');
const { isDualWriteEnabled } = require('../../services/partition-cutover');
const { sendStudentCredentialsAfterPayment } = require('../../services/student-credentials');

const router = express.Router();

const emptyToUndefined = (value) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

const optionalText = (minLen) => z.preprocess(
  emptyToUndefined,
  z.string().min(minLen).optional()
);

router.get('/public/pass/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT s.id, s.full_name, s.photo_url, s.class_name, s.qr_token,
              sfa.status AS fee_status, sfa.valid_till, c.name AS coaching_name
       FROM students s
       JOIN coachings c ON c.id = s.coaching_id
       LEFT JOIN student_fee_accounts sfa ON sfa.student_id = s.id AND sfa.coaching_id = s.coaching_id
       WHERE s.id = $1`,
      [id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const student = result.rows[0];
    const qrPayload = JSON.stringify({
      qr_token: student.qr_token,
      student_id: student.id
    });
    const qrDataUrl = await QRCode.toDataURL(qrPayload, { margin: 1, width: 320 });

    return res.json({
      student_id: student.id,
      full_name: student.full_name,
      photo_url: student.photo_url,
      class_name: student.class_name,
      coaching_name: student.coaching_name,
      fee_status: student.fee_status,
      valid_till: student.valid_till,
      is_valid: isPassValid(student.fee_status, student.valid_till),
      qr_data_url: qrDataUrl
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/public/pass-token/:qr_token', async (req, res, next) => {
  try {
    const { qr_token } = req.params;

    const result = await query(
      `SELECT s.id, s.full_name, s.photo_url, s.class_name, s.qr_token,
              sfa.status AS fee_status, sfa.valid_till, c.name AS coaching_name
       FROM students s
       JOIN coachings c ON c.id = s.coaching_id
       LEFT JOIN student_fee_accounts sfa ON sfa.student_id = s.id AND sfa.coaching_id = s.coaching_id
       WHERE s.qr_token = $1`,
      [qr_token]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const student = result.rows[0];
    const qrPayload = JSON.stringify({
      qr_token: student.qr_token,
      student_id: student.id
    });
    const qrDataUrl = await QRCode.toDataURL(qrPayload, { margin: 1, width: 320 });

    return res.json({
      student_id: student.id,
      full_name: student.full_name,
      photo_url: student.photo_url,
      class_name: student.class_name,
      coaching_name: student.coaching_name,
      fee_status: student.fee_status,
      valid_till: student.valid_till,
      is_valid: isPassValid(student.fee_status, student.valid_till),
      qr_data_url: qrDataUrl
    });
  } catch (err) {
    return next(err);
  }
});

router.use(requireAuth, requireTenant);

const createStudentSchema = z.object({
  body: z.object({
    full_name: z.preprocess(emptyToUndefined, z.string().min(2)),
    email: z.preprocess(emptyToUndefined, z.string().email().optional()),
    phone: z.preprocess(emptyToUndefined, z.string().min(8).max(20)),
    parent_name: optionalText(2),
    parent_phone: optionalText(8),
    family_details: optionalText(2),
    address: optionalText(5),
    class_name: optionalText(1),
    fee_plan_id: z.number().int().positive(),
    initial_fee_payment: z.enum(['none', 'half', 'full']).optional(),
    initial_payment_method: z.enum(['cash', 'upi', 'card', 'netbanking']).optional(),
    initial_payment_transaction_ref: z.preprocess(emptyToUndefined, z.string().min(3).max(120).optional()),
    teacher_id: z.number().int().positive().optional(),
    admission_date: optionalText(1),
    photo_url: z.preprocess(emptyToUndefined, z.string().url().optional())
  }),
  params: z.any(),
  query: z.any()
});

const updateStudentSchema = z.object({
  body: z.object({
    full_name: optionalText(2),
    email: z.preprocess(emptyToUndefined, z.string().email().optional()),
    phone: optionalText(8),
    parent_name: optionalText(2),
    parent_phone: optionalText(8),
    family_details: optionalText(2),
    address: optionalText(5),
    class_name: optionalText(1),
    fee_plan_id: z.number().int().positive().optional(),
    teacher_id: z.number().int().positive().optional(),
    status: z.enum(['active', 'inactive']).optional(),
    photo_url: z.preprocess(emptyToUndefined, z.string().url().optional())
  }),
  params: z.object({ id: z.string() }),
  query: z.any()
});

router.get('/', requireRole(['admin', 'faculty', 'receptionist']), async (req, res, next) => {
  try {
    const { coachingId } = req.tenant;
    const { page, limit, offset } = getPagination(req.query);
    const q = req.query.q ? String(req.query.q).trim() : null;
    const status = req.query.status ? String(req.query.status).trim() : null;

    const filters = ['coaching_id = $1'];
    const params = [coachingId];

    if (q) {
      params.push(`%${q}%`);
      filters.push(`full_name ILIKE $${params.length}`);
    }

    if (status) {
      params.push(status);
      filters.push(`status = $${params.length}`);
    }

    const whereClause = filters.join(' AND ');

    const countRes = await query(
      `SELECT COUNT(*)::int AS total FROM students WHERE ${whereClause}`,
      params
    );

    params.push(limit, offset);

    const dataRes = await query(
      `SELECT id, student_code, full_name, phone, class_name, status, fee_plan_id, created_at
       FROM students
       WHERE ${whereClause}
       ORDER BY id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({
      page,
      limit,
      total: countRes.rows[0].total,
      data: dataRes.rows
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/', requireRole(['admin', 'receptionist']), validate(createStudentSchema), async (req, res, next) => {
  try {
    const { coachingId } = req.tenant;
    const body = req.validated.body;

    const result = await withTransaction(async (client) => {
      const coachingRes = await client.query(
        `SELECT plan_type, max_students
         FROM coachings
         WHERE id = $1
         LIMIT 1`,
        [coachingId]
      );

      if (!coachingRes.rows[0]) {
        const err = new Error('Coaching not found');
        err.statusCode = 404;
        throw err;
      }

      const coaching = coachingRes.rows[0];
      const plan = getMembershipPlan(coaching.plan_type);
      const effectiveLimit = Math.max(1, Number(coaching.max_students) || plan.maxStudents);

      const studentCountRes = await client.query(
        `SELECT COUNT(*)::int AS total
         FROM students
         WHERE coaching_id = $1 AND status = 'active'`,
        [coachingId]
      );

      const currentStudents = studentCountRes.rows[0]?.total || 0;
      if (currentStudents >= effectiveLimit) {
        const err = new Error(
          `Student limit reached (${effectiveLimit}). Upgrade membership to add more students.`
        );
        err.statusCode = 403;
        throw err;
      }

      const planRes = await client.query(
        `SELECT id, amount_total, fee_type FROM fee_plans
         WHERE id = $1 AND coaching_id = $2`,
        [body.fee_plan_id, coachingId]
      );

      if (!planRes.rows[0]) {
        const err = new Error('Fee plan not found');
        err.statusCode = 404;
        throw err;
      }

      const studentCode = `STU-${Date.now().toString().slice(-8)}`;

      const studentRes = await client.query(
        `INSERT INTO students (
          coaching_id, student_code, full_name, email, phone, parent_name, parent_phone,
          family_details, address, class_name, fee_plan_id, teacher_id, admission_date, photo_url
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,COALESCE($13::date, CURRENT_DATE),$14)
        RETURNING *`,
        [
          coachingId,
          studentCode,
          body.full_name,
          body.email || null,
          body.phone,
          body.parent_name || null,
          body.parent_phone || null,
          body.family_details || null,
          body.address || null,
          body.class_name || null,
          body.fee_plan_id,
          body.teacher_id || null,
          body.admission_date || null,
          body.photo_url || null
        ]
      );

      const student = studentRes.rows[0];
      const totalAmount = Number(planRes.rows[0].amount_total);
      const initialPaymentMode = body.initial_fee_payment || 'none';
      const initialPaidAmount = initialPaymentMode === 'full'
        ? totalAmount
        : initialPaymentMode === 'half'
          ? Number((totalAmount / 2).toFixed(2))
          : 0;
      const nextDueDate = new Date();
      const statusObj = deriveFeeStatus(totalAmount, initialPaidAmount, nextDueDate);

      await client.query(
        `INSERT INTO student_fee_accounts (
          coaching_id, student_id, fee_plan_id, total_amount, paid_amount, due_amount,
          next_due_date, status, valid_till
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          coachingId,
          student.id,
          body.fee_plan_id,
          totalAmount,
          initialPaidAmount,
          statusObj.dueAmount,
          nextDueDate,
          statusObj.status,
          statusObj.validTill
        ]
      );

      if (initialPaidAmount > 0) {
        const paymentMode = initialPaidAmount >= totalAmount ? 'full' : 'partial';
        const initialMethod = body.initial_payment_method || 'cash';

        const paymentRes = await client.query(
          `INSERT INTO payments (
            coaching_id, student_id, fee_account_id, amount, method, payment_mode, status,
            transaction_ref, paid_at, created_by
          ) VALUES ($1,$2,
            (SELECT id FROM student_fee_accounts WHERE coaching_id = $1 AND student_id = $2 LIMIT 1),
            $3,$4,$5,'success',$6,NOW(),$7)
          RETURNING *`,
          [
            coachingId,
            student.id,
            initialPaidAmount,
            paymentMode,
            initialMethod,
            body.initial_payment_transaction_ref || 'initial-registration',
            req.user.user_id
          ]
        );

        await client.query(
          `INSERT INTO payment_logs (coaching_id, payment_id, event_type, payload)
           VALUES ($1,$2,'initial_registration_payment',$3::jsonb)`,
          [coachingId, paymentRes.rows[0].id, JSON.stringify(paymentRes.rows[0])]
        );

        if (isDualWriteEnabled()) {
          await client.query(
            `INSERT INTO payments_p
             SELECT p.*
             FROM payments p
             WHERE p.id = $1 AND p.coaching_id = $2
               AND NOT EXISTS (
                 SELECT 1 FROM payments_p pp WHERE pp.id = p.id AND pp.coaching_id = p.coaching_id
               )`,
            [paymentRes.rows[0].id, coachingId]
          );
        }
      }

      return {
        student,
        initialPaidAmount
      };
    });

    if (Number(result.initialPaidAmount) > 0) {
      sendStudentCredentialsAfterPayment({
        coachingId,
        studentId: result.student.id,
        amount: result.initialPaidAmount
      }).catch((err) => {
        console.warn('Student credentials notification failed:', err.message);
      });
    }

    return res.status(201).json(result.student);
  } catch (err) {
    return next(err);
  }
});

router.get('/:id', requireRole(['admin', 'faculty', 'receptionist']), async (req, res, next) => {
  try {
    const { coachingId } = req.tenant;
    const { id } = req.params;

    const result = await query(
      `SELECT s.*, fp.name AS fee_plan_name, sfa.total_amount, sfa.paid_amount, sfa.due_amount, sfa.status AS fee_status
       FROM students s
       LEFT JOIN fee_plans fp ON fp.id = s.fee_plan_id
       LEFT JOIN student_fee_accounts sfa ON sfa.student_id = s.id AND sfa.coaching_id = s.coaching_id
       WHERE s.id = $1 AND s.coaching_id = $2`,
      [id, coachingId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: 'Student not found' });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    return next(err);
  }
});

router.patch('/:id', requireRole(['admin', 'receptionist']), validate(updateStudentSchema), async (req, res, next) => {
  try {
    const { coachingId } = req.tenant;
    const { id } = req.params;
    const body = req.validated.body;

    const fields = [];
    const values = [];
    Object.entries(body).forEach(([key, value]) => {
      values.push(value);
      fields.push(`${key} = $${values.length}`);
    });

    if (!fields.length) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    values.push(id, coachingId);

    const result = await query(
      `UPDATE students
       SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length - 1} AND coaching_id = $${values.length}
       RETURNING *`,
      values
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: 'Student not found' });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    return next(err);
  }
});

router.delete('/:id', requireRole(['admin']), async (req, res, next) => {
  try {
    const { coachingId } = req.tenant;
    const { id } = req.params;

    const result = await query(
      `DELETE FROM students
       WHERE id = $1 AND coaching_id = $2
       RETURNING id`,
      [id, coachingId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: 'Student not found' });
    }

    return res.json({ message: 'Student deleted' });
  } catch (err) {
    return next(err);
  }
});

router.get('/:id/pass', requireRole(['admin', 'faculty', 'receptionist']), async (req, res, next) => {
  try {
    const { coachingId } = req.tenant;
    const { id } = req.params;

    const result = await query(
      `SELECT s.id, s.full_name, s.photo_url, s.class_name, s.qr_token,
              sfa.status AS fee_status, sfa.valid_till, sfa.next_due_date,
              c.name AS coaching_name
       FROM students s
       JOIN coachings c ON c.id = s.coaching_id
       LEFT JOIN student_fee_accounts sfa ON sfa.student_id = s.id AND sfa.coaching_id = s.coaching_id
       WHERE s.id = $1 AND s.coaching_id = $2`,
      [id, coachingId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const student = result.rows[0];
    const qrPayload = JSON.stringify({
      qr_token: student.qr_token,
      student_id: student.id
    });
    const qrDataUrl = await QRCode.toDataURL(qrPayload, { margin: 1, width: 320 });

    return res.json({
      student_id: student.id,
      full_name: student.full_name,
      photo_url: student.photo_url,
      class_name: student.class_name,
      coaching_name: student.coaching_name,
      fee_status: student.fee_status,
      valid_till: student.valid_till,
      is_valid: isPassValid(student.fee_status, student.valid_till),
      qr_data_url: qrDataUrl
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
