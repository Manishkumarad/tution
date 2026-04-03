import { useCallback, useState } from 'react';
import QrScanner from '../components/QrScanner';
import StatusPill from '../components/StatusPill';
import { scanQr } from '../services/api';

export default function ScanPage() {
  const [token, setToken] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleScan = useCallback(async (qrToken) => {
    setError('');
    try {
      const data = await scanQr(qrToken);
      setResult(data);
      setToken(qrToken);
    } catch (err) {
      setError(err.response?.data?.message || 'Scan failed');
    }
  }, []);

  async function submitManual(e) {
    e.preventDefault();
    await handleScan(token);
  }

  return (
    <section>
      <h2 className="page-title">QR Entry Scan</h2>
      <div className="scan-grid">
        <div className="card">
          <QrScanner onScan={handleScan} />
          <form onSubmit={submitManual} className="manual-input">
            <input placeholder="Paste qr_token" value={token} onChange={(e) => setToken(e.target.value)} />
            <button className="btn">Verify</button>
          </form>
          {error ? <p className="error">{error}</p> : null}
        </div>

        <div className="card result">
          <h3>Scan Result</h3>
          {result ? (
            <>
              <p><strong>Name:</strong> {result.student.full_name}</p>
              <p><strong>Class:</strong> {result.student.class_name || '-'}</p>
              <p><strong>Entry:</strong> <StatusPill status={result.entry_result} /></p>
              <p><strong>Fee:</strong> <StatusPill status={result.fee_status} /></p>
              <p><strong>Reason:</strong> {result.reason}</p>
            </>
          ) : (
            <p>No scan yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}
