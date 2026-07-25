interface SignalCardProps {
  label: string;
  value: string;
  detail: string;
}

export function SignalCard({ label, value, detail }: SignalCardProps): React.ReactElement {
  return (
    <article className="signal-card">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}
