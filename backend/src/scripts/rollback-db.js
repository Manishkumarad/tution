const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

function parseArgs(argv) {
  const args = { all: false, steps: 1 };
  for (let i = 0; i < argv.length; i += 1) {
    const part = argv[i];
    if (part === '--all') {
      args.all = true;
    }
    if (part === '--steps') {
      const value = Number(argv[i + 1]);
      if (!Number.isNaN(value) && value > 0) {
        args.steps = value;
      }
    }
  }
  return args;
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function run() {
  const downDir = path.join(__dirname, '../../db/migrations/down');
  const args = parseArgs(process.argv.slice(2));

  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);

    const applied = await client.query(
      `SELECT filename
       FROM schema_migrations
       ORDER BY id DESC`
    );

    if (!applied.rows.length) {
      console.log('No applied migrations to rollback.');
      return;
    }

    const targetRows = args.all ? applied.rows : applied.rows.slice(0, args.steps);

    for (const row of targetRows) {
      const downFilename = row.filename.replace('.sql', '.down.sql');
      const downPath = path.join(downDir, downFilename);

      if (!fs.existsSync(downPath)) {
        throw new Error(`Missing down migration file: ${downFilename}`);
      }

      const sql = fs.readFileSync(downPath, 'utf-8');

      console.log(`Rolling back ${row.filename} using ${downFilename}`);
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('DELETE FROM schema_migrations WHERE filename = $1', [row.filename]);
      await client.query('COMMIT');
    }

    console.log('Rollback completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Rollback failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
