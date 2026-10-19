import { Battery, BatteryLow, WifiOff, Signal, Hand } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Sparkline } from "@/components/ui/sparkline";
import { Equipment, Status, getStatus, formatTemp, formatRange, typeLabels } from "@/lib/equipment";
import { timeAgo } from "@/lib/time";

const tone: Record<Status, { text: string; dot: string; bar: string; label: string; chip: string }> = {
  ok: { text: "text-status-ok", dot: "bg-status-ok", bar: "bg-status-ok", label: "Conforme", chip: "bg-status-ok/10 text-status-ok" },
  warn: { text: "text-status-warn", dot: "bg-status-warn", bar: "bg-status-warn", label: "À surveiller", chip: "bg-status-warn/10 text-status-warn" },
  critical: { text: "text-status-critical", dot: "bg-status-critical", bar: "bg-status-critical", label: "Non conforme", chip: "bg-status-critical/10 text-status-critical" },
  offline: { text: "text-ink-400", dot: "bg-ink-400", bar: "bg-ink-400", label: "Hors ligne", chip: "bg-ink-400/10 text-ink-500" },
};

export function EquipmentCard({ equipment: e }: { equipment: Equipment }) {
  const status = getStatus(e);
  const t = tone[status];

  return (
    <Card className="overflow-hidden p-5">
      <span className={`absolute inset-x-0 top-0 h-0.5 ${t.bar}`} />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{e.name}</p>
          <p className="truncate text-xs text-ink-500">
            {typeLabels[e.type]} · {e.zone}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${t.chip}`}>
          {t.label}
        </span>
      </div>

      <p className={`mt-4 font-display text-5xl font-semibold ${t.text}`}>{formatTemp(e.temp)}</p>
      <Sparkline data={e.history} className={`mt-3 ${t.text}`} />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-ivory-200 pt-4 text-xs text-ink-500">
        <span>Plage : {formatRange(e)}</span>
        {e.sensor ? (
          <span className="flex items-center gap-3">
            {e.sensor.online ? (
              <span className="flex items-center gap-1">
                <Signal size={13} strokeWidth={1.5} /> {e.sensor.signal}/4
              </span>
            ) : (
              <span className="flex items-center gap-1 text-status-critical">
                <WifiOff size={13} strokeWidth={1.5} /> Perdu
              </span>
            )}
            <span className={`flex items-center gap-1 ${e.sensor.battery < 15 ? "text-status-critical" : ""}`}>
              {e.sensor.battery < 15 ? <BatteryLow size={13} strokeWidth={1.5} /> : <Battery size={13} strokeWidth={1.5} />}
              {e.sensor.battery}%
            </span>
          </span>
        ) : (
          <span className="flex items-center gap-1">
            <Hand size={13} strokeWidth={1.5} /> Relevé manuel
          </span>
        )}
      </div>
      <p className="mt-2 text-xs text-ink-400">
        {e.lastReadingAt ? `Dernier relevé ${timeAgo(e.lastReadingAt)}` : "Aucun relevé"}
      </p>
    </Card>
  );
}