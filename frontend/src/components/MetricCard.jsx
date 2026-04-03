export default function MetricCard({ title, value, tone = 'default' }) {
  return (
    <article className={`metric metric-${tone}`}>
      <h3>{title}</h3>
      <p>{value}</p>
    </article>
  );
}
