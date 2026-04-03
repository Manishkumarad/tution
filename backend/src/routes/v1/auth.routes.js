const express = require('express');
const { z } = require('zod');
const { withTransaction, query } = require('../../config/db');
const { validate } = require('../../middleware/validate');
const { requireAuth } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenant');
const { requireRole } = require('../../middleware/rbac');
const { hashPassword, verifyPassword } = require('../../utils/password');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../../utils/jwt');
const { sha256 } = require('../../utils/hash');
const env = require('../../config/env');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getMembershipPlan, listMembershipPlans } = require('../../config/membership');
const { getRazorpayClient, verifyPaymentSignature } = require('../../services/razorpay');

const router = express.Router();

const emptyToUndefined = (value) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

let ownerAlertMailer = null;

function getOwnerAlertMailer() {
  if (!env.smtpHost || !env.smtpUser || !env.smtpPass) {
    return null;
  }

  if (!ownerAlertMailer) {
    ownerAlertMailer = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth: {
        user: env.smtpUser,
        pass: env.smtpPass
      }
    });
  }

  return ownerAlertMailer;
}

async function sendOwnerSignupAlert({ coaching, user }) {
  if (!env.ownerAlertEmail) {
    return;
  }

  const transporter = getOwnerAlertMailer();
  if (!transporter) {
    return;
  }

  const lines = [
    'New coaching registration received.',
    '',
    `Coaching Name: ${coaching.name}`,
    `Coaching Code: ${coaching.code}`,
    `Coaching Email: ${coaching.email || ''}`,
    `Coaching Phone: ${coaching.phone || ''}`,
    `Admin Name: ${user.full_name || ''}`,
    `Admin Email: ${user.email || ''}`,
    `Registered At: ${new Date().toISOString()}`
  ];

  await transporter.sendMail({
    from: env.smtpFrom,
    to: env.ownerAlertEmail,
    subject: `New Coaching Registered: ${coaching.name}`,
    text: lines.join('\n')
  });
}

const signupSchema = z.object({
  body: z.object({
    coachingName: z.string().min(2),
    coachingEmail: z.string().email(),
    coachingPhone: z.preprocess(emptyToUndefined, z.string().min(8).max(20).optional()),
    paymentUpiId: z.preprocess(emptyToUndefined, z.string().min(3).max(80).optional()),
    paymentQrUrl: z.preprocess(emptyToUndefined, z.string().url().optional()),
    bankAccountName: z.preprocess(emptyToUndefined, z.string().min(2).max(150).optional()),
    bankAccountNumber: z.preprocess(emptyToUndefined, z.string().min(6).max(40).optional()),
    bankIfsc: z.preprocess(emptyToUndefined, z.string().min(6).max(20).optional()),
    bankName: z.preprocess(emptyToUndefined, z.string().min(2).max(120).optional()),
    adminName: z.string().min(2),
    adminEmail: z.string().email(),
    adminPassword: z.string().min(6)
  }).refine((value) => (
    Boolean(value.paymentUpiId || value.paymentQrUrl || value.bankAccountNumber)
  ), {
    message: 'Provide at least one payment receiving detail: UPI ID, QR URL, or bank account',
    path: ['paymentUpiId']
  }).refine((value) => {
    if (!value.bankAccountNumber) return true;
    return Boolean(value.bankAccountName && value.bankIfsc && value.bankName);
  }, {
    message: 'Bank account name, IFSC, and bank name are required when bank account number is provided',
    path: ['bankAccountNumber']
  }),
  params: z.any(),
  query: z.any()
});

const loginSchema = z.object({
  body: z.object({
    coachingCode: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6)
  }),
  params: z.any(),
  query: z.any()
});

const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(20)
  }),
  params: z.any(),
  query: z.any()
});

const requestOtpSchema = z.object({
  body: z.object({
    coachingCode: z.string().min(2),
    adminEmail: z.string().email(),
    channel: z.enum(['sms', 'email']).default('sms')
  }),
  params: z.any(),
  query: z.any()
});

const loginWithOtpSchema = z.object({
  body: z.object({
    coachingCode: z.string().min(2),
    adminEmail: z.string().email(),
    otp: z.string().regex(/^\d{6}$/)
  }),
  params: z.any(),
  query: z.any()
});

const resetPasswordSchema = z.object({
  body: z.object({
    coachingCode: z.string().min(2),
    adminEmail: z.string().email(),
    otp: z.string().regex(/^\d{6}$/),
    newPassword: z.string().min(6)
  }),
  params: z.any(),
  query: z.any()
});

const upgradeMembershipSchema = z.object({
  body: z.object({
    planType: z.enum(['monthly', 'six_month', 'yearly'])
  }),
  params: z.any(),
  query: z.any()
});

const verifyMembershipPaymentSchema = z.object({
  body: z.object({
    membership_payment_id: z.number().int().positive(),
    razorpay_order_id: z.string().min(10),
    razorpay_payment_id: z.string().min(10),
    razorpay_signature: z.string().min(10)
  }),
  params: z.any(),
  query: z.any()
});

async function activateMembership(client, coachingId, planType) {
  const plan = getMembershipPlan(planType);
  const now = new Date();
  const validTill = new Date(now);
  validTill.setMonth(validTill.getMonth() + plan.durationMonths);

  const result = await client.query(
    `UPDATE coachings
     SET plan_type = $1,
         max_students = $2,
         membership_started_at = $3,
         membership_valid_till = $4,
         updated_at = NOW()
     WHERE id = $5
     RETURNING id, name, code, plan_type, max_students, membership_started_at, membership_valid_till`,
    [plan.code, plan.maxStudents, now, validTill, coachingId]
  );

  return {
    plan,
    coaching: result.rows[0] || null
  };
}

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function maskPhone(value) {
  const v = String(value || '');
  if (v.length <= 4) return v;
  return `${'*'.repeat(Math.max(0, v.length - 4))}${v.slice(-4)}`;
}

function maskEmail(value) {
  const v = String(value || '');
  const parts = v.split('@');
  if (parts.length !== 2) return v;
  const local = parts[0];
  const domain = parts[1];
  const visible = local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(0, local.length - 2))}@${domain}`;
}

async function sendOtpEmail(to, otp, purposeLabel) {
  const transporter = getOwnerAlertMailer();
  if (!transporter) {
    throw new Error('SMTP provider is not configured');
  }

  await transporter.sendMail({
    from: env.smtpFrom,
    to,
    subject: `Tution ${purposeLabel} OTP`,
    text: `Your OTP is ${otp}. It will expire in 10 minutes.`
  });
}

async function sendOtpSms(to, otp, purposeLabel) {
  if (!env.twilioAccountSid || !env.twilioAuthToken) {
    throw new Error('Twilio SMS provider is not configured');
  }

  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${env.twilioAccountSid}/Messages.json`;
  const auth = Buffer.from(`${env.twilioAccountSid}:${env.twilioAuthToken}`).toString('base64');
  const form = new URLSearchParams();
  form.append('To', to);
  form.append('Body', `Tution ${purposeLabel} OTP: ${otp}. Expires in 10 minutes.`);

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
    throw new Error(`SMS send failed: ${errText.slice(0, 200)}`);
  }
}

async function findAdminByCoachingCodeAndEmail(coachingCode, adminEmail) {
  const result = await query(
    `SELECT
       u.id,
       u.coaching_id,
       u.email,
       u.full_name,
       u.role,
       u.is_active,
       c.code AS coaching_code,
       c.phone AS coaching_phone,
       c.name AS coaching_name
     FROM users u
     JOIN coachings c ON c.id = u.coaching_id
     WHERE c.code = $1
       AND u.email = $2
       AND u.role = 'admin'
     LIMIT 1`,
    [coachingCode, adminEmail]
  );
  return result.rows[0] || null;
}

async function createOtpRecord({ coachingId, userId, purpose, channel, target, otp }) {
  await query(
    `UPDATE auth_recovery_otps
     SET used_at = NOW()
     WHERE coaching_id = $1
       AND user_id = $2
       AND purpose = $3
       AND used_at IS NULL`,
    [coachingId, userId, purpose]
  );

  const result = await query(
    `INSERT INTO auth_recovery_otps (
       coaching_id, user_id, purpose, channel, target, otp_hash, expires_at
     ) VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '10 minutes')
     RETURNING *`,
    [coachingId, userId, purpose, channel, target, sha256(otp)]
  );

  return result.rows[0];
}

async function getActiveOtpRecord({ coachingId, userId, purpose }) {
  const result = await query(
    `SELECT *
     FROM auth_recovery_otps
     WHERE coaching_id = $1
       AND user_id = $2
       AND purpose = $3
       AND used_at IS NULL
       AND expires_at > NOW()
       AND attempts < max_attempts
     ORDER BY created_at DESC
     LIMIT 1`,
    [coachingId, userId, purpose]
  );
  return result.rows[0] || null;
}

async function markOtpAttemptFailure(id) {
  await query(
    `UPDATE auth_recovery_otps
     SET attempts = attempts + 1
     WHERE id = $1`,
    [id]
  );
}

async function markOtpUsed(id) {
  await query(
    `UPDATE auth_recovery_otps
     SET used_at = NOW()
     WHERE id = $1`,
    [id]
  );
}

router.post('/coaching-signup', validate(signupSchema), async (req, res, next) => {
  try {
    const {
      coachingName,
      coachingEmail,
      coachingPhone,
      paymentUpiId,
      paymentQrUrl,
      bankAccountName,
      bankAccountNumber,
      bankIfsc,
      bankName,
      adminName,
      adminEmail,
      adminPassword
    } = req.validated.body;

    const result = await withTransaction(async (client) => {
      const code = `${coachingName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10)}-${uuidv4().slice(0, 6)}`;

      const coachingInsert = await client.query(
        `INSERT INTO coachings (
           name, code, email, phone, plan_type, max_students,
           payment_upi_id, payment_qr_url, bank_account_name,
           bank_account_number, bank_ifsc, bank_name
         )
         VALUES ($1, $2, $3, $4, 'starter', 5, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          coachingName,
          code,
          coachingEmail,
          coachingPhone || null,
          paymentUpiId || null,
          paymentQrUrl || null,
          bankAccountName || null,
          bankAccountNumber || null,
          bankIfsc || null,
          bankName || null
        ]
      );

      const coaching = coachingInsert.rows[0];
      const passwordHash = await hashPassword(adminPassword);

      const userInsert = await client.query(
        `INSERT INTO users (coaching_id, full_name, email, password_hash, role)
         VALUES ($1, $2, $3, $4, 'admin')
         RETURNING id, coaching_id, role, email, full_name`,
        [coaching.id, adminName, adminEmail, passwordHash]
      );

      return {
        coaching,
        user: userInsert.rows[0]
      };
    });

    const accessToken = signAccessToken({
      user_id: result.user.id,
      coaching_id: result.user.coaching_id,
      role: result.user.role
    });

    const refreshToken = signRefreshToken({
      user_id: result.user.id,
      coaching_id: result.user.coaching_id,
      role: result.user.role
    });

    await query(
      `INSERT INTO refresh_tokens (coaching_id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')`,
      [result.user.coaching_id, result.user.id, sha256(refreshToken)]
    );

    // Alert platform owner without blocking signup flow.
    sendOwnerSignupAlert({ coaching: result.coaching, user: result.user }).catch((err) => {
      console.warn('Owner signup alert failed:', err.message);
    });

    res.status(201).json({
      message: 'Coaching registered successfully',
      coaching: {
        id: result.coaching.id,
        name: result.coaching.name,
        code: result.coaching.code
      },
      user: result.user,
      tokens: {
        accessToken,
        refreshToken
      }
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        message: 'Coaching already exists with same email/code. Use recovery OTP if credentials are forgotten.'
      });
    }
    next(err);
  }
});

router.post('/recovery/request-login-otp', validate(requestOtpSchema), async (req, res, next) => {
  try {
    const { coachingCode, adminEmail, channel } = req.validated.body;
    const admin = await findAdminByCoachingCodeAndEmail(coachingCode, adminEmail);

    if (!admin || !admin.is_active) {
      return res.status(404).json({ message: 'Admin account not found for coaching code and email' });
    }

    const otp = generateOtp();
    let target = admin.email;
    let maskedTarget = maskEmail(admin.email);
    let finalChannel = channel;

    if (channel === 'sms') {
      if (!admin.coaching_phone) {
        return res.status(400).json({ message: 'Coaching phone is missing. Use email OTP.' });
      }
      await sendOtpSms(admin.coaching_phone, otp, 'Login');
      target = admin.coaching_phone;
      maskedTarget = maskPhone(admin.coaching_phone);
    } else {
      await sendOtpEmail(admin.email, otp, 'Login');
    }

    await createOtpRecord({
      coachingId: admin.coaching_id,
      userId: admin.id,
      purpose: 'login_otp',
      channel: finalChannel,
      target,
      otp
    });

    return res.json({
      message: 'OTP sent successfully',
      channel: finalChannel,
      target: maskedTarget
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/recovery/login-with-otp', validate(loginWithOtpSchema), async (req, res, next) => {
  try {
    const { coachingCode, adminEmail, otp } = req.validated.body;
    const admin = await findAdminByCoachingCodeAndEmail(coachingCode, adminEmail);

    if (!admin || !admin.is_active) {
      return res.status(404).json({ message: 'Admin account not found for coaching code and email' });
    }

    const otpRow = await getActiveOtpRecord({
      coachingId: admin.coaching_id,
      userId: admin.id,
      purpose: 'login_otp'
    });

    if (!otpRow) {
      return res.status(400).json({ message: 'OTP expired or not requested' });
    }

    if (sha256(otp) !== otpRow.otp_hash) {
      await markOtpAttemptFailure(otpRow.id);
      return res.status(401).json({ message: 'Invalid OTP' });
    }

    await markOtpUsed(otpRow.id);

    const accessToken = signAccessToken({
      user_id: admin.id,
      coaching_id: admin.coaching_id,
      role: admin.role
    });

    const refreshToken = signRefreshToken({
      user_id: admin.id,
      coaching_id: admin.coaching_id,
      role: admin.role
    });

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE users SET last_login_at = NOW() WHERE id = $1`,
        [admin.id]
      );

      await client.query(
        `INSERT INTO refresh_tokens (coaching_id, user_id, token_hash, expires_at)
         VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')`,
        [admin.coaching_id, admin.id, sha256(refreshToken)]
      );
    });

    return res.json({
      message: 'Login successful via OTP',
      user: {
        id: admin.id,
        coaching_id: admin.coaching_id,
        email: admin.email,
        full_name: admin.full_name,
        role: admin.role
      },
      tokens: {
        accessToken,
        refreshToken
      }
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/recovery/request-reset-otp', validate(requestOtpSchema), async (req, res, next) => {
  try {
    const { coachingCode, adminEmail, channel } = req.validated.body;
    const admin = await findAdminByCoachingCodeAndEmail(coachingCode, adminEmail);

    if (!admin || !admin.is_active) {
      return res.status(404).json({ message: 'Admin account not found for coaching code and email' });
    }

    const otp = generateOtp();
    let target = admin.email;
    let maskedTarget = maskEmail(admin.email);
    let finalChannel = channel;

    if (channel === 'sms') {
      if (!admin.coaching_phone) {
        return res.status(400).json({ message: 'Coaching phone is missing. Use email OTP.' });
      }
      await sendOtpSms(admin.coaching_phone, otp, 'Password Reset');
      target = admin.coaching_phone;
      maskedTarget = maskPhone(admin.coaching_phone);
    } else {
      await sendOtpEmail(admin.email, otp, 'Password Reset');
    }

    await createOtpRecord({
      coachingId: admin.coaching_id,
      userId: admin.id,
      purpose: 'password_reset',
      channel: finalChannel,
      target,
      otp
    });

    return res.json({
      message: 'OTP sent successfully',
      channel: finalChannel,
      target: maskedTarget
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/recovery/reset-password', validate(resetPasswordSchema), async (req, res, next) => {
  try {
    const { coachingCode, adminEmail, otp, newPassword } = req.validated.body;
    const admin = await findAdminByCoachingCodeAndEmail(coachingCode, adminEmail);

    if (!admin || !admin.is_active) {
      return res.status(404).json({ message: 'Admin account not found for coaching code and email' });
    }

    const otpRow = await getActiveOtpRecord({
      coachingId: admin.coaching_id,
      userId: admin.id,
      purpose: 'password_reset'
    });

    if (!otpRow) {
      return res.status(400).json({ message: 'OTP expired or not requested' });
    }

    if (sha256(otp) !== otpRow.otp_hash) {
      await markOtpAttemptFailure(otpRow.id);
      return res.status(401).json({ message: 'Invalid OTP' });
    }

    const newHash = await hashPassword(newPassword);

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE users
         SET password_hash = $1
         WHERE id = $2 AND coaching_id = $3`,
        [newHash, admin.id, admin.coaching_id]
      );

      await client.query(
        `UPDATE refresh_tokens
         SET revoked_at = NOW()
         WHERE user_id = $1 AND coaching_id = $2 AND revoked_at IS NULL`,
        [admin.id, admin.coaching_id]
      );

      await client.query(
        `UPDATE auth_recovery_otps
         SET used_at = NOW()
         WHERE id = $1`,
        [otpRow.id]
      );
    });

    return res.json({ message: 'Password reset successful. Please login again.' });
  } catch (err) {
    return next(err);
  }
});

router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { coachingCode, email, password } = req.validated.body;

    const userRes = await query(
      `SELECT u.id, u.coaching_id, u.email, u.full_name, u.role, u.password_hash, u.is_active
       FROM users u
       JOIN coachings c ON c.id = u.coaching_id
       WHERE u.email = $1
         AND c.code = $2
       LIMIT 1`,
      [email, coachingCode]
    );

    if (!userRes.rows[0]) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = userRes.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ message: 'User is inactive' });
    }

    const isValidPassword = await verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const accessToken = signAccessToken({
      user_id: user.id,
      coaching_id: user.coaching_id,
      role: user.role
    });

    const refreshToken = signRefreshToken({
      user_id: user.id,
      coaching_id: user.coaching_id,
      role: user.role
    });

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE users SET last_login_at = NOW() WHERE id = $1`,
        [user.id]
      );

      await client.query(
        `INSERT INTO refresh_tokens (coaching_id, user_id, token_hash, expires_at)
         VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')`,
        [user.coaching_id, user.id, sha256(refreshToken)]
      );
    });

    return res.json({
      user: {
        id: user.id,
        coaching_id: user.coaching_id,
        email: user.email,
        full_name: user.full_name,
        role: user.role
      },
      tokens: {
        accessToken,
        refreshToken
      }
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/refresh', validate(refreshSchema), async (req, res, next) => {
  try {
    const { refreshToken } = req.validated.body;
    let payload;

    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (_err) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    const tokenHash = sha256(refreshToken);
    const tokenRes = await query(
      `SELECT id FROM refresh_tokens
       WHERE token_hash = $1
         AND revoked_at IS NULL
         AND expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );

    if (!tokenRes.rows[0]) {
      return res.status(401).json({ message: 'Refresh token is revoked or expired' });
    }

    const accessToken = signAccessToken({
      user_id: payload.user_id,
      coaching_id: payload.coaching_id,
      role: payload.role
    });

    return res.json({ tokens: { accessToken } });
  } catch (err) {
    return next(err);
  }
});

router.post('/logout', validate(refreshSchema), async (req, res, next) => {
  try {
    const { refreshToken } = req.validated.body;
    await query(
      `UPDATE refresh_tokens
       SET revoked_at = NOW()
       WHERE token_hash = $1`,
      [sha256(refreshToken)]
    );

    return res.json({ message: 'Logged out successfully' });
  } catch (err) {
    return next(err);
  }
});

router.get('/membership/plans', requireAuth, requireTenant, async (_req, res) => {
  return res.json({ plans: listMembershipPlans() });
});

router.post('/membership/create-order', requireAuth, requireTenant, requireRole(['admin']), validate(upgradeMembershipSchema), async (req, res, next) => {
  try {
    const coachingId = req.tenant.coachingId;
    const { planType } = req.validated.body;

    const plan = getMembershipPlan(planType);
    const razorpay = getRazorpayClient();

    const order = await razorpay.orders.create({
      amount: Math.round(plan.price * 100),
      currency: 'INR',
      receipt: `mem-c${coachingId}-${Date.now()}`,
      notes: {
        coaching_id: String(coachingId),
        plan_type: plan.code
      }
    });

    const result = await query(
      `INSERT INTO membership_payments (
         coaching_id, plan_type, amount, currency, status,
         gateway, gateway_order_id, created_by
       ) VALUES ($1, $2, $3, 'INR', 'created', 'razorpay', $4, $5)
       RETURNING *`,
      [coachingId, plan.code, plan.price, order.id, req.user.user_id]
    );

    return res.json({
      membership_payment: result.rows[0],
      order,
      key_id: env.razorpayKeyId,
      plan
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/membership/verify-order', requireAuth, requireTenant, requireRole(['admin']), validate(verifyMembershipPaymentSchema), async (req, res, next) => {
  try {
    const coachingId = req.tenant.coachingId;
    const {
      membership_payment_id,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.validated.body;

    const isValid = verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);

    if (!isValid) {
      await query(
        `UPDATE membership_payments
         SET status = 'failed',
             failure_reason = 'Invalid signature',
             gateway_payment_id = $1,
             gateway_signature = $2,
             updated_at = NOW()
         WHERE id = $3 AND coaching_id = $4`,
        [razorpay_payment_id, razorpay_signature, membership_payment_id, coachingId]
      );
      return res.status(400).json({ message: 'Invalid payment signature' });
    }

    const activated = await withTransaction(async (client) => {
      const paymentRes = await client.query(
        `SELECT *
         FROM membership_payments
         WHERE id = $1 AND coaching_id = $2
         FOR UPDATE`,
        [membership_payment_id, coachingId]
      );

      if (!paymentRes.rows[0]) {
        const err = new Error('Membership payment not found');
        err.statusCode = 404;
        throw err;
      }

      const membershipPayment = paymentRes.rows[0];
      if (membershipPayment.gateway_order_id !== razorpay_order_id) {
        const err = new Error('Order mismatch for membership payment');
        err.statusCode = 400;
        throw err;
      }

      if (membershipPayment.status === 'success') {
        const current = await client.query(
          `SELECT id, name, code, plan_type, max_students, membership_started_at, membership_valid_till
           FROM coachings
           WHERE id = $1
           LIMIT 1`,
          [coachingId]
        );
        return {
          coaching: current.rows[0],
          plan: getMembershipPlan(membershipPayment.plan_type)
        };
      }

      await client.query(
        `UPDATE membership_payments
         SET status = 'success',
             gateway_payment_id = $1,
             gateway_signature = $2,
             paid_at = NOW(),
             failure_reason = NULL,
             updated_at = NOW()
         WHERE id = $3 AND coaching_id = $4`,
        [razorpay_payment_id, razorpay_signature, membership_payment_id, coachingId]
      );

      return activateMembership(client, coachingId, membershipPayment.plan_type);
    });

    return res.json({
      message: `${activated.plan.label} activated successfully.`,
      coaching: activated.coaching,
      plan: activated.plan
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/me', requireAuth, requireTenant, async (req, res, next) => {
  try {
    const userId = req.user.user_id;
    const coachingId = req.tenant.coachingId;

    const result = await query(
      `SELECT
         u.id AS user_id,
         u.full_name,
         u.email,
         u.role,
         u.last_login_at,
         c.id AS coaching_id,
         c.name AS coaching_name,
         c.code AS coaching_code,
         c.phone AS coaching_phone,
         c.plan_type,
         c.max_students,
         c.membership_started_at,
         c.membership_valid_till,
         c.payment_upi_id,
         c.payment_qr_url,
         c.bank_account_name,
         c.bank_account_number,
         c.bank_ifsc,
         c.bank_name,
         c.is_active,
         c.created_at
       FROM users u
       JOIN coachings c ON c.id = u.coaching_id
       WHERE u.id = $1 AND u.coaching_id = $2
       LIMIT 1`,
      [userId, coachingId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    return next(err);
  }
});

router.get('/recovery/audit', requireAuth, requireTenant, requireRole(['admin']), async (req, res, next) => {
  try {
    const coachingId = req.tenant.coachingId;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const totalRes = await query(
      `SELECT COUNT(*)::INT AS total
       FROM auth_recovery_otps
       WHERE coaching_id = $1`,
      [coachingId]
    );

    const rowsRes = await query(
      `SELECT
         a.id,
         a.purpose,
         a.channel,
         a.target,
         a.attempts,
         a.max_attempts,
         a.expires_at,
         a.used_at,
         a.created_at,
         u.full_name AS admin_name,
         u.email AS admin_email
       FROM auth_recovery_otps a
       JOIN users u
         ON u.id = a.user_id
        AND u.coaching_id = a.coaching_id
       WHERE a.coaching_id = $1
       ORDER BY a.created_at DESC
       LIMIT $2 OFFSET $3`,
      [coachingId, limit, offset]
    );

    const data = rowsRes.rows.map((row) => {
      let status = 'active';
      if (row.used_at) {
        status = 'used';
      } else if (new Date(row.expires_at).getTime() <= Date.now()) {
        status = 'expired';
      } else if (Number(row.attempts) >= Number(row.max_attempts)) {
        status = 'locked';
      }

      const targetMasked = row.channel === 'sms' ? maskPhone(row.target) : maskEmail(row.target);

      return {
        ...row,
        target_masked: targetMasked,
        status
      };
    });

    return res.json({
      page,
      limit,
      total: totalRes.rows[0]?.total || 0,
      data
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
