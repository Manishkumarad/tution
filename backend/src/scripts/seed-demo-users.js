const { withTransaction } = require('../config/db');
const { hashPassword } = require('../utils/password');

async function run() {
  const timestamp = Date.now().toString().slice(-6);
  const coachingCode = `demo${timestamp}`;

  const result = await withTransaction(async (client) => {
    const coachingRes = await client.query(
      `INSERT INTO coachings (name, code, email, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, code`,
      [
        `Demo Coaching ${timestamp}`,
        coachingCode,
        `demo-${timestamp}@coaching.com`,
        '9999999999'
      ]
    );

    const coaching = coachingRes.rows[0];
    const adminPassword = 'Admin@123';
    const facultyPassword = 'Faculty@123';

    const adminHash = await hashPassword(adminPassword);
    const facultyHash = await hashPassword(facultyPassword);

    const adminRes = await client.query(
      `INSERT INTO users (coaching_id, full_name, email, phone, password_hash, role)
       VALUES ($1, $2, $3, $4, $5, 'admin')
       RETURNING id, email`,
      [coaching.id, 'Demo Admin', `admin-${timestamp}@demo.com`, '9999999998', adminHash]
    );

    const facultyRes = await client.query(
      `INSERT INTO users (coaching_id, full_name, email, phone, password_hash, role)
       VALUES ($1, $2, $3, $4, $5, 'faculty')
       RETURNING id, email`,
      [coaching.id, 'Demo Faculty', `faculty-${timestamp}@demo.com`, '9999999997', facultyHash]
    );

    const planRes = await client.query(
      `INSERT INTO fee_plans (coaching_id, name, fee_type, amount_total, installment_count, billing_cycle_days, due_day_of_month)
       VALUES ($1, 'Monthly Plan', 'monthly', 3000, 12, 30, 10)
       RETURNING id, amount_total`,
      [coaching.id]
    );

    const studentRes = await client.query(
      `INSERT INTO students (
        coaching_id, student_code, full_name, phone, parent_name, parent_phone,
        class_name, fee_plan_id, teacher_id, admission_date, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_DATE, 'active')
      RETURNING id`,
      [
        coaching.id,
        `DEMO-${timestamp}`,
        'Rahul Sharma',
        '9876543210',
        'Parent Sharma',
        '9876543200',
        '10th',
        planRes.rows[0].id,
        facultyRes.rows[0].id
      ]
    );

    await client.query(
      `INSERT INTO student_fee_accounts (
        coaching_id, student_id, fee_plan_id, total_amount, paid_amount, due_amount,
        next_due_date, status, valid_till
      ) VALUES ($1, $2, $3, $4, 1500, 1500, CURRENT_DATE + INTERVAL '10 days', 'partial', CURRENT_DATE + INTERVAL '10 days')`,
      [coaching.id, studentRes.rows[0].id, planRes.rows[0].id, planRes.rows[0].amount_total]
    );

    return {
      coaching,
      admin: { email: adminRes.rows[0].email, password: adminPassword },
      faculty: { email: facultyRes.rows[0].email, password: facultyPassword },
      studentId: studentRes.rows[0].id
    };
  });

  console.log('Demo setup complete.');
  console.log('Coaching Code:', result.coaching.code);
  console.log('Admin Login:', result.admin.email, result.admin.password);
  console.log('Faculty Login:', result.faculty.email, result.faculty.password);
  console.log('Student Pass ID:', result.studentId);
}

run().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
