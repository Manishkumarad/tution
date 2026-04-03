import { useEffect, useState } from 'react';
import { bootstrapFeePlans, createStudent, fetchFeePlans } from '../services/api';

export default function AddStudentPage() {
  const [plans, setPlans] = useState([]);
  const [message, setMessage] = useState('');
  const [planMessage, setPlanMessage] = useState('');
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
    fee_plan_id: ''
  });

  const canShowPaymentOptions = Boolean(
    form.full_name.trim()
    && form.phone.trim()
    && form.class_name
    && form.parent_name.trim()
    && form.parent_phone.trim()
    && form.family_details.trim()
    && form.address.trim()
    && form.fee_plan_id
  );

  useEffect(() => {
    fetchFeePlans()
      .then(async (rows) => {
        const seeded = await bootstrapFeePlans().catch(() => null);

        if (seeded?.plans?.length) {
          setPlans(seeded.plans);
          setPlanMessage(seeded.added > 0 ? 'Recommended fee plans added automatically.' : '');
          return;
        }

        setPlans(rows || []);
        setPlanMessage((rows || []).length ? '' : 'No fee plans available.');
      })
      .catch(() => setPlans([]));
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setMessage('');

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
        initial_fee_payment: canShowPaymentOptions ? form.initial_fee_payment : 'none',
        initial_payment_method: canShowPaymentOptions && form.initial_fee_payment !== 'none' ? form.initial_payment_method : undefined,
        initial_payment_transaction_ref: canShowPaymentOptions && form.initial_fee_payment !== 'none'
          ? (form.initial_payment_transaction_ref.trim() || undefined)
          : undefined,
        fee_plan_id: Number(form.fee_plan_id)
      };

      await createStudent({
        ...payload
      });
      setMessage('Student added successfully.');
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
        fee_plan_id: ''
      });
    } catch (err) {
      setMessage(err.response?.data?.message || 'Failed to add student');
    }
  }

  return (
    <section>
      <h2 className="page-title">Add Student</h2>
      <form className="form-card" onSubmit={onSubmit}>
        <label>Name</label>
        <input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />

        <label>Phone</label>
        <input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />

        <label>Email (Optional)</label>
        <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />

        <label>Class</label>
        <select required value={form.class_name} onChange={(e) => setForm({ ...form, class_name: e.target.value })}>
          <option value="">Select class</option>
          <option value="8th">8th</option>
          <option value="9th">9th</option>
          <option value="10th">10th</option>
          <option value="11th">11th</option>
          <option value="12th">12th</option>
        </select>

        <label>Parent Name</label>
        <input value={form.parent_name} onChange={(e) => setForm({ ...form, parent_name: e.target.value })} />

        <label>Parent Phone</label>
        <input value={form.parent_phone} onChange={(e) => setForm({ ...form, parent_phone: e.target.value })} />

        <label>Family Details</label>
        <input required value={form.family_details} onChange={(e) => setForm({ ...form, family_details: e.target.value })} />

        <label>Address</label>
        <input required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />

        <label>Fee Plan</label>
        <select required value={form.fee_plan_id} onChange={(e) => setForm({ ...form, fee_plan_id: e.target.value })}>
          <option value="">Select plan</option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>{plan.name} - Rs {plan.amount_total}</option>
          ))}
        </select>
        {planMessage ? <p className="subtle">{planMessage}</p> : null}

        {canShowPaymentOptions ? (
          <>
            <label>Pay Fee Now</label>
            <select value={form.initial_fee_payment} onChange={(e) => setForm({ ...form, initial_fee_payment: e.target.value })}>
              <option value="none">No payment now</option>
              <option value="half">Pay half now</option>
              <option value="full">Pay full now</option>
            </select>

            {form.initial_fee_payment !== 'none' ? (
              <>
                <label>Payment Method</label>
                <select value={form.initial_payment_method} onChange={(e) => setForm({ ...form, initial_payment_method: e.target.value })}>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="netbanking">Net Banking</option>
                </select>

                <label>Transaction Ref (Optional)</label>
                <input value={form.initial_payment_transaction_ref} onChange={(e) => setForm({ ...form, initial_payment_transaction_ref: e.target.value })} />
              </>
            ) : null}
          </>
        ) : (
          <p className="subtle">Fill all student details and fee plan to enable pay-fee options.</p>
        )}

        <button className="btn">Save Student</button>
        {message ? <p>{message}</p> : null}
      </form>
    </section>
  );
}
