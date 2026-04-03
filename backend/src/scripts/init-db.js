const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

async function init() {
  const schemaPath = path.join(__dirname, '../../db/schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf-8');
  await pool.query(sql);
  console.log('Database initialized successfully.');
  await pool.end();
}

init().catch(async (err) => {
  console.error('Database initialization failed:', err);
  await pool.end();
  process.exit(1);
});
