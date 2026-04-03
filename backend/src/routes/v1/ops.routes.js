const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenant');
const { requireRole } = require('../../middleware/rbac');
const { getMetricsSnapshot } = require('../../services/telemetry');

const router = express.Router();
router.use(requireAuth, requireTenant, requireRole(['admin']));

router.get('/metrics', (_req, res) => {
  return res.json(getMetricsSnapshot());
});

module.exports = router;
