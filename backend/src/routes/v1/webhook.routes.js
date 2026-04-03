const express = require('express');
const { query, withTransaction } = require('../../config/db');
const { verifyWebhookSignature } = require('../../services/razorpay');
const { deriveFeeStatus } = require('../../services/fee-status');
const { generateReceiptForPayment } = require('../../services/receipt-service');
const { getMembershipPlan } = require('../../config/membership');
const { isDualWriteEnabled } = require('../../services/partition-cutover');
const { sendStudentCredentialsAfterPayment } = require('../../services/student-credentials');

const router = express.Router();

async function isWebhookEventProcessed(client, paymentId, eventId) {
  const existing = await client.query(
    `SELECT id FROM payment_logs
     WHERE payment_id = $1
       AND event_type = 'webhook_event'
       AND payload->>'event_id' = $2
     LIMIT 1`,
    [paymentId, eventId]
  );
  return Boolean(existing.rows[0]);
}

async function appendWebhookLog(client, payment, event) {
  await client.query(
    `INSERT INTO payment_logs (coaching_id, payment_id, event_type, payload)
     VALUES ($1, $2, 'webhook_event', $3::jsonb)`,
    [
      payment.coaching_id,
      payment.id,
      JSON.stringify({
        event_id: event.id,
        event_type: event.event,
        payload: event.payload?.payment?.entity || null
      })
    ]
  );
}

async function applyCapturedPayment(client, payment, paymentEntity) {
  if (payment.status === 'success') {
    return false;
  }

  const feeRes = await client.query(
    `SELECT * FROM student_fee_accounts
     WHERE coaching_id = $1 AND student_id = $2
     FOR UPDATE`,
    [payment.coaching_id, payment.student_id]
  );

  if (!feeRes.rows[0]) {
    return;
  }

  const account = feeRes.rows[0];
  const newPaid = Number(account.paid_amount) + Number(payment.amount);
  const feeState = deriveFeeStatus(account.total_amount, newPaid, account.next_due_date);

  await client.query(
    `UPDATE student_fee_accounts
     SET paid_amount = $1,
         due_amount = $2,
         status = $3,
         valid_till = $4,
         updated_at = NOW()
     WHERE coaching_id = $5 AND id = $6`,
    [newPaid, feeState.dueAmount, feeState.status, feeState.validTill, payment.coaching_id, account.id]
  );

  await client.query(
    `UPDATE payments
     SET status = 'success',
         fee_account_id = $1,
         gateway_payment_id = $2,
         paid_at = NOW(),
         failure_reason = NULL
     WHERE coaching_id = $3 AND id = $4`,
    [account.id, paymentEntity.id || null, payment.coaching_id, payment.id]
  );

  if (isDualWriteEnabled()) {
    await client.query(
      `UPDATE payments_p
       SET status = 'success',
           fee_account_id = $1,
           gateway_payment_id = $2,
           paid_at = NOW(),
           failure_reason = NULL
       WHERE coaching_id = $3 AND id = $4`,
      [account.id, paymentEntity.id || null, payment.coaching_id, payment.id]
    );
  }

  await generateReceiptForPayment({
    paymentId: payment.id,
    coachingId: payment.coaching_id
  });

  return true;
}

async function applyFailedPayment(client, payment, paymentEntity) {
  if (payment.status === 'success') {
    return;
  }

  await client.query(
    `UPDATE payments
     SET status = 'failed',
         failure_reason = COALESCE($1, failure_reason, 'Razorpay payment failed')
     WHERE coaching_id = $2 AND id = $3`,
    [paymentEntity.error_description || null, payment.coaching_id, payment.id]
  );

  if (isDualWriteEnabled()) {
    await client.query(
      `UPDATE payments_p
       SET status = 'failed',
           failure_reason = COALESCE($1, failure_reason, 'Razorpay payment failed')
       WHERE coaching_id = $2 AND id = $3`,
      [paymentEntity.error_description || null, payment.coaching_id, payment.id]
    );
  }
}

async function applyRefundedPayment(client, payment, paymentEntity) {
  await client.query(
    `UPDATE payments
     SET status = 'refunded',
         failure_reason = COALESCE($1, failure_reason, 'Refunded by Razorpay')
     WHERE coaching_id = $2 AND id = $3`,
    [paymentEntity.error_description || null, payment.coaching_id, payment.id]
  );

  if (isDualWriteEnabled()) {
    await client.query(
      `UPDATE payments_p
       SET status = 'refunded',
           failure_reason = COALESCE($1, failure_reason, 'Refunded by Razorpay')
       WHERE coaching_id = $2 AND id = $3`,
      [paymentEntity.error_description || null, payment.coaching_id, payment.id]
    );
  }
}

async function applyCapturedMembershipPayment(client, membershipPayment, paymentEntity) {
  if (membershipPayment.status === 'success') {
    return;
  }

  const plan = getMembershipPlan(membershipPayment.plan_type);
  const now = new Date();
  const validTill = new Date(now);
  validTill.setMonth(validTill.getMonth() + plan.durationMonths);

  await client.query(
    `UPDATE membership_payments
     SET status = 'success',
         gateway_payment_id = COALESCE($1, gateway_payment_id),
         paid_at = NOW(),
         failure_reason = NULL,
         updated_at = NOW()
     WHERE id = $2 AND coaching_id = $3`,
    [paymentEntity.id || null, membershipPayment.id, membershipPayment.coaching_id]
  );

  await client.query(
    `UPDATE coachings
     SET plan_type = $1,
         max_students = $2,
         membership_started_at = $3,
         membership_valid_till = $4,
         updated_at = NOW()
     WHERE id = $5`,
    [plan.code, plan.maxStudents, now, validTill, membershipPayment.coaching_id]
  );
}

async function applyFailedMembershipPayment(client, membershipPayment, paymentEntity) {
  if (membershipPayment.status === 'success') {
    return;
  }

  await client.query(
    `UPDATE membership_payments
     SET status = 'failed',
         failure_reason = COALESCE($1, failure_reason, 'Razorpay membership payment failed'),
         updated_at = NOW()
     WHERE id = $2 AND coaching_id = $3`,
    [paymentEntity.error_description || null, membershipPayment.id, membershipPayment.coaching_id]
  );
}

async function applyRefundedMembershipPayment(client, membershipPayment, paymentEntity) {
  await client.query(
    `UPDATE membership_payments
     SET status = 'refunded',
         failure_reason = COALESCE($1, failure_reason, 'Membership payment refunded by Razorpay'),
         updated_at = NOW()
     WHERE id = $2 AND coaching_id = $3`,
    [paymentEntity.error_description || null, membershipPayment.id, membershipPayment.coaching_id]
  );
}

router.post('/razorpay', async (req, res, next) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = req.rawBody;

    if (!signature || !rawBody || !verifyWebhookSignature(rawBody, signature)) {
      return res.status(401).json({ message: 'Invalid webhook signature' });
    }

    const event = req.body;
    const eventId = event.id;
    const eventType = event.event;
    const paymentEntity = event?.payload?.payment?.entity;

    if (!eventId || !eventType || !paymentEntity) {
      return res.status(200).json({ message: 'Ignored event' });
    }

    const gatewayOrderId = paymentEntity.order_id;
    if (!gatewayOrderId) {
      return res.status(200).json({ message: 'Ignored event without order_id' });
    }

    await withTransaction(async (client) => {
      const payRes = await client.query(
        `SELECT * FROM payments
         WHERE gateway_order_id = $1
         FOR UPDATE`,
        [gatewayOrderId]
      );

      if (payRes.rows[0]) {
        const payment = payRes.rows[0];

        if (await isWebhookEventProcessed(client, payment.id, eventId)) {
          return;
        }

        if (eventType === 'payment.captured') {
          const captured = await applyCapturedPayment(client, payment, paymentEntity);
          if (captured) {
            sendStudentCredentialsAfterPayment({
              coachingId: payment.coaching_id,
              studentId: payment.student_id,
              amount: payment.amount
            }).catch((err) => {
              console.warn('Student credentials notification failed:', err.message);
            });
          }
        } else if (eventType === 'payment.failed') {
          await applyFailedPayment(client, payment, paymentEntity);
        } else if (eventType === 'refund.processed') {
          await applyRefundedPayment(client, payment, paymentEntity);
        }

        await appendWebhookLog(client, payment, event);
        return;
      }

      const membershipRes = await client.query(
        `SELECT * FROM membership_payments
         WHERE gateway_order_id = $1
         FOR UPDATE`,
        [gatewayOrderId]
      );

      if (!membershipRes.rows[0]) {
        return;
      }

      const membershipPayment = membershipRes.rows[0];

      if (eventType === 'payment.captured') {
        await applyCapturedMembershipPayment(client, membershipPayment, paymentEntity);
      } else if (eventType === 'payment.failed') {
        await applyFailedMembershipPayment(client, membershipPayment, paymentEntity);
      } else if (eventType === 'refund.processed') {
        await applyRefundedMembershipPayment(client, membershipPayment, paymentEntity);
      }
    });

    return res.status(200).json({ received: true });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
