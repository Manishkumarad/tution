const express = require('express');
const { z } = require('zod');
const { query } = require('../../config/db');
const { requireAuth } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenant');
const { requireRole } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validate');
const { hashPassword } = require('../../utils/password');

const router = express.Router();
router.use(requireAuth, requireTenant);

const createUserSchema = z.object({
  body: z.object({
    full_name: z.string().min(2),
    email: z.string().email(),
    phone: z.string().min(8).max(20).optional(),
    password: z.string().min(6),
    role: z.enum(['admin', 'faculty', 'receptionist'])
  }),
  params: z.any(),
  query: z.any()
});

router.get('/', requireRole(['admin']), async (req, res, next) => {
  try {
    const { coachingId } = req.tenant;
    const result = await query(
      `SELECT id, full_name, email, phone, role, is_active, created_at
       FROM users
       WHERE coaching_id = $1
       ORDER BY id DESC`,
      [coachingId]
    );
    return res.json(result.rows);
  } catch (err) {
    return next(err);
  }
});

router.post('/', requireRole(['admin']), validate(createUserSchema), async (req, res, next) => {
  try {
    const { coachingId } = req.tenant;
    const b = req.validated.body;
    const passwordHash = await hashPassword(b.password);

    const result = await query(
      `INSERT INTO users (coaching_id, full_name, email, phone, password_hash, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, coaching_id, full_name, email, phone, role, is_active, created_at`,
      [coachingId, b.full_name, b.email, b.phone || null, passwordHash, b.role]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    return next(err);
  }
});

router.patch('/:id/active', requireRole(['admin']), async (req, res, next) => {
  try {
    const { coachingId } = req.tenant;
    const { id } = req.params;
    const { is_active } = req.body;

    const result = await query(
      `UPDATE users
       SET is_active = $1
       WHERE id = $2 AND coaching_id = $3
       RETURNING id, full_name, email, role, is_active`,
      [Boolean(is_active), id, coachingId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
