const express = require('express');
const authRoutes = require('./v1/auth.routes');
const studentRoutes = require('./v1/students.routes');
const feeRoutes = require('./v1/fees.routes');
const paymentRoutes = require('./v1/payments.routes');
const attendanceRoutes = require('./v1/attendance.routes');
const notificationRoutes = require('./v1/notifications.routes');
const dashboardRoutes = require('./v1/dashboard.routes');
const webhookRoutes = require('./v1/webhook.routes');
const userRoutes = require('./v1/users.routes');
const parentRoutes = require('./v1/parents.routes');
const opsRoutes = require('./v1/ops.routes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/students', studentRoutes);
router.use('/fees', feeRoutes);
router.use('/payments', paymentRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/notifications', notificationRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/users', userRoutes);
router.use('/parents', parentRoutes);
router.use('/ops', opsRoutes);

module.exports = router;
