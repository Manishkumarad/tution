import { useEffect, useState } from 'react';
import { fetchStudentPass, fetchStudentPassByToken } from '../services/api';

export default function StudentPassPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const studentQrToken = localStorage.getItem('studentQrToken');
    const studentId = localStorage.getItem('studentId');

    if (studentQrToken) {
      fetchStudentPassByToken(studentQrToken)
        .then(setData)
        .catch(() => setError('Unable to load pass. Please contact faculty.'));
      return;
    }

    if (studentId) {
      fetchStudentPass(studentId)
        .then(setData)
        .catch(() => setError('Unable to load pass. Please contact faculty.'));
      return;
    }

    setError('No student pass token found. Please ask faculty for your unique QR token.');
  }, []);

  if (error) {
    return <div className="pass-wrap"><p className="error">{error}</p></div>;
  }

  if (!data) {
    return <div className="pass-wrap"><p>Loading pass...</p></div>;
  }

  return (
    <div className="pass-wrap">
      <section className="pass-card">
        <header>
          <h1>Student Pass</h1>
          <span className={data.is_valid ? 'badge ok' : 'badge bad'}>{data.fee_status}</span>
        </header>
        <h2>{data.full_name}</h2>
        <p>{data.coaching_name}</p>
        <p>Valid till: {data.valid_till ? new Date(data.valid_till).toLocaleDateString() : 'N/A'}</p>
        <img src={data.qr_data_url} alt="Student QR" className="pass-qr" />
      </section>
    </div>
  );
}
