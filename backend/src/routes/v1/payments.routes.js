const express = require('express');
const { z } = require('zod');
const { query, withTransaction } = require('../../config/db');
const { requireAuth } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenant');
const { requireRole } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validate');
const { getPagination } = require('../../utils/pagination');
const { deriveFeeStatus } = require('../../services/fee-status');
const { getRazorpayClient, verifyPaymentSignature } = require('../../services/razorpay');
const { generateReceiptForPayment } = require('../../services/receipt-service');
const { isDualWriteEnabled, paymentsTable } = require('../../services/partition-cutover');
const { sendStudentCredentialsAfterPayment } = require('../../services/student-credentials');

const router = express.Router();
router.use(requireAuth, requireTenant);

const manualPaymentSchema = z.object({
  body: z.object({
    student_id: z.number().int().positive(),
    amount: z.number().positive(),
    method: z.enum(['cash', 'upi', 'card', 'netbanking']),
    payment_mode: z.enum(['full', 'partial', 'monthly']),
    transaction_ref: z.string().optional()
  }),
  params: z.any(),
  query: z.any()
});

const createOrderSchema = z.object({
  body: z.object({
    student_id: z.number().int().positive(),
    amount: z.number().positive(),
    payment_mode: z.enum(['full', 'partial', 'monthly'])
  }),
  params: z.any(),
  query: z.any()
});

const verifyOrderSchema = z.object({
  body: z.object({
    payment_id: z.number().int().positive(),
    razorpay_order_id: z.string(),
    razorpay_payment_id: z.string(),
    razorpay_signature: z.string()
  }),
  params: z.any(),
  query: z.any()
});

async function applyPaymentToFeeAccount(client, coachingId, studentId, amount) {
  const feeRes = await client.query(
    `SELECT * FROM student_fee_accounts
     WHERE coaching_id = $1 AND student_id = $2
     FOR UPDATE`,
    [coachingId, studentId]
  );

  if (!feeRes.rows[0]) {
    const err = new Error('Fee account not found');
    err.statusCode = 404;
    throw err;
  }

  const account = feeRes.rows[0];
  const newPaidAmount = Number(account.paid_amount) + Number(amount);
  const statusInfo = deriveFeeStatus(account.total_amount, newPaidAmount, account.next_due_date);

  await client.query(
    `UPDATE student_fee_accounts
     SET paid_amount = $1,
         due_amount = $2,
         status = $3,
         valid_till = $4,
         updated_at = NOW()
     WHERE id = $5`,
    [newPaidAmount, statusInfo.dueAmount, statusInfo.status, statusInfo.validTill, account.id]
  );

  return account.id;
}

router.get('/', requireRole(['admin', 'faculty', 'receptionist']), async (req, res, next) => {
  try {
    const { coachingId } = req.tenant;
    const { page, limit, offset } = getPagination(req.query);
    const payTable = paymentsTable();

    const result = await query(
      `SELECT p.*, s.full_name
       FROM ${payTable} p
       JOIN students s ON s.id = p.student_id AND s.coaching_id = p.coaching_id
       WHERE p.coaching_id = $1
       ORDER BY p.id DESC
       LIMIT $2 OFFSET $3`,
      [coachingId, limit, offset]
    );

    return res.json({ page, limit, data: result.rows });
  } catch (err) {
    return next(err);
  }
});

router.get('/:id/receipt', requireRole(['admin', 'faculty', 'receptionist']), async (req, res, next) => {
  try {
    const { coachingId } = req.tenant;
    const paymentId = Number(req.params.id);

    const result = await query(
      `SELECT id, receipt_number, file_path, receipt_url, generated_at
       FROM receipts
       WHERE coaching_id = $1 AND payment_id = $2
       LIMIT 1`,
      [coachingId, paymentId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: 'Receipt not found' });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    return next(err);
  }
});

router.post('/manual', requireRole(['admin', 'receptionist']), validate(manualPaymentSchema), async (req, res, next) => {
  try {
    const { coachingId } = req.tenant;
    const { student_id, amount, method, payment_mode, transaction_ref } = req.validated.body;

    const payment = await withTransaction(async (client) => {
      const feeAccountId = await applyPaymentToFeeAccount(client, coachingId, student_id, amount);

      const paymentRes = await client.query(
        `INSERT INTO payments (
          coaching_id, student_id, fee_account_id, amount, method, payment_mode, status,
          transaction_ref, paid_at, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,'success',$7,NOW(),$8)
        RETURNING *`,
        [
          coachingId,
          student_id,
          feeAccountId,
          amount,
          method,
          payment_mode,
          transaction_ref || null,
          req.user.user_id
        ]
      );

      await client.query(
        `INSERT INTO payment_logs (coaching_id, payment_id, event_type, payload)
         VALUES ($1,$2,'manual_success',$3::jsonb)`,
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

      return paymentRes.rows[0];
    });

    await generateReceiptForPayment({
      paymentId: payment.id,
      coachingId
    });

    sendStudentCredentialsAfterPayment({
      coachingId,
      studentId: payment.student_id,
      amount: payment.amount
    }).catch((err) => {
      console.warn('Student credentials notification failed:', err.message);
    });

    return res.status(201).json(payment);
  } catch (err) {
    return next(err);
  }
});

router.post('/create-order', requireRole(['admin', 'receptionist']), validate(createOrderSchema), async (req, res, next) => {
  try {
    const { coachingId } = req.tenant;
    const { student_id, amount, payment_mode } = req.validated.body;
    const razorpay = getRazorpayClient();

    const amountPaise = Math.round(amount * 100);
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `c${coachingId}-s${student_id}-${Date.now()}`,
      notes: { coaching_id: String(coachingId), student_id: String(student_id), payment_mode }
    });

    const payRes = await query(
      `INSERT INTO payments (
        coaching_id, student_id, amount, method, payment_mode, status,
        gateway, gateway_order_id, created_by
      ) VALUES ($1,$2,$3,'razorpay',$4,'created','razorpay',$5,$6)
      RETURNING *`,
      [coachingId, student_id, amount, payment_mode, order.id, req.user.user_id]
    );

    if (isDualWriteEnabled()) {
      await query(
        `INSERT INTO payments_p
         SELECT p.*
         FROM payments p
         WHERE p.id = $1 AND p.coaching_id = $2
           AND NOT EXISTS (
             SELECT 1 FROM payments_p pp WHERE pp.id = p.id AND pp.coaching_id = p.coaching_id
           )`,
        [payRes.rows[0].id, coachingId]
      );
    }

    return res.status(201).json({
      payment: payRes.rows[0],
      razorpay_order: order,
      key_id: process.env.RAZORPAY_KEY_ID
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/verify-order', requireRole(['admin', 'receptionist']), validate(verifyOrderSchema), async (req, res, next) => {
  try {
    const { coachingId } = req.tenant;
    const { payment_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.validated.body;

    const isValid = verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);

    if (!isValid) {
      await query(
        `UPDATE payments
         SET status = 'failed', failure_reason = 'Invalid signature'
         WHERE id = $1 AND coaching_id = $2`,
        [payment_id, coachingId]
      );
      return res.status(400).json({ message: 'Invalid payment signature' });
    }

    const updated = await withTransaction(async (client) => {
      const paymentRes = await client.query(
        `SELECT * FROM payments
         WHERE id = $1 AND coaching_id = $2
         FOR UPDATE`,
        [payment_id, coachingId]
      );

      if (!paymentRes.rows[0]) {
        const err = new Error('Payment not found');
        err.statusCode = 404;
        throw err;
      }

      const payment = paymentRes.rows[0];
      const feeAccountId = await applyPaymentToFeeAccount(client, coachingId, payment.student_id, payment.amount);

      const finalRes = await client.query(
        `UPDATE payments
         SET status = 'success',
             fee_account_id = $1,
             gateway_payment_id = $2,
             paid_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [feeAccountId, razorpay_payment_id, payment_id]
      );

      if (isDualWriteEnabled()) {
        await client.query(
          `UPDATE payments_p
           SET status = 'success',
               fee_account_id = $1,
               gateway_payment_id = $2,
               paid_at = NOW()
           WHERE id = $3 AND coaching_id = $4`,
          [feeAccountId, razorpay_payment_id, payment_id, coachingId]
        );
      }

      await client.query(
        `INSERT INTO payment_logs (coaching_id, payment_id, event_type, payload)
         VALUES ($1,$2,'razorpay_verified',$3::jsonb)`,
        [coachingId, payment_id, JSON.stringify({ razorpay_order_id, razorpay_payment_id })]
      );

      return finalRes.rows[0];
    });

    await generateReceiptForPayment({
      paymentId: updated.id,
      coachingId
    });

    sendStudentCredentialsAfterPayment({
      coachingId,
      studentId: updated.student_id,
      amount: updated.amount
    }).catch((err) => {
      console.warn('Student credentials notification failed:', err.message);
    });

    return res.json({ message: 'Payment verified', payment: updated });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
