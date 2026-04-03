const { query } = require('../config/db');
const env = require('../config/env');
const nodemailer = require('nodemailer');

let mailer = null;

function getMailer() {
  if (!env.smtpHost || !env.smtpUser || !env.smtpPass) {
    return null;
  }

  if (!mailer) {
    mailer = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth: {
        user: env.smtpUser,
        pass: env.smtpPass
      }
    });
  }

  return mailer;
}

function renderTemplateText(text, payload = {}) {
  if (!text) return '';
  return text.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_m, key) => {
    const value = payload[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

function buildFallbackBody(templateKey, payload) {
  const map = {
    due_minus_3: 'Reminder: Fee for {{student_name}} is due on {{due_date}}. Pending amount Rs {{due_amount}}.',
    due_today: 'Fee due today for {{student_name}}. Please pay Rs {{due_amount}}.',
    overdue: 'Overdue alert: Fee pending for {{student_name}}. Pending amount Rs {{due_amount}}.',
    student_credentials: 'Welcome {{student_name}}. Payment received Rs {{paid_amount}}. Student code: {{student_code}}. Coaching: {{coaching_name}}. Current due: Rs {{due_amount}}.'
  };
  return renderTemplateText(map[templateKey] || 'Fee reminder for {{student_name}}.', payload);
}

function buildFallbackSubject(templateKey) {
  const map = {
    student_credentials: 'Student credentials and payment confirmation'
  };
  return map[templateKey] || 'Fee Reminder';
}

async function getTemplate({ coachingId, channel, templateKey }) {
  const result = await query(
    `SELECT subject, body
     FROM notification_templates
     WHERE channel = $1
       AND template_key = $2
       AND is_active = TRUE
       AND (coaching_id = $3 OR coaching_id IS NULL)
     ORDER BY coaching_id DESC NULLS LAST
     LIMIT 1`,
    [channel, templateKey, coachingId]
  );

  return result.rows[0] || null;
}

async function enqueueNotification({ coachingId, studentId, channel, templateKey, recipient, payload }) {
  const duplicate = await query(
    `SELECT id
     FROM notifications
     WHERE coaching_id = $1
       AND (($2::BIGINT IS NULL AND student_id IS NULL) OR student_id = $2::BIGINT)
       AND channel = $3
       AND template_key = $4
       AND recipient = $5
       AND created_at::date = CURRENT_DATE
       AND status IN ('queued', 'sent')
     LIMIT 1`,
    [coachingId, studentId || null, channel, templateKey, recipient]
  );

  if (duplicate.rows[0]) {
    return null;
  }

  const result = await query(
    `INSERT INTO notifications (
      coaching_id, student_id, channel, template_key, recipient, payload, status
    ) VALUES ($1, $2::BIGINT, $3, $4, $5, $6::jsonb, 'queued')
    RETURNING *`,
    [coachingId, studentId || null, channel, templateKey, recipient, JSON.stringify(payload || {})]
  );
  return result.rows[0];
}

function computeBackoff(retryCount) {
  const delays = [1, 5, 30, 120, 720];
  const idx = Math.max(0, Math.min(delays.length - 1, retryCount - 1));
  const next = new Date(Date.now() + delays[idx] * 60 * 1000);
  return next.toISOString();
}

async function markNotificationResult(id, status, data = {}) {
  await query(
    `UPDATE notifications
     SET status = $2::VARCHAR,
         provider_message_id = COALESCE($3, provider_message_id),
         error_message = $4,
         sent_at = CASE WHEN $2::TEXT = 'sent' THEN NOW() ELSE sent_at END,
         retry_count = CASE WHEN $2::TEXT = 'failed' THEN retry_count + 1 ELSE retry_count END,
         next_retry_at = $5
     WHERE id = $1`,
    [id, status, data.providerMessageId || null, data.errorMessage || null, data.nextRetryAt || null]
  );
}

async function sendViaProvider(channel, recipient, message, subject) {
  if (!recipient) {
    throw new Error(`Missing recipient for ${channel}`);
  }

  if (channel === 'email') {
    const transporter = getMailer();
    if (!transporter) {
      throw new Error('SMTP provider is not configured');
    }

    const result = await transporter.sendMail({
      from: env.smtpFrom,
      to: recipient,
      subject: subject || 'Fee Reminder',
      text: message
    });

    return { providerMessageId: result.messageId || `email-${Date.now()}` };
  }

  if (channel === 'sms') {
    if (env.twilioAccountSid && env.twilioAuthToken) {
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${env.twilioAccountSid}/Messages.json`;
      const auth = Buffer.from(`${env.twilioAccountSid}:${env.twilioAuthToken}`).toString('base64');
      const form = new URLSearchParams();
      form.append('To', recipient);
      form.append('Body', message);

      if (env.twilioMessagingServiceSid) {
        form.append('MessagingServiceSid', env.twilioMessagingServiceSid);
      } else if (env.twilioFromNumber) {
        form.append('From', env.twilioFromNumber);
      } else {
        throw new Error('Twilio sender is missing: set TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID');
      }

      const res = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          authorization: `Basic ${auth}`,
          'content-type': 'application/x-www-form-urlencoded'
        },
        body: form
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Twilio SMS failed with ${res.status}: ${errText.slice(0, 200)}`);
      }

      const payload = await res.json().catch(() => ({}));
      return { providerMessageId: payload.sid || `twilio-${Date.now()}` };
    }

    if (!env.smsProviderUrl || !env.smsProviderToken) {
      throw new Error('SMS provider is not configured (set Twilio or generic SMS provider env vars)');
    }

    const res = await fetch(env.smsProviderUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.smsProviderToken}`
      },
      body: JSON.stringify({ to: recipient, message })
    });

    if (!res.ok) {
      throw new Error(`SMS provider failed with ${res.status}`);
    }

    const payload = await res.json().catch(() => ({}));
    return { providerMessageId: payload.id || `sms-${Date.now()}` };
  }

  if (channel === 'whatsapp') {
    if (!env.whatsappProviderUrl || !env.whatsappProviderToken) {
      throw new Error('WhatsApp provider is not configured');
    }

    const res = await fetch(env.whatsappProviderUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.whatsappProviderToken}`
      },
      body: JSON.stringify({
        from: env.whatsappSender,
        to: recipient,
        type: 'text',
        text: { body: message }
      })
    });

    if (!res.ok) {
      throw new Error(`WhatsApp provider failed with ${res.status}`);
    }

    const payload = await res.json().catch(() => ({}));
    return { providerMessageId: payload.id || `wa-${Date.now()}` };
  }

  return { providerMessageId: `${channel}-${Date.now()}` };
}

async function processQueuedNotifications(batchSize = 100) {
  const result = await query(
    `SELECT * FROM notifications
     WHERE status = 'queued'
        OR (status = 'failed' AND next_retry_at IS NOT NULL AND next_retry_at <= NOW() AND retry_count < $2::INT)
     ORDER BY created_at ASC
     LIMIT $1::INT`,
    [batchSize, env.notificationMaxRetries]
  );

  for (const row of result.rows) {
    try {
      const template = await getTemplate({
        coachingId: row.coaching_id,
        channel: row.channel,
        templateKey: row.template_key
      });
      const payload = row.payload || {};
      const message = template
        ? renderTemplateText(template.body, payload)
        : buildFallbackBody(row.template_key, payload);
      const subject = template?.subject
        ? renderTemplateText(template.subject, payload)
        : buildFallbackSubject(row.template_key);

      const sendResult = await sendViaProvider(row.channel, row.recipient, message, subject);
      await markNotificationResult(row.id, 'sent', {
        providerMessageId: sendResult.providerMessageId
      });
    } catch (err) {
      const retryCount = Number(row.retry_count) + 1;
      const nextRetryAt = retryCount >= env.notificationMaxRetries ? null : computeBackoff(retryCount);
      await markNotificationResult(row.id, 'failed', {
        errorMessage: err.message,
        nextRetryAt
      });
    }
  }
}

module.exports = {
  enqueueNotification,
  processQueuedNotifications
};
