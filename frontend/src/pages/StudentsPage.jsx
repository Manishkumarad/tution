import { useEffect, useState } from 'react';
import StatusPill from '../components/StatusPill';
import { fetchStudentById, fetchStudents } from '../services/api';

export default function StudentsPage() {
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentDetailState, setStudentDetailState] = useState({ loading: false, message: '' });
  const limit = 20;

  useEffect(() => {
    fetchStudents({ page, limit, q: query || undefined, status: status || undefined })
      .then((res) => {
        setRows(res.data || []);
        setTotal(res.total || 0);
      })
      .catch(() => {
        setRows([]);
      });
  }, [page, query, status]);

  const pages = Math.max(1, Math.ceil(total / limit));

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

  return (
    <section>
      <h2 className="page-title">Students</h2>
      <div className="toolbar">
        <input placeholder="Search student" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="chips">
          {['', 'active', 'inactive'].map((s) => (
            <button key={s || 'all'} className={status === s ? 'active' : ''} onClick={() => { setStatus(s); setPage(1); }}>
              {s || 'all'}
            </button>
          ))}
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Class</th>
              <th>Status</th>
              <th>Code</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="click-row" onClick={() => onOpenStudentDetails(row.id)}>
                <td>{row.full_name}</td>
                <td>{row.class_name || '-'}</td>
                <td><StatusPill status={row.status} /></td>
                <td>{row.student_code}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pager">
        <button className="btn ghost" onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
        <span>Page {page} / {pages}</span>
        <button className="btn ghost" onClick={() => setPage((p) => Math.min(pages, p + 1))}>Next</button>
      </div>

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
    </section>
  );
}
