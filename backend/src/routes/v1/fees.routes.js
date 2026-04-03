const express = require('express');
const { z } = require('zod');
const { query } = require('../../config/db');
const { requireAuth } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenant');
const { requireRole } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validate');

const router = express.Router();
router.use(requireAuth, requireTenant);

const createPlanSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    fee_type: z.enum(['full', 'half', 'monthly']),
    amount_total: z.number().positive(),
    installment_count: z.number().int().positive().default(1),
    billing_cycle_days: z.number().int().positive().default(30),
    due_day_of_month: z.number().int().min(1).max(28).optional()
  }),
  params: z.any(),
  query: z.any()
});

const updatePlanSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    fee_type: z.enum(['full', 'half', 'monthly']).optional(),
    amount_total: z.number().positive().optional(),
    installment_count: z.number().int().positive().optional(),
    billing_cycle_days: z.number().int().positive().optional(),
    due_day_of_month: z.number().int().min(1).max(28).nullable().optional(),
    is_active: z.boolean().optional()
  }).refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required'
  }),
  params: z.object({
    planId: z.string().regex(/^\d+$/)
  }),
  query: z.any()
});

router.get('/plans', requireRole(['admin', 'faculty', 'receptionist']), async (req, res, next) => {
  try {
    const { coachingId } = req.tenant;
    const result = await query(
      `SELECT * FROM fee_plans WHERE coaching_id = $1 ORDER BY id DESC`,
      [coachingId]
    );
    return res.json(result.rows);
  } catch (err) {
    return next(err);
  }
});

router.post('/plans', requireRole(['admin']), validate(createPlanSchema), async (req, res, next) => {
  try {
    const { coachingId } = req.tenant;
    const b = req.validated.body;
    const result = await query(
      `INSERT INTO fee_plans (
        coaching_id, name, fee_type, amount_total, installment_count, billing_cycle_days, due_day_of_month
      ) VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *`,
      [
        coachingId,
        b.name,
        b.fee_type,
        b.amount_total,
        b.installment_count,
        b.billing_cycle_days,
        b.due_day_of_month || null
      ]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    return next(err);
  }
});

router.patch('/plans/:planId', requireRole(['admin']), validate(updatePlanSchema), async (req, res, next) => {
  try {
    const { coachingId } = req.tenant;
    const { planId } = req.validated.params;
    const b = req.validated.body;

    const fields = [];
    const values = [];
    let i = 1;

    const assign = (column, value) => {
      fields.push(`${column} = $${i}`);
      values.push(value);
      i += 1;
    };

    if (Object.prototype.hasOwnProperty.call(b, 'name')) assign('name', b.name);
    if (Object.prototype.hasOwnProperty.call(b, 'fee_type')) assign('fee_type', b.fee_type);
    if (Object.prototype.hasOwnProperty.call(b, 'amount_total')) assign('amount_total', b.amount_total);
    if (Object.prototype.hasOwnProperty.call(b, 'installment_count')) assign('installment_count', b.installment_count);
    if (Object.prototype.hasOwnProperty.call(b, 'billing_cycle_days')) assign('billing_cycle_days', b.billing_cycle_days);
    if (Object.prototype.hasOwnProperty.call(b, 'due_day_of_month')) assign('due_day_of_month', b.due_day_of_month);
    if (Object.prototype.hasOwnProperty.call(b, 'is_active')) assign('is_active', b.is_active);

    values.push(coachingId, Number(planId));
    const result = await query(
      `UPDATE fee_plans
       SET ${fields.join(', ')}
       WHERE coaching_id = $${i} AND id = $${i + 1}
       RETURNING *`,
      values
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: 'Fee plan not found' });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    return next(err);
  }
});

router.post('/plans/bootstrap', requireRole(['admin', 'faculty', 'receptionist']), async (req, res, next) => {
  try {
    const { coachingId } = req.tenant;
    const existing = await query(
      `SELECT name FROM fee_plans WHERE coaching_id = $1`,
      [coachingId]
    );

    const existingNames = new Set(existing.rows.map((r) => (r.name || '').toLowerCase()));
    const recommended = [
      { name: 'Full Paid (12 Month)', fee_type: 'full', amount_total: 12000, installment_count: 1, billing_cycle_days: 365 },
      { name: 'Six Month Plan', fee_type: 'half', amount_total: 6500, installment_count: 1, billing_cycle_days: 180 },
      { name: 'Three Month Plan', fee_type: 'half', amount_total: 3600, installment_count: 1, billing_cycle_days: 90 },
      { name: 'Monthly Charges', fee_type: 'monthly', amount_total: 1300, installment_count: 1, billing_cycle_days: 30 }
    ];

    let added = 0;
    for (const plan of recommended) {
      if (existingNames.has(plan.name.toLowerCase())) {
        continue;
      }

      await query(
        `INSERT INTO fee_plans (coaching_id, name, fee_type, amount_total, installment_count, billing_cycle_days, due_day_of_month)
         VALUES ($1, $2, $3, $4, $5, $6, NULL)`,
        [coachingId, plan.name, plan.fee_type, plan.amount_total, plan.installment_count, plan.billing_cycle_days]
      );
      added += 1;
    }

    const seeded = await query(
      `SELECT * FROM fee_plans WHERE coaching_id = $1 ORDER BY id DESC`,
      [coachingId]
    );

    return res.json({ created: added > 0, added, plans: seeded.rows });
  } catch (err) {
    return next(err);
  }
});

router.get('/accounts/:studentId', requireRole(['admin', 'faculty', 'receptionist']), async (req, res, next) => {
  try {
    const { coachingId } = req.tenant;
    const { studentId } = req.params;
    const result = await query(
      `SELECT * FROM student_fee_accounts
       WHERE coaching_id = $1 AND student_id = $2`,
      [coachingId, studentId]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ message: 'Fee account not found' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
