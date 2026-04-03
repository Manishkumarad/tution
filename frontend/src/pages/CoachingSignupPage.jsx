import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { coachingSignup } from '../services/api';

export default function CoachingSignupPage() {
  const navigate = useNavigate();
  const [signupInfo, setSignupInfo] = useState(null);
  const [encryptPassphrase, setEncryptPassphrase] = useState('');
  const [form, setForm] = useState({
    coachingName: '',
    coachingEmail: '',
    coachingPhone: '',
    paymentUpiId: '',
    paymentQrUrl: '',
    bankAccountName: '',
    bankAccountNumber: '',
    bankIfsc: '',
    bankName: '',
    adminName: '',
    adminEmail: '',
    adminPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const payload = {
        coachingName: form.coachingName.trim(),
        coachingEmail: form.coachingEmail.trim(),
        coachingPhone: form.coachingPhone.trim(),
        paymentUpiId: form.paymentUpiId.trim() || undefined,
        paymentQrUrl: form.paymentQrUrl.trim() || undefined,
        bankAccountName: form.bankAccountName.trim() || undefined,
        bankAccountNumber: form.bankAccountNumber.trim() || undefined,
        bankIfsc: form.bankIfsc.trim() || undefined,
        bankName: form.bankName.trim() || undefined,
        adminName: form.adminName.trim(),
        adminEmail: form.adminEmail.trim(),
        adminPassword: form.adminPassword
      };
      const data = await coachingSignup(payload);
      localStorage.setItem('accessToken', data.tokens.accessToken);
      localStorage.setItem('refreshToken', data.tokens.refreshToken);
      localStorage.setItem('userRole', data.user.role);
      setSignupInfo({
        coachingName: data.coaching.name,
        coachingCode: data.coaching.code,
        adminEmail: form.adminEmail,
        adminPassword: form.adminPassword
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  }

  async function copyCredentials() {
    if (!signupInfo) return;

    const content = [
      `Coaching Name: ${signupInfo.coachingName}`,
      `Coaching Code: ${signupInfo.coachingCode}`,
      `Admin Email: ${signupInfo.adminEmail}`,
      `Password: ${signupInfo.adminPassword}`
    ].join('\n');

    try {
      await navigator.clipboard.writeText(content);
      alert('Credentials copied. Save them securely.');
    } catch (_err) {
      alert('Copy failed. Please manually save the details shown.');
    }
  }

  function downloadCredentials() {
    if (!signupInfo) return;

    const content = [
      'Tuition SaaS - Coaching Credentials',
      `Generated At: ${new Date().toLocaleString()}`,
      '',
      `Coaching Name: ${signupInfo.coachingName}`,
      `Coaching Code: ${signupInfo.coachingCode}`,
      `Admin Email: ${signupInfo.adminEmail}`,
      `Password: ${signupInfo.adminPassword}`,
      '',
      'Important: Store this file securely. Password is not retrievable later.'
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeCode = (signupInfo.coachingCode || 'coaching').replace(/[^a-z0-9-]/gi, '_');

    link.href = url;
    link.download = `${safeCode}-credentials.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function toBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }

  async function deriveAesKey(passphrase, salt) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: 120000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );
  }

  async function downloadEncryptedCredentials() {
    if (!signupInfo) return;
    if (!encryptPassphrase || encryptPassphrase.length < 8) {
      alert('Enter an encryption passphrase with at least 8 characters.');
      return;
    }

    const plainText = [
      'Tuition SaaS - Coaching Credentials',
      `Generated At: ${new Date().toLocaleString()}`,
      '',
      `Coaching Name: ${signupInfo.coachingName}`,
      `Coaching Code: ${signupInfo.coachingCode}`,
      `Admin Email: ${signupInfo.adminEmail}`,
      `Password: ${signupInfo.adminPassword}`
    ].join('\n');

    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveAesKey(encryptPassphrase, salt);
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(plainText)
    );

    const payload = {
      v: 1,
      alg: 'AES-GCM-256',
      kdf: 'PBKDF2-SHA256',
      iterations: 120000,
      salt: toBase64(salt),
      iv: toBase64(iv),
      ciphertext: toBase64(new Uint8Array(encrypted)),
      note: 'Use the same passphrase to decrypt this payload.'
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeCode = (signupInfo.coachingCode || 'coaching').replace(/[^a-z0-9-]/gi, '_');

    link.href = url;
    link.download = `${safeCode}-credentials.encrypted.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    alert('Encrypted credentials downloaded successfully.');
  }

  if (signupInfo) {
    return (
      <div className="auth-wrap">
        <div className="hero-panel">
          <h1>Registration Complete</h1>
          <p>Your coaching account is created and stored in Supabase.</p>
          <p>Save these credentials now. Password is not retrievable later.</p>
        </div>
        <div className="auth-card">
          <h2>Save Credentials</h2>
          <p><strong>Coaching Name:</strong> {signupInfo.coachingName}</p>
          <p><strong>Coaching Code:</strong> {signupInfo.coachingCode}</p>
          <p><strong>Admin Email:</strong> {signupInfo.adminEmail}</p>
          <p><strong>Password:</strong> {signupInfo.adminPassword}</p>

          <button type="button" className="btn" onClick={copyCredentials}>Copy Credentials</button>
          <button type="button" className="btn" onClick={downloadCredentials}>Download .txt</button>
          <label>Encryption Passphrase (min 8 chars)</label>
          <input
            type="password"
            placeholder="Enter passphrase"
            value={encryptPassphrase}
            onChange={(e) => setEncryptPassphrase(e.target.value)}
          />
          <button type="button" className="btn" onClick={downloadEncryptedCredentials}>Download Encrypted File</button>
          <button type="button" className="btn ghost" onClick={() => navigate('/login')}>Go to Login</button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap coaching-signup-wrap">
      <div className="hero-panel coaching-signup-hero">
        <h1>Register Your Coaching</h1>
        <p>Create your own account, get your coaching code, and start managing students in minutes.</p>
        <p className="coaching-signup-hero-note">Fast setup. Cleaner form. Start collecting fees from day one.</p>
      </div>
      <form className="auth-card coaching-signup-card" onSubmit={onSubmit}>
        <h2>Coaching Signup</h2>

        <div className="coaching-signup-one-section">
          <p className="coaching-signup-block-title">Coaching Details</p>
          <div>
            <label>Coaching Name</label>
            <input value={form.coachingName} onChange={(e) => setForm({ ...form, coachingName: e.target.value })} required />
          </div>
          <div>
            <label>Coaching Phone</label>
            <input value={form.coachingPhone} onChange={(e) => setForm({ ...form, coachingPhone: e.target.value })} required />
          </div>
          <div>
            <label>Coaching Email</label>
            <input type="email" value={form.coachingEmail} onChange={(e) => setForm({ ...form, coachingEmail: e.target.value })} required />
          </div>

          <p className="coaching-signup-block-title">Payment Collection Details</p>
          <div>
            <label>UPI ID</label>
            <input value={form.paymentUpiId} onChange={(e) => setForm({ ...form, paymentUpiId: e.target.value })} placeholder="example@upi" />
          </div>
          <div>
            <label>QR URL (optional)</label>
            <input value={form.paymentQrUrl} onChange={(e) => setForm({ ...form, paymentQrUrl: e.target.value })} placeholder="https://..." />
          </div>
          <div>
            <label>Bank Account Number (optional)</label>
            <input value={form.bankAccountNumber} onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })} />
          </div>
          <div>
            <label>Bank Account Name (optional)</label>
            <input value={form.bankAccountName} onChange={(e) => setForm({ ...form, bankAccountName: e.target.value })} />
          </div>
          <div>
            <label>Bank IFSC (optional)</label>
            <input value={form.bankIfsc} onChange={(e) => setForm({ ...form, bankIfsc: e.target.value })} />
          </div>
          <div>
            <label>Bank Name (optional)</label>
            <input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
          </div>

          <p className="coaching-signup-block-title">Admin Login</p>
          <div>
            <label>Admin Name</label>
            <input value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} required />
          </div>
          <div>
            <label>Admin Email</label>
            <input type="email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} required />
          </div>
          <div>
            <label>Password</label>
            <input type="password" value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} required />
          </div>
        </div>

        <p className="subtle">Add at least one payment detail (UPI, QR, or bank account) so students can pay fees during registration.</p>

        {error ? <p className="error">{error}</p> : null}
        <div className="coaching-signup-actions">
          <button className="btn" disabled={loading}>{loading ? 'Creating account...' : 'Create Coaching Account'}</button>
          <button type="button" className="btn ghost" onClick={() => navigate('/login')}>Back to Login</button>
        </div>
      </form>
    </div>
  );
}
