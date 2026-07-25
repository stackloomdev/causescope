interface ApprovalCardProps {
  approvals: number;
  locked: boolean;
  onApprove: () => void;
  onToggleLock: () => void;
}

export function ApprovalCard({ approvals, locked, onApprove, onToggleLock }: ApprovalCardProps): React.ReactElement {
  const ready = approvals >= 3 && !locked;
  const status = ready ? "Ready to publish" : locked ? "Review locked" : "One more approval";

  return (
    <article className="approval-card">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Release decision</p>
          <h2>{status}</h2>
        </div>
        <span className={ready ? "status-dot status-dot--ready" : "status-dot"}>{ready ? "Ready" : "Waiting"}</span>
      </div>

      <div className="approval-progress" aria-label={`${approvals} of 3 approvals`}>
        <span style={{ width: `${Math.min(approvals / 3, 1) * 100}%` }} />
      </div>
      <p className="approval-copy">{approvals} of 3 reviewers approved this snapshot.</p>

      <div className="action-row">
        <button className="button button--secondary" type="button" onClick={onToggleLock}>
          {locked ? "Unlock review" : "Lock review"}
        </button>
        <button className="button button--primary" type="button" disabled={locked || approvals >= 3} onClick={onApprove}>
          {approvals >= 3 ? "Approved" : "Add approval"}
        </button>
      </div>
    </article>
  );
}
