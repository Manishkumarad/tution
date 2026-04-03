const { canUseSqs, receiveReminderJobs, ackReminderJob } = require('../services/sqs-queue');
const { runDueReminderCycle } = require('../services/reminder-cron');
const { processQueuedNotifications } = require('../services/notification-service');

async function handleJob(message) {
  let parsed;
  try {
    parsed = JSON.parse(message.Body || '{}');
  } catch (_err) {
    return true;
  }

  const type = parsed.type;
  if (type === 'due-reminder-cycle') {
    await runDueReminderCycle();
    return true;
  }

  if (type === 'notification-worker-cycle') {
    await processQueuedNotifications(200);
    return true;
  }

  return true;
}

async function runLoop() {
  if (!canUseSqs()) {
    console.log('[sqs-worker] SQS is disabled. Exiting worker.');
    process.exit(0);
  }

  console.log('[sqs-worker] Started. Polling reminder queue...');

  while (true) {
    try {
      const messages = await receiveReminderJobs(5);
      if (!messages.length) continue;

      for (const msg of messages) {
        const ok = await handleJob(msg);
        if (ok) {
          await ackReminderJob(msg.ReceiptHandle);
        }
      }
    } catch (err) {
      console.error('[sqs-worker] Loop error:', err.message);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

runLoop().catch((err) => {
  console.error('[sqs-worker] Fatal error:', err.message);
  process.exit(1);
});
