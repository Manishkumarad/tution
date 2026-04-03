const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const env = require('./config/env');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/error-handler');
const { recordApiRequest, toPrometheusMetrics } = require('./services/telemetry');

const app = express();

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    }
  })
);
app.use(helmet());
app.use(cors({ origin: env.corsOrigin === '*' ? true : env.corsOrigin }));
app.use(morgan('dev'));

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    recordApiRequest({
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt
    });
  });
  next();
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/v1/auth', authLimiter);
app.use('/api/v1', routes);
app.use('/receipts', express.static(path.join(__dirname, '../storage/receipts')));

app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'tution-backend',
    message: 'Backend is running. Use /api/v1 for API routes.'
  });
});

app.get('/api/v1', (_req, res) => {
  res.json({
    status: 'ok',
    message: 'Tution API v1 is running.'
  });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/metrics', (req, res) => {
  if (!env.metricsEnabled) {
    return res.status(404).json({ message: 'Metrics disabled' });
  }

  if (env.metricsToken) {
    const headerToken = req.headers['x-metrics-token'];
    if (headerToken !== env.metricsToken) {
      return res.status(401).json({ message: 'Unauthorized metrics access' });
    }
  }

  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  return res.send(toPrometheusMetrics());
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;
