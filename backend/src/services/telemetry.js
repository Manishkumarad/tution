const MAX_SAMPLES = 1000;

const state = {
  startedAt: new Date(),
  api: {
    total: 0,
    success: 0,
    clientError: 0,
    serverError: 0,
    durations: [],
    byRoute: new Map()
  },
  db: {
    total: 0,
    retries: 0,
    errors: 0,
    durations: []
  }
};

function pushSample(buffer, value) {
  buffer.push(value);
  if (buffer.length > MAX_SAMPLES) {
    buffer.shift();
  }
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function normalizePath(path) {
  return String(path || '')
    .split('?')[0]
    .replace(/\/\d+/g, '/:id')
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':uuid');
}

function recordApiRequest({ method, path, statusCode, durationMs }) {
  const routeKey = `${String(method || 'GET').toUpperCase()} ${normalizePath(path)}`;

  state.api.total += 1;
  if (statusCode >= 500) {
    state.api.serverError += 1;
  } else if (statusCode >= 400) {
    state.api.clientError += 1;
  } else {
    state.api.success += 1;
  }

  pushSample(state.api.durations, durationMs);

  if (!state.api.byRoute.has(routeKey)) {
    state.api.byRoute.set(routeKey, {
      total: 0,
      lastStatus: 0,
      durations: []
    });
  }

  const route = state.api.byRoute.get(routeKey);
  route.total += 1;
  route.lastStatus = statusCode;
  pushSample(route.durations, durationMs);
}

function recordDbQuery({ durationMs, failed = false }) {
  state.db.total += 1;
  if (failed) {
    state.db.errors += 1;
  }
  pushSample(state.db.durations, durationMs);
}

function recordDbRetry() {
  state.db.retries += 1;
}

function getRouteBreakdown(limit = 20) {
  return [...state.api.byRoute.entries()]
    .map(([route, data]) => ({
      route,
      total: data.total,
      p50_ms: percentile(data.durations, 50),
      p95_ms: percentile(data.durations, 95),
      last_status: data.lastStatus
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

function getMetricsSnapshot() {
  return {
    started_at: state.startedAt.toISOString(),
    uptime_seconds: Math.round(process.uptime()),
    process: {
      pid: process.pid,
      node_version: process.version,
      memory_rss_mb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
      heap_used_mb: Math.round(process.memoryUsage().heapUsed / (1024 * 1024))
    },
    api: {
      total_requests: state.api.total,
      success: state.api.success,
      client_errors: state.api.clientError,
      server_errors: state.api.serverError,
      p50_ms: percentile(state.api.durations, 50),
      p95_ms: percentile(state.api.durations, 95),
      p99_ms: percentile(state.api.durations, 99),
      top_routes: getRouteBreakdown()
    },
    db: {
      total_queries: state.db.total,
      retries: state.db.retries,
      errors: state.db.errors,
      p50_ms: percentile(state.db.durations, 50),
      p95_ms: percentile(state.db.durations, 95),
      p99_ms: percentile(state.db.durations, 99)
    }
  };
}

function toPrometheusMetrics() {
  const m = getMetricsSnapshot();
  const lines = [
    '# HELP app_uptime_seconds Process uptime in seconds',
    '# TYPE app_uptime_seconds gauge',
    `app_uptime_seconds ${m.uptime_seconds}`,
    '# HELP app_memory_rss_mb Resident memory in MB',
    '# TYPE app_memory_rss_mb gauge',
    `app_memory_rss_mb ${m.process.memory_rss_mb}`,
    '# HELP app_heap_used_mb Heap used in MB',
    '# TYPE app_heap_used_mb gauge',
    `app_heap_used_mb ${m.process.heap_used_mb}`,
    '# HELP api_requests_total Total API requests',
    '# TYPE api_requests_total counter',
    `api_requests_total ${m.api.total_requests}`,
    '# HELP api_requests_success_total Successful API requests',
    '# TYPE api_requests_success_total counter',
    `api_requests_success_total ${m.api.success}`,
    '# HELP api_requests_client_errors_total API 4xx responses',
    '# TYPE api_requests_client_errors_total counter',
    `api_requests_client_errors_total ${m.api.client_errors}`,
    '# HELP api_requests_server_errors_total API 5xx responses',
    '# TYPE api_requests_server_errors_total counter',
    `api_requests_server_errors_total ${m.api.server_errors}`,
    '# HELP api_latency_p50_ms API latency p50 in ms',
    '# TYPE api_latency_p50_ms gauge',
    `api_latency_p50_ms ${m.api.p50_ms}`,
    '# HELP api_latency_p95_ms API latency p95 in ms',
    '# TYPE api_latency_p95_ms gauge',
    `api_latency_p95_ms ${m.api.p95_ms}`,
    '# HELP api_latency_p99_ms API latency p99 in ms',
    '# TYPE api_latency_p99_ms gauge',
    `api_latency_p99_ms ${m.api.p99_ms}`,
    '# HELP db_queries_total Total DB queries',
    '# TYPE db_queries_total counter',
    `db_queries_total ${m.db.total_queries}`,
    '# HELP db_retries_total Total DB retries',
    '# TYPE db_retries_total counter',
    `db_retries_total ${m.db.retries}`,
    '# HELP db_errors_total Total DB query errors',
    '# TYPE db_errors_total counter',
    `db_errors_total ${m.db.errors}`,
    '# HELP db_latency_p50_ms DB latency p50 in ms',
    '# TYPE db_latency_p50_ms gauge',
    `db_latency_p50_ms ${m.db.p50_ms}`,
    '# HELP db_latency_p95_ms DB latency p95 in ms',
    '# TYPE db_latency_p95_ms gauge',
    `db_latency_p95_ms ${m.db.p95_ms}`,
    '# HELP db_latency_p99_ms DB latency p99 in ms',
    '# TYPE db_latency_p99_ms gauge',
    `db_latency_p99_ms ${m.db.p99_ms}`
  ];

  return `${lines.join('\n')}\n`;
}

module.exports = {
  recordApiRequest,
  recordDbQuery,
  recordDbRetry,
  getMetricsSnapshot,
  toPrometheusMetrics
};
