const { Pool } = require('pg');
const env = require('./env');
const { recordDbQuery, recordDbRetry } = require('../services/telemetry');

const usesSsl = (env.databaseUrl || '').includes('sslmode=require') || (env.databaseUrl || '').includes('ssl=true');

const pool = new Pool({
  connectionString: env.databaseUrl,
  max: env.dbPoolMax,
  idleTimeoutMillis: env.dbIdleTimeoutMs,
  connectionTimeoutMillis: env.dbConnectionTimeoutMs,
  maxUses: env.dbMaxUses,
  keepAlive: env.dbKeepAlive,
  ssl: usesSsl
    ? {
        rejectUnauthorized: env.dbSslRejectUnauthorized
      }
    : false
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientDbError(err) {
  const transientCodes = new Set([
    '57P01',
    '57P02',
    '57P03',
    '53300',
    '53400',
    '08000',
    '08001',
    '08003',
    '08006',
    '08P01',
    'ETIMEDOUT',
    'ECONNRESET',
    'EAI_AGAIN',
    'ENOTFOUND'
  ]);

  if (err?.code && transientCodes.has(err.code)) return true;
  const message = String(err?.message || '').toLowerCase();
  return message.includes('timeout') || message.includes('connection terminated unexpectedly');
}

async function query(text, params = [], options = {}) {
  const attempts = Math.max(0, Number(options.retryAttempts ?? env.dbRetryAttempts));
  const normalizedSql = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 240);

  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    const startedAt = Date.now();
    try {
      const result = await pool.query(text, params);
      const durationMs = Date.now() - startedAt;
      recordDbQuery({ durationMs, failed: false });

      if (env.dbLogSlowQueries && durationMs >= env.dbSlowQueryMs) {
        console.warn('[db][slow-query]', {
          duration_ms: durationMs,
          params_count: Array.isArray(params) ? params.length : 0,
          sql: normalizedSql
        });
      }

      return result;
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      if (attempt >= attempts || !isTransientDbError(err)) {
        recordDbQuery({ durationMs, failed: true });
        throw err;
      }

      recordDbRetry();
      console.warn('[db][retry]', {
        attempt: attempt + 1,
        max_attempts: attempts + 1,
        duration_ms: durationMs,
        error_code: err?.code || null,
        error_message: err?.message || 'unknown',
        sql: normalizedSql
      });

      const backoff = env.dbRetryDelayMs * Math.pow(2, attempt);
      await sleep(backoff);
    }
  }
}

async function withTransaction(handler) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await handler(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function withTenantTransaction(coachingId, handler) {
  return withTransaction(async (client) => {
    await client.query('SET LOCAL app.coaching_id = $1', [String(coachingId)]);
    return handler(client);
  });
}

module.exports = {
  pool,
  query,
  withTransaction,
  withTenantTransaction
};
