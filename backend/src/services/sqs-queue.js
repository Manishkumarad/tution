const env = require('../config/env');

let sqsClient = null;
let sqsInitTried = false;

function canUseSqs() {
  return env.sqsEnabled && Boolean(env.sqsReminderQueueUrl);
}

function getClient() {
  if (!canUseSqs()) return null;
  if (sqsClient) return sqsClient;
  if (sqsInitTried) return null;

  sqsInitTried = true;
  try {
    // Lazy require to keep local dev working without AWS SDK.
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const { SQSClient } = require('@aws-sdk/client-sqs');
    sqsClient = new SQSClient({ region: env.awsRegion });
    return sqsClient;
  } catch (err) {
    console.warn(`[sqs] AWS SDK not available (${err.message}). Falling back to local cron execution.`);
    return null;
  }
}

async function enqueueReminderJob(type, payload = {}) {
  const client = getClient();
  if (!client) return false;

  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const { SendMessageCommand } = require('@aws-sdk/client-sqs');
    const body = JSON.stringify({
      type,
      payload,
      created_at: new Date().toISOString()
    });

    await client.send(new SendMessageCommand({
      QueueUrl: env.sqsReminderQueueUrl,
      MessageBody: body
    }));

    return true;
  } catch (err) {
    console.warn(`[sqs] enqueue failed (${err.message}).`);
    return false;
  }
}

async function receiveReminderJobs(max = 5) {
  const client = getClient();
  if (!client) return [];

  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const { ReceiveMessageCommand } = require('@aws-sdk/client-sqs');
    const res = await client.send(new ReceiveMessageCommand({
      QueueUrl: env.sqsReminderQueueUrl,
      MaxNumberOfMessages: Math.min(10, Math.max(1, max)),
      WaitTimeSeconds: Math.min(20, Math.max(1, env.sqsLongPollSeconds || 20)),
      VisibilityTimeout: 60
    }));

    return res.Messages || [];
  } catch (err) {
    console.warn(`[sqs] receive failed (${err.message}).`);
    return [];
  }
}

async function ackReminderJob(receiptHandle) {
  const client = getClient();
  if (!client || !receiptHandle) return false;

  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const { DeleteMessageCommand } = require('@aws-sdk/client-sqs');
    await client.send(new DeleteMessageCommand({
      QueueUrl: env.sqsReminderQueueUrl,
      ReceiptHandle: receiptHandle
    }));
    return true;
  } catch (err) {
    console.warn(`[sqs] ack failed (${err.message}).`);
    return false;
  }
}

module.exports = {
  canUseSqs,
  enqueueReminderJob,
  receiveReminderJobs,
  ackReminderJob
};
