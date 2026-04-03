const crypto = require('crypto');
const env = require('../config/env');
const { pool } = require('../config/db');

function parseArgs(argv) {
  const args = {
    url: 'http://localhost:4000/api/v1/webhooks/razorpay',
    orderId: '',
    mode: 'captured',
    replay: 2,
    amount: 500,
    expectedStatus: 'success'
  };

  for (let i = 0; i < argv.length; i += 1) {
    const part = argv[i];
    if (part === '--url') args.url = argv[i + 1] || args.url;
    if (part === '--orderId') args.orderId = argv[i + 1] || args.orderId;
    if (part === '--mode') args.mode = argv[i + 1] || args.mode;
    if (part === '--replay') args.replay = Number(argv[i + 1]) || args.replay;
    if (part === '--amount') args.amount = Number(argv[i + 1]) || args.amount;
    if (part === '--expectedStatus') args.expectedStatus = argv[i + 1] || args.expectedStatus;
  }

  return args;
}

function buildEvent(args) {
  const eventTypeMap = {
    captured: 'payment.captured',
    failed: 'payment.failed',
    refunded: 'refund.processed'
  };

  const eventType = eventTypeMap[args.mode] || eventTypeMap.captured;
  const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const paymentId = `pay_${Date.now()}`;

  return {
    id: eventId,
    entity: 'event',
    event: eventType,
    payload: {
      payment: {
        entity: {
          id: paymentId,
          order_id: args.orderId,
          amount: Math.round(args.amount * 100),
          status: args.mode === 'captured' ? 'captured' : args.mode,
          error_description: args.mode === 'failed' ? 'Simulated failure' : null
        }
      }
    }
  };
}

function signPayload(rawBody) {
  return crypto
    .createHmac('sha256', env.razorpayWebhookSecret)
    .update(rawBody)
    .digest('hex');
}

async function postWebhook(url, body, signature) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-razorpay-signature': signature
    },
    body
  });

  const text = await response.text();
  return { status: response.status, body: text };
}

async function findPaymentByOrderId(orderId) {
  const result = await pool.query(
    `SELECT id, coaching_id, status
     FROM payments
     WHERE gateway_order_id = $1
     LIMIT 1`,
    [orderId]
  );
  return result.rows[0] || null;
}

async function countWebhookLogs(paymentId, eventId) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM payment_logs
     WHERE payment_id = $1
       AND event_type = 'webhook_event'
       AND payload->>'event_id' = $2`,
    [paymentId, eventId]
  );
  return result.rows[0].total;
}

async function checkPaymentStatus(paymentId) {
  const result = await pool.query(
    `SELECT status FROM payments WHERE id = $1`,
    [paymentId]
  );
  return result.rows[0]?.status || null;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));

  if (!env.razorpayWebhookSecret) {
    throw new Error('RAZORPAY_WEBHOOK_SECRET is required in environment');
  }

  if (!args.orderId) {
    throw new Error('Missing required --orderId. Use an existing payments.gateway_order_id');
  }

  const payment = await findPaymentByOrderId(args.orderId);
  if (!payment) {
    throw new Error(`No payment found for orderId=${args.orderId}`);
  }

  const event = buildEvent(args);
  const rawBody = JSON.stringify(event);
  const signature = signPayload(rawBody);

  console.log(`Testing webhook for payment_id=${payment.id}, mode=${args.mode}, replay=${args.replay}`);

  for (let i = 1; i <= args.replay; i += 1) {
    const result = await postWebhook(args.url, rawBody, signature);
    console.log(`Attempt ${i}: status=${result.status}, body=${result.body}`);
  }

  const logCount = await countWebhookLogs(payment.id, event.id);
  const finalStatus = await checkPaymentStatus(payment.id);

  console.log(`Webhook log count for event ${event.id}: ${logCount}`);
  console.log(`Final payment status: ${finalStatus}`);

  if (logCount !== 1) {
    throw new Error(`Idempotency failed. Expected 1 webhook log, got ${logCount}`);
  }

  if (args.expectedStatus && finalStatus !== args.expectedStatus) {
    throw new Error(`Status mismatch. Expected ${args.expectedStatus}, got ${finalStatus}`);
  }

  console.log('Webhook replay test passed.');
}

run()
  .catch((err) => {
    console.error('Webhook replay test failed:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
