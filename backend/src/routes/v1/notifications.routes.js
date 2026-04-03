const express = require('express');
const { z } = require('zod');
const { query } = require('../../config/db');
const { requireAuth } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenant');
const { requireRole } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validate');
const { enqueueNotification, processQueuedNotifications } = require('../../services/notification-service');
const { runDueReminderCycle, runAllPendingReminderCycle } = require('../../services/reminder-cron');

const router = express.Router();
router.use(requireAuth, requireTenant);

const testSchema = z.object({
  body: z.object({
    channel: z.enum(['email', 'sms', 'whatsapp']),
    recipient: z.string().min(5),
    template_key: z.string().min(2),
    payload: z.record(z.any()).optional()
  }),
  params: z.any(),
  query: z.any()
});

router.post('/send-test', requireRole(['admin']), validate(testSchema), async (req, res, next) => {
  try {
    const { coachingId } = req.tenant;
    let notif;
    try {
      notif = await enqueueNotification({
        coachingId,
        studentId: null,
        channel: req.validated.body.channel,
        templateKey: req.validated.body.template_key,
        recipient: req.validated.body.recipient,
        payload: req.validated.body.payload || {}
      });
    } catch (err) {
      err.message = `enqueue_failed: ${err.message}`;
      throw err;
    }

    try {
      await processQueuedNotifications(20);
    } catch (err) {
      err.message = `processor_failed: ${err.message}`;
      throw err;
    }

    return res.status(201).json(notif);
  } catch (err) {
    return next(err);
  }
});

router.get('/logs', requireRole(['admin', 'receptionist']), async (req, res, next) => {
  try {
    const { coachingId } = req.tenant;
    const result = await query(
      `SELECT * FROM notifications
       WHERE coaching_id = $1
       ORDER BY id DESC
       LIMIT 200`,
      [coachingId]
    );
    return res.json(result.rows);
  } catch (err) {
    return next(err);
  }
});

function runInBackground(task, label) {
  setImmediate(async () => {
    try {
      await task();
    } catch (err) {
      console.error(`${label} failed:`, err.message);
    }
  });
}

router.post('/trigger-due', requireRole(['admin', 'faculty', 'receptionist']), async (_req, res, next) => {
  try {
    runInBackground(runDueReminderCycle, 'trigger-due');
    return res.status(202).json({ message: 'Due reminder trigger accepted and running in background.' });
  } catch (err) {
    return next(err);
  }
});

router.post('/trigger-all-pending', requireRole(['admin', 'faculty', 'receptionist']), async (_req, res, next) => {
  try {
    runInBackground(runAllPendingReminderCycle, 'trigger-all-pending');
    return res.status(202).json({ message: 'All pending reminder trigger accepted and running in background.' });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
