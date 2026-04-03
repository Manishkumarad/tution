const { query, pool } = require('../config/db');

async function run() {
  const [paymentsBase, paymentsPart, attendanceBase, attendancePart, paymentsMissing, attendanceMissing] = await Promise.all([
    query('SELECT COUNT(*)::bigint AS c FROM payments'),
    query('SELECT COUNT(*)::bigint AS c FROM payments_p'),
    query('SELECT COUNT(*)::bigint AS c FROM attendance'),
    query('SELECT COUNT(*)::bigint AS c FROM attendance_p'),
    query(
      `SELECT COUNT(*)::bigint AS c
       FROM payments p
       LEFT JOIN payments_p pp ON pp.id = p.id AND pp.coaching_id = p.coaching_id
       WHERE pp.id IS NULL`
    ),
    query(
      `SELECT COUNT(*)::bigint AS c
       FROM attendance a
       LEFT JOIN attendance_p ap ON ap.id = a.id AND ap.coaching_id = a.coaching_id
       WHERE ap.id IS NULL`
    )
  ]);

  const report = {
    payments: {
      base_count: paymentsBase.rows[0].c,
      partition_count: paymentsPart.rows[0].c,
      missing_in_partition: paymentsMissing.rows[0].c
    },
    attendance: {
      base_count: attendanceBase.rows[0].c,
      partition_count: attendancePart.rows[0].c,
      missing_in_partition: attendanceMissing.rows[0].c
    }
  };

  console.log(JSON.stringify(report, null, 2));

  if (Number(report.payments.missing_in_partition) > 0 || Number(report.attendance.missing_in_partition) > 0) {
    process.exitCode = 1;
  }
}

run()
  .catch((err) => {
    console.error('Partition verification failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
