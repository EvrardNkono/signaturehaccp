import { AlertTriangle, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function Loading({ label = "Chargement…" }: { label?: string }) {
  return (
    <Card className="flex items-center justify-center gap-3 p-8 text-sm text-ink-500" role="status">
      <Loader2 size={18} className="animate-spin" /> {label}
    </Card>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="flex flex-col items-center gap-3 p-8 text-center" role="alert">
      <AlertTriangle size={22} className="text-status-critical" />
      <p className="text-sm text-ink-700">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry} className="!min-h-10 !text-sm">
          Réessayer
        </Button>
      )}
    </Card>
  );
}

export function InlineError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-status-critical/10 px-3 py-2 text-sm text-status-critical">
      {message}
    </p>
  );
}
