import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, requestResetOtp, resetPasswordWithOtp } from '../services/api';

export default function LoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    coachingCode: '',
    email: '',
    password: '',
    mode: 'faculty',
    studentQrToken: '',
    otp: '',
    otpChannel: 'sms',
    newPassword: ''
  });
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [showForgot, setShowForgot] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setInfo('');

    if (form.mode === 'student') {
      localStorage.setItem('studentQrToken', form.studentQrToken.trim());
      localStorage.removeItem('studentId');
      navigate('/student-pass');
      return;
    }

    try {
      setLoading(true);
      const data = await login({
        coachingCode: form.coachingCode,
        email: form.email,
        password: form.password
      });
      localStorage.setItem('accessToken', data.tokens.accessToken);
      localStorage.setItem('refreshToken', data.tokens.refreshToken);
      localStorage.setItem('userRole', data.user.role);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function onRequestResetOtp() {
    setError('');
    setInfo('');
    try {
      setLoading(true);
      const data = await requestResetOtp({
        coachingCode: form.coachingCode,
        adminEmail: form.email,
        channel: form.otpChannel
      });
      setInfo(`Reset OTP sent on ${data.channel} to ${data.target}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send reset OTP');
    } finally {
      setLoading(false);
    }
  }

  async function onResetPassword() {
    setError('');
    setInfo('');
    try {
      setLoading(true);
      const data = await resetPasswordWithOtp({
        coachingCode: form.coachingCode,
        adminEmail: form.email,
        otp: form.otp,
        newPassword: form.newPassword
      });
      setInfo(data.message || 'Password reset successful. Login with new password.');
      setForm({ ...form, password: '', otp: '', newPassword: '' });
      setShowForgot(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Password reset failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="hero-panel">
        <h1>Tution for Coaching Centers</h1>
        <p>Fast fee control, instant QR entry, and stress-free reminders.</p>
      </div>
      <form className="auth-card" onSubmit={onSubmit}>
        <h2>Sign In</h2>
        <div className="segmented">
          <button type="button" className={form.mode === 'faculty' ? 'active' : ''} onClick={() => setForm({ ...form, mode: 'faculty' })}>Faculty/Admin</button>
          <button type="button" className={form.mode === 'student' ? 'active' : ''} onClick={() => setForm({ ...form, mode: 'student' })}>Student Pass</button>
        </div>

        {form.mode === 'faculty' ? (
          <>
            <label>Coaching Code</label>
            <input value={form.coachingCode} onChange={(e) => setForm({ ...form, coachingCode: e.target.value })} required />
            <label>Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <label>Password</label>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />

            {form.coachingCode.trim() && form.email.trim() ? (
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setShowForgot((v) => !v);
                  setError('');
                  setInfo('');
                }}
              >
                Forgot password?
              </button>
            ) : (
              <p className="subtle">Enter Coaching Code and Email to use password recovery.</p>
            )}

            {showForgot ? (
              <>
                <label>OTP Channel</label>
                <select value={form.otpChannel} onChange={(e) => setForm({ ...form, otpChannel: e.target.value })}>
                  <option value="sms">SMS</option>
                  <option value="email">Email</option>
                </select>

                <button type="button" className="btn ghost" onClick={onRequestResetOtp} disabled={loading}>
                  Send OTP
                </button>

                <label>OTP</label>
                <input value={form.otp} onChange={(e) => setForm({ ...form, otp: e.target.value })} placeholder="6 digit OTP" />

                <label>New Password</label>
                <input type="password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} placeholder="Enter new password" />

                <button type="button" className="btn" onClick={onResetPassword} disabled={loading}>
                  {loading ? 'Please wait...' : 'Reset Password'}
                </button>
              </>
            ) : null}
          </>
        ) : (
          <>
            <label>Student QR Token</label>
            <input
              value={form.studentQrToken}
              onChange={(e) => setForm({ ...form, studentQrToken: e.target.value })}
              placeholder="Paste student QR token"
              required
            />
          </>
        )}

        {error ? <p className="error">{error}</p> : null}
        {info ? <p className="subtle">{info}</p> : null}
        <button className="btn" disabled={loading}>{loading ? 'Signing in...' : 'Continue'}</button>
        <button type="button" className="btn ghost" onClick={() => navigate('/coaching-signup')}>
          New Coaching? Register Here
        </button>
      </form>
    </div>
  );
}
