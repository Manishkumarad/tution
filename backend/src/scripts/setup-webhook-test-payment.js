const { withTransaction } = require('../config/db');

function parseArgs(argv) {
  const args = {
    coachingId: null,
    studentId: null,
    amount: 500,
    paymentMode: 'monthly'
  };

  for (let i = 0; i < argv.length; i += 1) {
    const part = argv[i];
    if (part === '--coachingId') args.coachingId = Number(argv[i + 1]) || null;
    if (part === '--studentId') args.studentId = Number(argv[i + 1]) || null;
    if (part === '--amount') args.amount = Number(argv[i + 1]) || args.amount;
    if (part === '--paymentMode') args.paymentMode = argv[i + 1] || args.paymentMode;
  }

  return args;
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

async function getOrCreateCoaching(client, coachingId) {
  if (coachingId) {
    const existing = await client.query(
      'SELECT id, name FROM coachings WHERE id = $1 LIMIT 1',
      [coachingId]
    );
    if (existing.rows[0]) return existing.rows[0];
  }

  const suffix = randomSuffix();
  const result = await client.query(
    `INSERT INTO coachings (name, code, email, phone)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name`,
    [
      `Webhook Test Coaching ${suffix}`,
      `wh-${suffix}`,
      `webhook-test-${suffix}@example.com`,
      '9999999999'
    ]
  );

  return result.rows[0];
}

async function getOrCreateAdmin(client, coachingId) {
  const existing = await client.query(
    `SELECT id
     FROM users
     WHERE coaching_id = $1 AND role = 'admin'
     ORDER BY id ASC
     LIMIT 1`,
    [coachingId]
  );

  if (existing.rows[0]) return existing.rows[0].id;

  const suffix = randomSuffix();
  const result = await client.query(
    `INSERT INTO users (coaching_id, full_name, email, phone, password_hash, role)
     VALUES ($1, $2, $3, $4, $5, 'admin')
     RETURNING id`,
    [
      coachingId,
      'Webhook Test Admin',
      `admin-${suffix}@example.com`,
      '9999999998',
      '$2a$12$V0S3QfO7oTv7P.A1AEjK8eFu0u07c8HfB5RsLG3A2kZZgwyU6hJz.'
    ]
  );

  return result.rows[0].id;
}

async function getOrCreateFeePlan(client, coachingId) {
  const existing = await client.query(
    `SELECT id, amount_total
     FROM fee_plans
     WHERE coaching_id = $1
     ORDER BY id ASC
     LIMIT 1`,
    [coachingId]
  );

  if (existing.rows[0]) return existing.rows[0];

  const result = await client.query(
    `INSERT INTO fee_plans (coaching_id, name, fee_type, amount_total, installment_count, billing_cycle_days, due_day_of_month)
     VALUES ($1, 'Webhook Test Plan', 'monthly', 5000, 12, 30, 10)
     RETURNING id, amount_total`,
    [coachingId]
  );

  return result.rows[0];
}

async function getOrCreateStudent(client, coachingId, studentId, feePlanId, teacherId) {
  if (studentId) {
    const existing = await client.query(
      `SELECT id
       FROM students
       WHERE id = $1 AND coaching_id = $2
       LIMIT 1`,
      [studentId, coachingId]
    );
    if (existing.rows[0]) return existing.rows[0].id;
  }

  const suffix = randomSuffix();
  const student = await client.query(
    `INSERT INTO students (
      coaching_id, student_code, full_name, phone, parent_name, parent_phone,
      class_name, fee_plan_id, teacher_id, admission_date, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_DATE, 'active')
    RETURNING id`,
    [
      coachingId,
      `WHSTU-${Date.now().toString().slice(-6)}-${suffix}`,
      `Webhook Student ${suffix}`,
      '9999999997',
      'Webhook Parent',
      '9999999996',
      '12th',
      feePlanId,
      teacherId
    ]
  );

  return student.rows[0].id;
}

async function getOrCreateFeeAccount(client, coachingId, studentId, feePlanId, totalAmount) {
  const existing = await client.query(
    `SELECT id
     FROM student_fee_accounts
     WHERE coaching_id = $1 AND student_id = $2
     LIMIT 1`,
    [coachingId, studentId]
  );

  if (existing.rows[0]) return existing.rows[0].id;

  const result = await client.query(
    `INSERT INTO student_fee_accounts (
      coaching_id, student_id, fee_plan_id, total_amount, paid_amount, due_amount,
      next_due_date, status, valid_till
    ) VALUES ($1, $2, $3, $4, 0, $4, CURRENT_DATE + INTERVAL '3 days', 'due', CURRENT_DATE + INTERVAL '3 days')
    RETURNING id`,
    [coachingId, studentId, feePlanId, totalAmount]
  );

  return result.rows[0].id;
}

async function createPendingGatewayPayment(client, coachingId, studentId, adminId, amount, paymentMode) {
  const orderId = `order_test_${Date.now()}_${randomSuffix()}`;

  const result = await client.query(
    `INSERT INTO payments (
      coaching_id, student_id, amount, method, payment_mode, status,
      gateway, gateway_order_id, created_by
    ) VALUES ($1, $2, $3, 'razorpay', $4, 'created', 'razorpay', $5, $6)
    RETURNING id, gateway_order_id, status`,
    [coachingId, studentId, amount, paymentMode, orderId, adminId]
  );

  return result.rows[0];
}

async function run() {
  const args = parseArgs(process.argv.slice(2));

  const output = await withTransaction(async (client) => {
    const coaching = await getOrCreateCoaching(client, args.coachingId);
    const adminId = await getOrCreateAdmin(client, coaching.id);
    const feePlan = await getOrCreateFeePlan(client, coaching.id);
    const studentId = await getOrCreateStudent(client, coaching.id, args.studentId, feePlan.id, adminId);
    await getOrCreateFeeAccount(client, coaching.id, studentId, feePlan.id, Number(feePlan.amount_total));

    const payment = await createPendingGatewayPayment(
      client,
      coaching.id,
      studentId,
      adminId,
      args.amount,
      args.paymentMode
    );

    return {
      coachingId: coaching.id,
      studentId,
      paymentId: payment.id,
      orderId: payment.gateway_order_id,
      status: payment.status
    };
  });

  console.log('Webhook test payment setup complete:');
  console.log(JSON.stringify(output, null, 2));
  console.log('Run replay test:');
  console.log(`npm run test:webhook -- --orderId ${output.orderId} --mode captured --replay 2 --expectedStatus success`);
}

run().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
