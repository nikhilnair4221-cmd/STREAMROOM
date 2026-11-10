interface Props {
  label: string;
  detail?: string;
}

export function LoadingIndicator({ label, detail }: Props) {
  return (
    <div className="loading-indicator" role="status" aria-live="polite">
      <div className="loading-indicator__pixels" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <strong>{label}</strong>
      {detail && <span>{detail}</span>}
    </div>
  );
}
