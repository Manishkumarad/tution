const API = 'http://localhost:4000/api/v1';
const FRONTEND = 'http://localhost:3000';

const credentials = {
  coachingCode: 'demo392794',
  email: 'admin-392794@demo.com',
  password: 'Admin@123'
};

async function call(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_err) {
    data = text;
  }
  return { ok: res.ok, status: res.status, data };
}

async function run() {
  const results = [];

  const health = await call('http://localhost:4000/health');
  results.push({ step: 'Backend health', ok: health.ok && health.data?.status === 'ok', detail: health.data });

  const front = await call(FRONTEND);
  results.push({ step: 'Frontend reachable', ok: front.ok && String(front.data).includes('<div id="root"></div>'), detail: front.status });

  const login = await call(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(credentials)
  });

  if (!login.ok) {
    results.push({ step: 'Faculty login', ok: false, detail: login.data });
    console.table(results);
    process.exit(1);
  }

  const token = login.data.tokens.accessToken;
  const authHeaders = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  results.push({ step: 'Faculty login', ok: true, detail: login.data.user.email });

  const summary = await call(`${API}/dashboard/summary`, { headers: authHeaders });
  results.push({ step: 'Dashboard summary', ok: summary.ok, detail: summary.data });

  const plans = await call(`${API}/fees/plans`, { headers: authHeaders });
  const firstPlan = plans.data?.[0];
  results.push({ step: 'Fee plans fetch', ok: plans.ok && !!firstPlan, detail: firstPlan?.id || null });

  const studentPayload = {
    full_name: `Smoke Student ${Date.now().toString().slice(-5)}`,
    phone: '9000000000',
    class_name: '11th',
    parent_name: 'Smoke Parent',
    parent_phone: '9000000001',
    fee_plan_id: Number(firstPlan.id)
  };

  const createdStudent = await call(`${API}/students`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(studentPayload)
  });
  results.push({ step: 'Create student', ok: createdStudent.ok, detail: createdStudent.data?.id || createdStudent.data });

  const studentId = Number(createdStudent.data?.id);
  const studentDetails = await call(`${API}/students/${studentId}`, { headers: authHeaders });
  results.push({ step: 'Student details', ok: studentDetails.ok, detail: studentDetails.data?.student_code || null });

  const payment = await call(`${API}/payments/manual`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      student_id: studentId,
      amount: 500,
      method: 'cash',
      payment_mode: 'partial',
      transaction_ref: `SMOKE-${Date.now()}`
    })
  });
  results.push({ step: 'Manual payment', ok: payment.ok, detail: payment.data?.status || payment.data });

  const pass = await call(`${API}/students/${studentId}/pass`, { headers: authHeaders });
  results.push({ step: 'Student pass API', ok: pass.ok && !!pass.data?.qr_data_url, detail: pass.data?.fee_status || null });

  const qrToken = studentDetails.data?.qr_token;
  const scan = await call(`${API}/attendance/scan`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ qr_token: qrToken })
  });
  results.push({ step: 'QR attendance scan', ok: scan.ok, detail: scan.data?.entry_result || scan.data });

  const notif = await call(`${API}/notifications/send-test`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      channel: 'email',
      recipient: 'manishkumards37@gmail.com',
      template_key: 'due_today',
      payload: { student_name: 'Smoke', due_amount: 123, due_date: '2026-04-10' }
    })
  });
  results.push({ step: 'Send test notification', ok: notif.ok, detail: notif.data?.status || notif.data });

  const logs = await call(`${API}/notifications/logs`, { headers: authHeaders });
  results.push({ step: 'Notification logs fetch', ok: logs.ok && Array.isArray(logs.data), detail: Array.isArray(logs.data) ? logs.data.length : null });

  console.table(results.map((r) => ({ Step: r.step, Passed: r.ok, Detail: typeof r.detail === 'string' ? r.detail : JSON.stringify(r.detail).slice(0, 100) })));

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Smoke test crashed:', err.message);
  process.exit(1);
});
