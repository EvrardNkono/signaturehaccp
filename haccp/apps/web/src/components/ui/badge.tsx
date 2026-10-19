type Status = "ok" | "warn" | "critical";

const styles: Record<Status, string> = {
  ok: "bg-status-ok/10 text-status-ok",
  warn: "bg-status-warn/10 text-status-warn",
  critical: "bg-status-critical/10 text-status-critical",
};

const labels: Record<Status, string> = {
  ok: "Conforme",
  warn: "À surveiller",
  critical: "Non conforme",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}