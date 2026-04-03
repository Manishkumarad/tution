const { query } = require('../config/db');
const { enqueueNotification, processQueuedNotifications } = require('./notification-service');

function toSafeDateString(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-IN');
}

function buildPayload(row, amount) {
  const amountValue = Number(amount || 0);
  const paidAmount = Number(row.paid_amount || 0);
  const dueAmount = Number(row.due_amount || 0);
  return {
    student_name: row.full_name,
    student_code: row.student_code,
    coaching_name: row.coaching_name,
    class_name: row.class_name || '-',
    paid_amount: amountValue.toFixed(2),
    total_paid_amount: paidAmount.toFixed(2),
    due_amount: dueAmount.toFixed(2),
    fee_status: row.fee_status || 'partial',
    valid_till: toSafeDateString(row.valid_till),
    message: `Welcome ${row.full_name}. Your payment of Rs ${amountValue.toFixed(2)} is successful. Student code: ${row.student_code}. Coaching: ${row.coaching_name}. Remaining due: Rs ${dueAmount.toFixed(2)}.`
  };
}

async function sendStudentCredentialsAfterPayment({ coachingId, studentId, amount }) {
  const result = await query(
    `SELECT s.id, s.full_name, s.student_code, s.email, s.phone, s.parent_phone,
            s.class_name, c.name AS coaching_name,
            sfa.paid_amount, sfa.due_amount, sfa.status AS fee_status, sfa.valid_till
     FROM students s
     JOIN coachings c ON c.id = s.coaching_id
     LEFT JOIN student_fee_accounts sfa ON sfa.student_id = s.id AND sfa.coaching_id = s.coaching_id
     WHERE s.coaching_id = $1 AND s.id = $2
     LIMIT 1`,
    [coachingId, studentId]
  );

  const row = result.rows[0];
  if (!row) {
    return;
  }

  const payload = buildPayload(row, amount);
  const channels = [];

  if (row.email) {
    channels.push({ channel: 'email', recipient: row.email });
  }

  const phoneRecipient = row.parent_phone || row.phone;
  if (phoneRecipient) {
    channels.push({ channel: 'sms', recipient: phoneRecipient });
    channels.push({ channel: 'whatsapp', recipient: phoneRecipient });
  }

  if (!channels.length) {
    return;
  }

  for (const item of channels) {
    await enqueueNotification({
      coachingId,
      studentId,
      channel: item.channel,
      templateKey: 'student_credentials',
      recipient: item.recipient,
      payload
    });
  }

  await processQueuedNotifications(50);
}

module.exports = {
  sendStudentCredentialsAfterPayment
};
