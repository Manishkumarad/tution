import { useEffect, useState } from 'react';
import { bootstrapFeePlans, createFeePlan, fetchFeePlans, updateFeePlan } from '../services/api';

const defaultForm = {
  name: '',
  fee_type: 'monthly',
  amount_total: '',
  installment_count: '1',
  billing_cycle_days: '30',
  due_day_of_month: ''
};

export default function FeePlansPage() {
  const [plans, setPlans] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(defaultForm);

  useEffect(() => {
    loadPlans();
  }, []);

  async function loadPlans() {
    setLoading(true);
    setError('');
    try {
      const seeded = await bootstrapFeePlans();
      if (seeded?.plans?.length) {
        setPlans(seeded.plans);
        if (seeded.added > 0) {
          setMessage('Recommended plans added for this coaching.');
        }
      } else {
        const rows = await fetchFeePlans();
        setPlans(rows || []);
      }
    } catch (_err) {
      setError('Failed to load fee plans');
    } finally {
      setLoading(false);
    }
  }

  async function onCreate(e) {
    e.preventDefault();
    setMessage('');
    setError('');

    try {
      await createFeePlan({
        name: form.name,
        fee_type: form.fee_type,
        amount_total: Number(form.amount_total),
        installment_count: Number(form.installment_count),
        billing_cycle_days: Number(form.billing_cycle_days),
        due_day_of_month: form.due_day_of_month ? Number(form.due_day_of_month) : undefined
      });

      setForm(defaultForm);
      setMessage('Fee plan created successfully.');
      await loadPlans();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create fee plan');
    }
  }

  async function onInlineUpdate(planId, patch) {
    setMessage('');
    setError('');

    try {
      const updated = await updateFeePlan(planId, patch);
      setPlans((prev) => prev.map((p) => (p.id === planId ? updated : p)));
      setMessage('Fee plan updated.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update fee plan');
    }
  }

  return (
    <section>
      <h2 className="page-title">Manage Fee Plans</h2>
      <p className="subtle">Set your coaching-specific prices for Full Paid, Six Month, Three Month, Monthly, and custom plans.</p>

      <div className="table-wrap">
        {loading ? <p>Loading fee plans...</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {message ? <p className="subtle">{message}</p> : null}

        <table>
          <thead>
            <tr>
              <th>Plan Name</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Cycle Days</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => (
              <tr key={plan.id}>
                <td>{plan.name}</td>
                <td>{plan.fee_type}</td>
                <td>
                  <input
                    value={plan.amount_total}
                    onChange={(e) => setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, amount_total: e.target.value } : p)))}
                  />
                </td>
                <td>
                  <input
                    value={plan.billing_cycle_days}
                    onChange={(e) => setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, billing_cycle_days: e.target.value } : p)))}
                  />
                </td>
                <td>{plan.is_active ? 'Active' : 'Inactive'}</td>
                <td>
                  <button
                    className="btn ghost"
                    onClick={() => onInlineUpdate(plan.id, {
                      amount_total: Number(plan.amount_total),
                      billing_cycle_days: Number(plan.billing_cycle_days)
                    })}
                  >
                    Save
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form className="form-card" onSubmit={onCreate}>
        <h3>Create New Plan</h3>
        <label>Plan Name</label>
        <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />

        <label>Fee Type</label>
        <select value={form.fee_type} onChange={(e) => setForm({ ...form, fee_type: e.target.value })}>
          <option value="full">Full</option>
          <option value="half">Half</option>
          <option value="monthly">Monthly</option>
        </select>

        <label>Amount</label>
        <input required type="number" min="1" value={form.amount_total} onChange={(e) => setForm({ ...form, amount_total: e.target.value })} />

        <label>Installment Count</label>
        <input required type="number" min="1" value={form.installment_count} onChange={(e) => setForm({ ...form, installment_count: e.target.value })} />

        <label>Billing Cycle Days</label>
        <input required type="number" min="1" value={form.billing_cycle_days} onChange={(e) => setForm({ ...form, billing_cycle_days: e.target.value })} />

        <label>Due Day (Optional for monthly)</label>
        <input type="number" min="1" max="28" value={form.due_day_of_month} onChange={(e) => setForm({ ...form, due_day_of_month: e.target.value })} />

        <button className="btn">Create Plan</button>
      </form>
    </section>
  );
}
