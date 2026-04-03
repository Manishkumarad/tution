export default function StatusPill({ status }) {
  const normalized = (status || '').toLowerCase();
  const cls = normalized === 'paid' ? 'ok' : normalized === 'partial' ? 'warn' : 'bad';
  return <span className={`pill ${cls}`}>{status}</span>;
}
