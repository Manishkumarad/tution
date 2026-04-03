const autocannon = require('autocannon');

function parseArg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] || fallback;
}

async function run() {
  const url = parseArg('url', 'http://localhost:4000/health');
  const connections = Number(parseArg('connections', '200'));
  const duration = Number(parseArg('duration', '60'));
  const pipelining = Number(parseArg('pipelining', '1'));
  const workers = Number(parseArg('workers', '2'));
  const timeout = Number(parseArg('timeout', '15'));
  const method = parseArg('method', 'GET');
  const body = parseArg('body', '');
  const authToken = parseArg('token', '');

  const headers = {
    'content-type': 'application/json'
  };

  if (authToken) {
    headers.authorization = `Bearer ${authToken}`;
  }

  const instance = autocannon({
    url,
    method,
    body: body || undefined,
    headers,
    connections,
    duration,
    workers,
    pipelining,
    timeout,
    renderProgressBar: true,
    renderLatencyTable: true,
    renderResultsTable: true
  });

  autocannon.track(instance, { renderProgressBar: true });

  instance.on('done', (result) => {
    const latency = result.latency || {};
    const p95 = latency.p95 ?? latency.p97_5 ?? latency['95'] ?? latency['97.5'] ?? latency.p99 ?? 0;
    const summary = {
      url,
      duration_seconds: duration,
      connections,
      workers,
      avg_latency_ms: Number(latency.average || 0),
      p95_latency_ms: Number(p95 || 0),
      req_per_sec_avg: Number(result.requests?.average || 0),
      req_per_sec_total: Number(result.requests?.total || 0),
      errors: Number(result.errors || 0),
      timeouts: Number(result.timeouts || 0),
      non_2xx: Number(result.non2xx || 0)
    };

    console.log('\nLOAD_TEST_SUMMARY');
    console.log(JSON.stringify(summary, null, 2));

    const hasFailures = summary.errors > 0 || summary.timeouts > 0 || summary.non_2xx > 0;
    if (hasFailures) {
      process.exitCode = 1;
    }
  });
}

run().catch((err) => {
  console.error('Load test failed:', err.message);
  process.exit(1);
});
