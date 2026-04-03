import { useState } from 'react';
import { fetchParentAttendance, fetchParentFeeStatus } from '../services/api';

export default function ParentPortalPage() {
  const [studentId, setStudentId] = useState('');
  const [fee, setFee] = useState(null);
  const [attendance, setAttendance] = useState([]);

  async function loadData(e) {
    e.preventDefault();
    const [feeData, attnData] = await Promise.all([
      fetchParentFeeStatus(studentId),
      fetchParentAttendance(studentId, { page: 1, limit: 20 })
    ]);
    setFee(feeData);
    setAttendance(attnData.data || []);
  }

  return (
    <div className="parent-wrap">
      <h1>Parent Portal</h1>
      <form onSubmit={loadData} className="parent-form">
        <input placeholder="Student ID" value={studentId} onChange={(e) => setStudentId(e.target.value)} />
        <button className="btn">Check</button>
      </form>

      {fee ? (
        <div className="parent-grid">
          <article className="card">
            <h3>Fee Status</h3>
            <p><strong>Student:</strong> {fee.full_name}</p>
            <p><strong>Status:</strong> {fee.fee_status}</p>
            <p><strong>Due:</strong> Rs {fee.due_amount}</p>
            <p><strong>Next Due:</strong> {fee.next_due_date ? new Date(fee.next_due_date).toLocaleDateString() : '-'}</p>
          </article>
          <article className="card">
            <h3>Recent Attendance</h3>
            {attendance.map((row, idx) => (
              <p key={`${row.attendance_date}-${idx}`}>{row.attendance_date} - {row.status}</p>
            ))}
          </article>
        </div>
      ) : null}
    </div>
  );
}
