const { query, pool } = require('../config/db');

function parseArgs(argv) {
  const args = { table: 'all', batch: 5000 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--table' && argv[i + 1]) args.table = argv[i + 1];
    if (argv[i] === '--batch' && argv[i + 1]) args.batch = Math.max(100, Number(argv[i + 1]) || 5000);
  }
  return args;
}

async function backfillPayments(batch) {
  let inserted = 0;
  while (true) {
    const res = await query(
      `WITH candidates AS (
         SELECT p.*
         FROM payments p
         LEFT JOIN payments_p pp ON pp.id = p.id AND pp.coaching_id = p.coaching_id
         WHERE pp.id IS NULL
         ORDER BY p.id ASC
         LIMIT $1
       )
       INSERT INTO payments_p
       SELECT * FROM candidates
       RETURNING id`,
      [batch]
    );

    inserted += res.rowCount;
    if (res.rowCount < batch) break;
  }
  return inserted;
}

async function backfillAttendance(batch) {
  let inserted = 0;
  while (true) {
    const res = await query(
      `WITH candidates AS (
         SELECT a.*
         FROM attendance a
         LEFT JOIN attendance_p ap
           ON ap.id = a.id
          AND ap.coaching_id = a.coaching_id
         WHERE ap.id IS NULL
         ORDER BY a.id ASC
         LIMIT $1
       )
       INSERT INTO attendance_p
       SELECT * FROM candidates
       RETURNING id`,
      [batch]
    );

    inserted += res.rowCount;
    if (res.rowCount < batch) break;
  }
  return inserted;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const started = Date.now();

  const output = {};

  if (args.table === 'all' || args.table === 'payments') {
    output.payments_inserted = await backfillPayments(args.batch);
  }

  if (args.table === 'all' || args.table === 'attendance') {
    output.attendance_inserted = await backfillAttendance(args.batch);
  }

  output.duration_ms = Date.now() - started;
  console.log(JSON.stringify(output, null, 2));
}

run()
  .catch((err) => {
    console.error('Backfill failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
