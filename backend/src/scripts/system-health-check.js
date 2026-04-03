const env = require('../config/env');
const { query, pool } = require('../config/db');

const backendUrl = `http://localhost:${env.port || 4000}`;
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

async function checkHttp(url, expectedText) {
  try {
    const res = await fetch(url);
    const text = await res.text();
    const ok = res.ok && (!expectedText || text.includes(expectedText));
    return { ok, detail: `${res.status}` };
  } catch (err) {
    return { ok: false, detail: err.message };
  }
}

async function checkDb() {
  try {
    const ping = await query('SELECT 1 AS ok');
    const hasCoachings = await query(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'coachings'
       ) AS exists`
    );
    return {
      ok: Boolean(ping.rows[0]?.ok) && Boolean(hasCoachings.rows[0]?.exists),
      detail: `coachings_table=${hasCoachings.rows[0]?.exists}`
    };
  } catch (err) {
    return { ok: false, detail: err.message };
  }
}

function isSet(v) {
  return !!v && String(v).trim().length > 0;
}

function notPlaceholder(v) {
  const value = String(v || '').trim();
  if (!value) return false;
  return !['xxx', 'change_this_access_secret', 'change_this_refresh_secret', 'rzp_test_xxx'].includes(value);
}

function checkJwt() {
  const ok = notPlaceholder(env.jwtAccessSecret) && notPlaceholder(env.jwtRefreshSecret);
  return { ok, detail: ok ? 'configured' : 'set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET' };
}

function checkRazorpay() {
  const key = notPlaceholder(env.razorpayKeyId);
  const secret = notPlaceholder(env.razorpayKeySecret);
  const webhook = notPlaceholder(env.razorpayWebhookSecret);
  const ok = key && secret && webhook;
  return {
    ok,
    detail: `key=${key}, secret=${secret}, webhook=${webhook}`
  };
}

function checkSmtp() {
  const ok = isSet(env.smtpHost) && isSet(env.smtpUser) && isSet(env.smtpPass) && isSet(env.smtpFrom);
  return { ok, detail: ok ? 'configured' : 'set SMTP_HOST/USER/PASS/FROM' };
}

function checkTwilio() {
  const sid = isSet(env.twilioAccountSid);
  const token = isSet(env.twilioAuthToken);
  const sender = isSet(env.twilioFromNumber) || isSet(env.twilioMessagingServiceSid);
  const ok = sid && token && sender;
  return {
    ok,
    detail: `sid=${sid}, token=${token}, sender=${sender}`
  };
}

function checkReminderChannels() {
  const valid = Array.isArray(env.reminderChannels) && env.reminderChannels.length > 0;
  return { ok: valid, detail: valid ? env.reminderChannels.join(',') : 'no channels configured' };
}

async function run() {
  const checks = [];

  checks.push({ step: 'Backend /health', ...(await checkHttp(`${backendUrl}/health`, 'ok')) });
  checks.push({ step: 'Frontend reachable', ...(await checkHttp(frontendUrl, 'root')) });
  checks.push({ step: 'Database connectivity', ...(await checkDb()) });
  checks.push({ step: 'JWT secrets', ...checkJwt() });
  checks.push({ step: 'Razorpay readiness', ...checkRazorpay() });
  checks.push({ step: 'SMTP readiness', ...checkSmtp() });
  checks.push({ step: 'Twilio readiness', ...checkTwilio() });
  checks.push({ step: 'Reminder channels', ...checkReminderChannels() });

  console.table(
    checks.map((c) => ({
      Step: c.step,
      Passed: c.ok,
      Detail: c.detail
    }))
  );

  const failed = checks.filter((c) => !c.ok);
  await pool.end();

  if (failed.length > 0) {
    process.exit(1);
  }
}

run().catch(async (err) => {
  console.error('System check crashed:', err.message);
  await pool.end();
  process.exit(1);
});
