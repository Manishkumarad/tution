const cron = require('node-cron');
const { query } = require('../config/db');
const env = require('../config/env');
const { enqueueNotification, processQueuedNotifications } = require('./notification-service');
const { canUseSqs, enqueueReminderJob } = require('./sqs-queue');

const CHANNELS = ['email', 'sms', 'whatsapp'];

function getReminderType(nextDueDate) {
  const dueDate = new Date(nextDueDate);
  const now = new Date();
  const utcNow = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const utcDue = Date.UTC(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const diffDays = Math.round((utcDue - utcNow) / (1000 * 60 * 60 * 24));

  if (diffDays === 3) return 'due_minus_3';
  if (diffDays === 0) return 'due_today';
  if (diffDays < 0) return 'overdue';
  return null;
}

async function queueDueReminders() {
  const result = await query(
    `SELECT sfa.coaching_id, sfa.student_id, sfa.next_due_date, sfa.due_amount,
            st.full_name, st.parent_phone, st.parent_name, st.phone AS student_phone,
            c.email AS coaching_email
     FROM student_fee_accounts sfa
     JOIN students st ON st.id = sfa.student_id AND st.coaching_id = sfa.coaching_id
     JOIN coachings c ON c.id = sfa.coaching_id
     WHERE sfa.due_amount > 0
       AND sfa.next_due_date IS NOT NULL
       AND (
         sfa.next_due_date = CURRENT_DATE + INTERVAL '3 days'
         OR sfa.next_due_date = CURRENT_DATE
         OR sfa.next_due_date < CURRENT_DATE
       )`
  );

  for (const row of result.rows) {
    const templateKey = getReminderType(row.next_due_date);
    if (!templateKey) continue;

    const payload = {
      student_name: row.full_name,
      parent_name: row.parent_name,
      due_date: row.next_due_date,
      due_amount: row.due_amount
    };

    for (const channel of env.reminderChannels) {
      if (!CHANNELS.includes(channel)) continue;

      let recipient = null;
      if (channel === 'email') recipient = row.coaching_email || null;
      if (channel === 'sms' || channel === 'whatsapp') recipient = row.parent_phone || row.student_phone || null;
      if (!recipient) continue;

      await enqueueNotification({
        coachingId: row.coaching_id,
        studentId: row.student_id,
        channel,
        templateKey,
        recipient,
        payload
      });
    }
  }
}

async function queueAllPendingReminders() {
  const result = await query(
    `SELECT sfa.coaching_id, sfa.student_id, sfa.next_due_date, sfa.due_amount,
            st.full_name, st.parent_phone, st.parent_name, st.phone AS student_phone,
            c.email AS coaching_email
     FROM student_fee_accounts sfa
     JOIN students st ON st.id = sfa.student_id AND st.coaching_id = sfa.coaching_id
     JOIN coachings c ON c.id = sfa.coaching_id
     WHERE sfa.due_amount > 0`
  );

  for (const row of result.rows) {
    const templateKey = 'overdue';
    const payload = {
      student_name: row.full_name,
      parent_name: row.parent_name,
      due_date: row.next_due_date,
      due_amount: row.due_amount
    };

    for (const channel of env.reminderChannels) {
      if (!CHANNELS.includes(channel)) continue;

      let recipient = null;
      if (channel === 'email') recipient = row.coaching_email || null;
      if (channel === 'sms' || channel === 'whatsapp') recipient = row.parent_phone || row.student_phone || null;
      if (!recipient) continue;

      await enqueueNotification({
        coachingId: row.coaching_id,
        studentId: row.student_id,
        channel,
        templateKey,
        recipient,
        payload
      });
    }
  }
}

async function runDueReminderCycle() {
  await withReminderLock(async () => {
    await queueDueReminders();
    await processQueuedNotifications(200);
  });
}

async function runAllPendingReminderCycle() {
  await withReminderLock(async () => {
    await queueAllPendingReminders();
    await processQueuedNotifications(200);
  });
}

async function withReminderLock(taskFn) {
  const lockResult = await query(`SELECT pg_try_advisory_lock(8291721) AS locked`);
  if (!lockResult.rows[0]?.locked) {
    return;
  }

  try {
    await taskFn();
  } finally {
    await query(`SELECT pg_advisory_unlock(8291721)`);
  }
}

function startReminderJobs() {
  cron.schedule(env.reminderCronExpression, async () => {
    try {
      if (canUseSqs()) {
        const queued = await enqueueReminderJob('due-reminder-cycle');
        if (queued) return;
      }
      await runDueReminderCycle();
    } catch (err) {
      console.error('Reminder cron failed:', err.message);
    }
  }, { timezone: env.reminderTimezone });

  cron.schedule(env.notificationWorkerCronExpression, async () => {
    try {
      if (canUseSqs()) {
        const queued = await enqueueReminderJob('notification-worker-cycle');
        if (queued) return;
      }

      await withReminderLock(async () => {
        await processQueuedNotifications(200);
      });
    } catch (err) {
      console.error('Notification processor failed:', err.message);
    }
  }, { timezone: env.reminderTimezone });
}

module.exports = {
  startReminderJobs,
  queueDueReminders,
  runDueReminderCycle,
  queueAllPendingReminders,
  runAllPendingReminderCycle
};
