import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MetricCard from '../components/MetricCard';
import StatusPill from '../components/StatusPill';
import { bootstrapFeePlans, createMembershipOrder, createStudent, fetchFeePlans, fetchMembershipPlans, fetchMyProfile, fetchRevenue, fetchStudentById, fetchStudents, fetchSummary, recordManualPayment, triggerAllPendingReminders, verifyMembershipOrder } from '../services/api';

const RevenueChart = lazy(() => import('../components/RevenueChart'));

const MEMBERSHIP_FALLBACK = [
  {
    code: 'monthly',
    label: 'Premium Monthly',
    price: 3500,
    durationMonths: 1,
    maxStudents: 300,
    features: ['Up to 300 students', 'Priority support', 'Faster reminder processing']
  },
  {
    code: 'six_month',
    label: 'Premium 6 Months',
    price: 20000,
    durationMonths: 6,
    maxStudents: 1000,
    features: ['Up to 1000 students', 'Everything in Monthly', 'Advanced reporting and exports']
  },
  {
    code: 'yearly',
    label: 'Premium 1 Year',
    price: 35000,
    durationMonths: 12,
    maxStudents: 5000,
    features: ['Up to 5000 students', 'Everything in 6 Months', 'Quick Send Message access']
  }
];

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [revenue, setRevenue] = useState([]);
  const [profile, setProfile] = useState(null);
  const [students, setStudents] = useState([]);
  const [plans, setPlans] = useState([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [showFeeModal, setShowFeeModal] = useState(false);
  const [showMembershipModal, setShowMembershipModal] = useState(false);
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentDetailState, setStudentDetailState] = useState({ loading: false, message: '' });
  const [membershipPlans, setMembershipPlans] = useState([]);
  const [membershipState, setMembershipState] = useState({ loading: false, message: '' });
  const [addState, setAddState] = useState({ loading: false, message: '' });
  const [planMessage, setPlanMessage] = useState('');
  const [quickActionNote, setQuickActionNote] = useState('');
  const [paymentState, setPaymentState] = useState({ loading: false, message: '' });
  const [paymentForm, setPaymentForm] = useState({
    student_id: '',
    amount: '',
    method: 'cash',
    payment_mode: 'monthly',
    transaction_ref: ''
  });
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    class_name: '',
    parent_name: '',
    parent_phone: '',
    family_details: '',
    address: '',
    initial_fee_payment: 'none',
    initial_payment_method: 'cash',
    initial_payment_transaction_ref: '',
    fee_plan_id: '',
    admission_date: '',
    photo_url: ''
  });

  const canShowRegistrationPaymentOptions = Boolean(
    form.full_name.trim()
    && form.phone.trim()
    && form.class_name
    && form.parent_name.trim()
    && form.parent_phone.trim()
    && form.family_details.trim()
    && form.address.trim()
    && form.fee_plan_id
  );

  const limit = 10;

  useEffect(() => {
    Promise.all([fetchSummary(), fetchMyProfile()])
      .then(([s, p]) => {
        setSummary(s);
        setProfile(p);
      })
      .catch(() => {
        setSummary({
          total_students: 0,
          paid_students: 0,
          pending_students: 0,
          pending_dues: 0,
          today_entries: 0,
          month_revenue: 0,
          today_new_students: 0,
          today_fee_collection: 0
        });
      });
  }, []);

  useEffect(() => {
    fetchMembershipPlans()
      .then((res) => {
        const rows = (res?.plans || []).filter((item) => item.code !== 'starter' && item.code !== 'premium');
        setMembershipPlans(rows.length ? rows : MEMBERSHIP_FALLBACK);
      })
      .catch(() => {
        setMembershipPlans(MEMBERSHIP_FALLBACK);
      });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchRevenue()
        .then((r) => {
          setRevenue((r || []).map((item) => ({ month: item.month?.slice(0, 7), revenue: Number(item.revenue) })));
        })
        .catch(() => {
          setRevenue([]);
        });
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    fetchStudents({ page, limit, q: query || undefined })
      .then((res) => {
        setStudents(res.data || []);
        setTotal(res.total || 0);
      })
      .catch(() => {
        setStudents([]);
      });
  }, [page, query]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total]);

  async function ensureFeePlansLoaded() {
    if (plans.length > 0) return;

    const fp = await fetchFeePlans().catch(() => []);
    if ((fp || []).length > 0) {
      setPlans(fp);
      setPlanMessage('');
      return;
    }

    const seeded = await bootstrapFeePlans().catch(() => null);
    if (seeded?.plans?.length) {
      setPlans(seeded.plans);
      setPlanMessage(seeded.added > 0 ? 'Recommended fee plans added automatically.' : '');
    } else {
      setPlanMessage('No fee plans found.');
    }
  }

  async function onAddStudent(e) {
    e.preventDefault();
    setAddState({ loading: true, message: '' });

    try {
      const payload = {
        full_name: form.full_name.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim(),
        class_name: form.class_name,
        parent_name: form.parent_name.trim() || undefined,
        parent_phone: form.parent_phone.trim() || undefined,
        family_details: form.family_details.trim() || undefined,
        address: form.address.trim() || undefined,
        initial_fee_payment: canShowRegistrationPaymentOptions ? form.initial_fee_payment : 'none',
        initial_payment_method: canShowRegistrationPaymentOptions && form.initial_fee_payment !== 'none' ? form.initial_payment_method : undefined,
        initial_payment_transaction_ref: canShowRegistrationPaymentOptions && form.initial_fee_payment !== 'none'
          ? (form.initial_payment_transaction_ref.trim() || undefined)
          : undefined,
        admission_date: form.admission_date || undefined,
        photo_url: form.photo_url.trim() || undefined,
        fee_plan_id: Number(form.fee_plan_id)
      };

      await createStudent({
        ...payload
      });
      setAddState({ loading: false, message: 'Student registered successfully.' });
      setForm({
        full_name: '',
        email: '',
        phone: '',
        class_name: '',
        parent_name: '',
        parent_phone: '',
        family_details: '',
        address: '',
        initial_fee_payment: 'none',
        initial_payment_method: 'cash',
        initial_payment_transaction_ref: '',
        fee_plan_id: '',
        admission_date: '',
        photo_url: ''
      });
      const refreshedSummary = await fetchSummary();
      setSummary(refreshedSummary);
      const refreshed = await fetchStudents({ page: 1, limit, q: query || undefined });
      setStudents(refreshed.data || []);
      setTotal(refreshed.total || 0);
      setPage(1);
    } catch (err) {
      setAddState({ loading: false, message: err.response?.data?.message || 'Failed to register student.' });
    }
  }

  async function onRecordFee(e) {
    e.preventDefault();
    setPaymentState({ loading: true, message: '' });
    try {
      await recordManualPayment({
        student_id: Number(paymentForm.student_id),
        amount: Number(paymentForm.amount),
        method: paymentForm.method,
        payment_mode: paymentForm.payment_mode,
        transaction_ref: paymentForm.transaction_ref || undefined
      });
      setPaymentState({ loading: false, message: 'Payment recorded successfully.' });
      setQuickActionNote('Fee recorded successfully via manual entry.');
      setShowFeeModal(false);
      setPaymentForm({ student_id: '', amount: '', method: 'cash', payment_mode: 'monthly', transaction_ref: '' });
      const refreshed = await fetchSummary();
      setSummary(refreshed);
    } catch (err) {
      setPaymentState({ loading: false, message: err.response?.data?.message || 'Failed to record payment.' });
    }
  }

  async function onSendReminder() {
    setQuickActionNote('Sending reminders to all pending students...');
    try {
      const res = await triggerAllPendingReminders();
      setQuickActionNote(res.message || 'Due reminders triggered successfully.');
    } catch (err) {
      setQuickActionNote(err.response?.data?.message || 'Failed to trigger reminders.');
    }
  }

  async function onOpenStudentDetails(studentId) {
    setShowStudentModal(true);
    setSelectedStudent(null);
    setStudentDetailState({ loading: true, message: '' });
    try {
      const detail = await fetchStudentById(studentId);
      setSelectedStudent(detail);
      setStudentDetailState({ loading: false, message: '' });
    } catch (err) {
      setStudentDetailState({ loading: false, message: err.response?.data?.message || 'Failed to load student details.' });
    }
  }

  async function onUpgradeMembership(planType) {
    setMembershipState({ loading: true, message: '' });
    try {
      const orderData = await createMembershipOrder({ planType });
      const loaded = await loadRazorpayScript();
      if (!loaded || !window.Razorpay) {
        setMembershipState({ loading: false, message: 'Unable to load Razorpay checkout.' });
        return;
      }

      const options = {
        key: orderData.key_id,
        amount: orderData.order.amount,
        currency: orderData.order.currency,
        name: 'Tution Membership',
        description: orderData.plan?.label || 'Membership Upgrade',
        order_id: orderData.order.id,
        prefill: {
          name: profile?.full_name || '',
          email: profile?.email || '',
          contact: profile?.coaching_phone || ''
        },
        notes: {
          plan_type: orderData.plan?.code || planType
        },
        theme: {
          color: '#0f9484'
        },
        handler: async (response) => {
          try {
            const verifyData = await verifyMembershipOrder({
              membership_payment_id: orderData.membership_payment.id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            });

            setProfile((prev) => ({
              ...prev,
              plan_type: verifyData?.coaching?.plan_type || prev?.plan_type,
              max_students: verifyData?.coaching?.max_students || prev?.max_students,
              membership_started_at: verifyData?.coaching?.membership_started_at || prev?.membership_started_at,
              membership_valid_till: verifyData?.coaching?.membership_valid_till || prev?.membership_valid_till
            }));
            setMembershipState({ loading: false, message: verifyData?.message || 'Membership upgraded successfully.' });
            setShowMembershipModal(false);
            setQuickActionNote(verifyData?.message || 'Membership upgraded successfully.');
          } catch (verifyErr) {
            setMembershipState({ loading: false, message: verifyErr.response?.data?.message || 'Payment verification failed.' });
          }
        },
        modal: {
          ondismiss: () => {
            setMembershipState({ loading: false, message: 'Payment cancelled.' });
          }
        }
      };

      const checkout = new window.Razorpay(options);
      checkout.open();
    } catch (err) {
      setMembershipState({ loading: false, message: err.response?.data?.message || 'Failed to upgrade membership.' });
    }
  }

  if (!summary) return <p>Loading dashboard...</p>;

  return (
    <section>
      <div className="dashboard-head">
        <div>
          <h2 className="page-title">Faculty Dashboard</h2>
          <p className="subtle">Manage students, fees, and coaching profile from one place.</p>
        </div>
        <button
          className="btn"
          onClick={async () => {
            setShowAdd(true);
            await ensureFeePlansLoaded();
          }}
        >
          + Add Student
        </button>
      </div>

      <div className="profile-row">
        <article className="profile-card">
          <h3>{profile?.coaching_name || 'Coaching Profile'}</h3>
          <p><strong>Code:</strong> {profile?.coaching_code || '-'}</p>
          <p><strong>Owner:</strong> {profile?.full_name || '-'}</p>
          <p><strong>Email:</strong> {profile?.email || '-'}</p>
          <p><strong>Phone:</strong> {profile?.coaching_phone || '-'}</p>
        </article>
        <article className="membership-card">
          <h3>Membership</h3>
          <span className={`membership-badge ${(profile?.plan_type || 'starter') === 'starter' ? 'starter' : 'premium'}`}>
            {(profile?.plan_type || 'starter').toUpperCase()}
          </span>
          <p><strong>Student Limit:</strong> {profile?.max_students ?? 5}</p>
          <p><strong>Valid Till:</strong> {profile?.membership_valid_till ? new Date(profile.membership_valid_till).toLocaleDateString() : 'Not active'}</p>
          <p>Starter plan allows only 5 students. Upgrade to unlock higher limits and premium features.</p>
          <button className="btn" onClick={() => setShowMembershipModal(true)}>Upgrade Membership</button>
          {membershipState.message ? <p className="subtle">{membershipState.message}</p> : null}
        </article>
      </div>

      <div className="grid metrics">
        <MetricCard title="Total Students" value={summary.total_students} />
        <MetricCard title="Today New Students" value={summary.today_new_students || 0} />
        <MetricCard title="Paid" value={summary.paid_students} tone="ok" />
        <MetricCard title="Pending" value={summary.pending_students} tone="bad" />
        <MetricCard title="Today Fee Collection" value={`Rs ${summary.today_fee_collection || 0}`} tone="ok" />
        <MetricCard title="Month Revenue" value={`Rs ${summary.month_revenue}`} tone="accent" />
      </div>

      <div className="chart-card">
        <h3>Growth Chart</h3>
        <Suspense fallback={<p className="subtle">Loading chart...</p>}>
          <RevenueChart data={revenue} />
        </Suspense>
      </div>

      <div className="card">
        <div className="dashboard-head">
          <h3>Quick Actions</h3>
        </div>
        <div className="quick-actions-grid">
          <button
            className="quick-action-btn"
            onClick={async () => {
              setShowAdd(true);
              await ensureFeePlansLoaded();
            }}
          >
            <span className="quick-action-icon qa-blue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M19 8h4" />
                <path d="M21 6v4" />
              </svg>
            </span>
            <strong>Add Student</strong>
            <span>Register new</span>
          </button>
          <button
            className="quick-action-btn"
            onClick={() => {
              setShowFeeModal(true);
              setQuickActionNote('Record fee using manual payment entry.');
            }}
          >
            <span className="quick-action-icon qa-green">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="6" width="20" height="12" rx="2" />
                <path d="M2 10h20" />
              </svg>
            </span>
            <strong>Record Fee</strong>
            <span>Cash / UPI</span>
          </button>
          <button className="quick-action-btn" onClick={() => navigate('/scan')}>
            <span className="quick-action-icon qa-amber">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h4v4H4z" />
                <path d="M16 4h4v4h-4z" />
                <path d="M4 16h4v4H4z" />
                <path d="M16 16h1v1h-1z" />
                <path d="M19 16h1v1h-1z" />
                <path d="M16 19h1v1h-1z" />
                <path d="M19 19h1v1h-1z" />
              </svg>
            </span>
            <strong>Scan QR</strong>
            <span>Entry gate</span>
          </button>
          <button
            className="quick-action-btn"
            onClick={onSendReminder}
          >
            <span className="quick-action-icon qa-red">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.18h3a2 2 0 0 1 2 1.72 13 13 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 13 13 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </span>
            <strong>Send Reminder</strong>
            <span>{summary.pending_students || 0} pending</span>
          </button>
          <button
            className="quick-action-btn"
            disabled={(profile?.plan_type || 'starter') !== 'yearly'}
            onClick={() => {
              setQuickActionNote('Quick Send Message is available in Yearly membership.');
            }}
          >
            <span className="quick-action-icon qa-blue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </span>
            <strong>Quick Send Message</strong>
            <span>{(profile?.plan_type || 'starter') === 'yearly' ? 'Unlocked in yearly plan' : 'Unlock with 1-year plan'}</span>
          </button>
        </div>
        {quickActionNote ? <p className="subtle">{quickActionNote}</p> : null}
      </div>

      <div className="table-wrap">
        <div className="toolbar">
          <input
            placeholder="Search student by name"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Class</th>
              <th>Status</th>
              <th>Student Code</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id} className="click-row" onClick={() => onOpenStudentDetails(s.id)}>
                <td>{s.full_name}</td>
                <td>{s.class_name || '-'}</td>
                <td><StatusPill status={s.status} /></td>
                <td>{s.student_code}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="pager">
          <button className="btn ghost" onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
          <span>Page {page} / {totalPages}</span>
          <button className="btn ghost" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
        </div>
      </div>

      {showAdd ? (
        <div className="modal-backdrop" onClick={() => setShowAdd(false)}>
          <div className="modal-card pop-in" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Student Registration</h3>
              <button className="btn ghost" onClick={() => setShowAdd(false)}>Close</button>
            </div>

            <form className="form-grid" onSubmit={onAddStudent}>
              <input required placeholder="Student Name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              <input type="email" placeholder="Student Email (optional)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <input required placeholder="Student Phone (mandatory)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <select required value={form.class_name} onChange={(e) => setForm({ ...form, class_name: e.target.value })}>
                <option value="">Select Class</option>
                <option value="8th">8th</option>
                <option value="9th">9th</option>
                <option value="10th">10th</option>
                <option value="11th">11th</option>
                <option value="12th">12th</option>
              </select>
              <input required placeholder="Parent Name" value={form.parent_name} onChange={(e) => setForm({ ...form, parent_name: e.target.value })} />
              <input required placeholder="Parent Phone" value={form.parent_phone} onChange={(e) => setForm({ ...form, parent_phone: e.target.value })} />
              <input required placeholder="Family Details" value={form.family_details} onChange={(e) => setForm({ ...form, family_details: e.target.value })} />
              <input required placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              <input type="date" placeholder="Admission Date" value={form.admission_date} onChange={(e) => setForm({ ...form, admission_date: e.target.value })} />
              <input placeholder="Photo URL" value={form.photo_url} onChange={(e) => setForm({ ...form, photo_url: e.target.value })} />
              <select required value={form.fee_plan_id} onChange={(e) => setForm({ ...form, fee_plan_id: e.target.value })}>
                <option value="">Select Fee Plan</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>{plan.name} - Rs {plan.amount_total}</option>
                ))}
              </select>
              {planMessage ? <p className="subtle">{planMessage}</p> : null}

              {canShowRegistrationPaymentOptions ? (
                <>
                  <select value={form.initial_fee_payment} onChange={(e) => setForm({ ...form, initial_fee_payment: e.target.value })}>
                    <option value="none">Pay Fee Now: No</option>
                    <option value="half">Pay Fee Now: Half</option>
                    <option value="full">Pay Fee Now: Full</option>
                  </select>

                  {form.initial_fee_payment !== 'none' ? (
                    <>
                      <select value={form.initial_payment_method} onChange={(e) => setForm({ ...form, initial_payment_method: e.target.value })}>
                        <option value="cash">Cash</option>
                        <option value="upi">UPI</option>
                        <option value="card">Card</option>
                        <option value="netbanking">Net Banking</option>
                      </select>
                      <input placeholder="Initial Payment Transaction Ref (optional)" value={form.initial_payment_transaction_ref} onChange={(e) => setForm({ ...form, initial_payment_transaction_ref: e.target.value })} />
                    </>
                  ) : null}
                </>
              ) : (
                <p className="subtle">Fill all registration details and fee plan to unlock pay-fee options.</p>
              )}

              <button className="btn" disabled={addState.loading}>{addState.loading ? 'Saving...' : 'Register Student'}</button>
              {addState.message ? <p className="subtle">{addState.message}</p> : null}
            </form>
          </div>
        </div>
      ) : null}

      {showFeeModal ? (
        <div className="modal-backdrop" onClick={() => setShowFeeModal(false)}>
          <div className="modal-card pop-in" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Record Fee (Cash / UPI)</h3>
              <button className="btn ghost" onClick={() => setShowFeeModal(false)}>Close</button>
            </div>

            <form className="form-grid" onSubmit={onRecordFee}>
              <select required value={paymentForm.student_id} onChange={(e) => setPaymentForm({ ...paymentForm, student_id: e.target.value })}>
                <option value="">Select Student</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name} ({s.student_code})</option>
                ))}
              </select>
              <input required type="number" min="1" step="0.01" placeholder="Amount" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
              <select required value={paymentForm.method} onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
                <option value="netbanking">Net Banking</option>
              </select>
              <select required value={paymentForm.payment_mode} onChange={(e) => setPaymentForm({ ...paymentForm, payment_mode: e.target.value })}>
                <option value="full">Full</option>
                <option value="partial">Partial</option>
                <option value="monthly">Monthly</option>
              </select>
              <input placeholder="Transaction Ref (optional)" value={paymentForm.transaction_ref} onChange={(e) => setPaymentForm({ ...paymentForm, transaction_ref: e.target.value })} />
              <button className="btn" disabled={paymentState.loading}>{paymentState.loading ? 'Saving...' : 'Record Payment'}</button>
              {paymentState.message ? <p className="subtle">{paymentState.message}</p> : null}
            </form>
          </div>
        </div>
      ) : null}

      {showStudentModal ? (
        <div className="modal-backdrop" onClick={() => setShowStudentModal(false)}>
          <div className="modal-card pop-in" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Student Details</h3>
              <button className="btn ghost" onClick={() => setShowStudentModal(false)}>Close</button>
            </div>

            {studentDetailState.loading ? <p className="subtle">Loading student details...</p> : null}
            {studentDetailState.message ? <p className="subtle">{studentDetailState.message}</p> : null}

            {selectedStudent ? (
              <div className="detail-grid">
                <p><strong>Name:</strong> {selectedStudent.full_name || '-'}</p>
                <p><strong>Mobile:</strong> {selectedStudent.phone || '-'}</p>
                <p><strong>Class:</strong> {selectedStudent.class_name || '-'}</p>
                <p><strong>Student Code:</strong> {selectedStudent.student_code || '-'}</p>
                <p><strong>QR Token:</strong> {selectedStudent.qr_token || '-'}</p>
                <p><strong>Parent Name:</strong> {selectedStudent.parent_name || '-'}</p>
                <p><strong>Parent Mobile:</strong> {selectedStudent.parent_phone || '-'}</p>
                <p><strong>Family Details:</strong> {selectedStudent.family_details || '-'}</p>
                <p><strong>Address:</strong> {selectedStudent.address || '-'}</p>
                <p><strong>Admission Date:</strong> {selectedStudent.admission_date ? new Date(selectedStudent.admission_date).toLocaleDateString() : '-'}</p>
                <p><strong>Status:</strong> {selectedStudent.status || '-'}</p>
                <p><strong>Fee Plan:</strong> {selectedStudent.fee_plan_name || '-'}</p>
                <p><strong>Fee Status:</strong> {selectedStudent.fee_status || '-'}</p>
                <p><strong>Total Fee:</strong> {selectedStudent.total_amount ?? '-'}</p>
                <p><strong>Paid:</strong> {selectedStudent.paid_amount ?? '-'}</p>
                <p><strong>Due:</strong> {selectedStudent.due_amount ?? '-'}</p>
              </div>
            ) : null}

            {selectedStudent?.qr_token ? (
              <div className="modal-actions">
                <button
                  className="btn ghost"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(selectedStudent.qr_token);
                      setStudentDetailState({ loading: false, message: 'QR token copied.' });
                    } catch (_err) {
                      setStudentDetailState({ loading: false, message: 'Unable to copy QR token.' });
                    }
                  }}
                >
                  Copy QR Token
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    localStorage.setItem('studentQrToken', selectedStudent.qr_token);
                    window.open('/student-pass', '_blank');
                  }}
                >
                  Open Student Pass
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {showMembershipModal ? (
        <div className="modal-backdrop" onClick={() => setShowMembershipModal(false)}>
          <div className="modal-card pop-in" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Choose Membership</h3>
              <button className="btn ghost" onClick={() => setShowMembershipModal(false)}>Close</button>
            </div>

            <div className="membership-plan-grid">
              {membershipPlans
                .filter((item) => item.code !== 'starter')
                .map((item) => (
                  <article key={item.code} className="membership-plan-item">
                    <h4>{item.label}</h4>
                    <p><strong>Price:</strong> Rs {item.price}</p>
                    <p><strong>Duration:</strong> {item.durationMonths} month{item.durationMonths > 1 ? 's' : ''}</p>
                    <p><strong>Student Limit:</strong> {item.maxStudents}</p>
                    <p className="subtle">{(item.features || []).join(' | ')}</p>
                    <button
                      className="btn"
                      disabled={membershipState.loading}
                      onClick={() => onUpgradeMembership(item.code)}
                    >
                      {membershipState.loading ? 'Please wait...' : `Activate ${item.label}`}
                    </button>
                  </article>
                ))}
            </div>

            <p className="subtle">Yearly plan includes Quick Send Message access for fast communication.</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
