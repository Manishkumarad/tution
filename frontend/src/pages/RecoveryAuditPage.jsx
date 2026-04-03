import { useEffect, useMemo, useState } from 'react';
import { fetchRecoveryAudit } from '../services/api';

export default function RecoveryAuditPage() {
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');

    fetchRecoveryAudit({ page, limit })
      .then((res) => {
        setRows(res.data || []);
        setTotal(res.total || 0);
      })
      .catch((err) => {
        setError(err.response?.data?.message || 'Failed to load recovery audit logs');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [page, limit]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

  return (
    <section>
      <h2 className="page-title">Recovery Audit</h2>
      <p className="subtle">Track OTP login and password reset attempts for your coaching admins.</p>

      <div className="table-wrap">
        {loading ? <p>Loading audit logs...</p> : null}
        {error ? <p className="error">{error}</p> : null}

        <table>
          <thead>
            <tr>
              <th>Created</th>
              <th>Purpose</th>
              <th>Channel</th>
              <th>Target</th>
              <th>Status</th>
              <th>Attempts</th>
              <th>Admin</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.created_at).toLocaleString()}</td>
                <td>{r.purpose}</td>
                <td>{r.channel}</td>
                <td>{r.target_masked}</td>
                <td>{r.status}</td>
                <td>{r.attempts}/{r.max_attempts}</td>
                <td>{r.admin_name || r.admin_email}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={7}>No recovery events yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <div className="pager">
          <button className="btn ghost" onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
          <span>Page {page} / {totalPages}</span>
          <button className="btn ghost" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
        </div>
      </div>
    </section>
  );
}
