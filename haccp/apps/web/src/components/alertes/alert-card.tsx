"use client";

import { useState } from "react";
import {
  AlertTriangle,
  AlertOctagon,
  Info,
  Thermometer,
  WifiOff,
  Droplet,
  SprayCan,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Hand,
  RotateCcw,
  TrendingUp,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Alert,
  AlertKind,
  AlertSeverity,
  kindLabels,
  severityLabels,
  stateLabels,
} from "@/lib/alerts";
import { timeAgo } from "@/lib/time";

const severityTone: Record<
  AlertSeverity,
  { text: string; dot: string; bar: string; chip: string; icon: typeof AlertTriangle }
> = {
  critical: {
    text: "text-status-critical",
    dot: "bg-status-critical",
    bar: "bg-status-critical",
    chip: "bg-status-critical/10 text-status-critical",
    icon: AlertOctagon,
  },
  warn: {
    text: "text-status-warn",
    dot: "bg-status-warn",
    bar: "bg-status-warn",
    chip: "bg-status-warn/10 text-status-warn",
    icon: AlertTriangle,
  },
  info: {
    text: "text-ink-500",
    dot: "bg-ink-400",
    bar: "bg-ink-400",
    chip: "bg-ink-400/10 text-ink-500",
    icon: Info,
  },
};

const kindIcon: Record<AlertKind, typeof Thermometer> = {
  temperature: Thermometer,
  sensor: WifiOff,
  oil: Droplet,
  cleaning: SprayCan,
  dlc: CalendarClock,
};

// Suggestions rapides pour saisir l'action corrective en un tap
const quickActions: Record<AlertKind, string[]> = {
  temperature: [
    "Porte refermée, température revenue dans la plage",
    "Denrées transférées dans une autre enceinte",
    "Technicien appelé pour le groupe froid",
  ],
  sensor: ["Capteur redémarré, connexion rétablie", "Pile remplacée"],
  oil: ["Test effectué, huile conforme", "Huile changée"],
  cleaning: ["Tâche effectuée"],
  dlc: ["Produit jeté", "Produit utilisé avant la DLC"],
};

const MIN_ACTION_LENGTH = 3;

export function AlertCard({
  alert,
  canWrite,
  canReopen,
  onTake,
  onRelease,
  onReopen,
  onResolve,
}: {
  alert: Alert;
  canWrite: boolean;
  canReopen: boolean;
  onTake: (id: string) => void;
  onRelease: (id: string) => void;
  onReopen: (id: string) => void;
  onResolve: (id: string, correctiveAction: string) => void;
}) {
  const tone = severityTone[alert.severity];
  const SeverityIcon = tone.icon;
  const KindIcon = kindIcon[alert.kind];

  const isResolved = alert.state === "resolved";

  const [resolving, setResolving] = useState(false);
  const [action, setAction] = useState("");

  // L'action corrective est obligatoire pour les alertes critiques et d'attention
  const required = alert.severity !== "info";
  const canConfirm = !required || action.trim().length >= MIN_ACTION_LENGTH;

  const cancel = () => {
    setResolving(false);
    setAction("");
  };

  const confirm = () => {
    if (!canConfirm) return;
    onResolve(alert.id, action.trim());
    setResolving(false);
    setAction("");
  };

  return (
    <Card className={`overflow-hidden p-5 ${isResolved ? "opacity-70" : ""}`}>
      <span className={`absolute inset-x-0 top-0 h-0.5 ${tone.bar}`} />

      <div className="flex items-start gap-4">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            isResolved ? "bg-ivory-200 text-ink-500" : `${tone.chip}`
          }`}
        >
          {isResolved ? (
            <CheckCircle2 size={18} strokeWidth={1.75} />
          ) : (
            <SeverityIcon size={18} strokeWidth={1.75} />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                isResolved ? "bg-ivory-200 text-ink-500" : tone.chip
              }`}
            >
              {severityLabels[alert.severity]}
            </span>
            <span className="flex items-center gap-1 text-[11px] text-ink-500">
              <KindIcon size={12} strokeWidth={1.75} />
              {kindLabels[alert.kind]}
            </span>
            <span className="text-[11px] text-ink-400">· {stateLabels[alert.state]}</span>
            {alert.escalation > 0 && !isResolved && (
              <span className="flex items-center gap-1 rounded-full bg-status-critical/10 px-2 py-0.5 text-[11px] font-medium text-status-critical">
                <TrendingUp size={12} strokeWidth={1.75} /> Escalade N{alert.escalation}
              </span>
            )}
          </div>

          <p className="mt-2 font-medium leading-snug">{alert.title}</p>

          {alert.equipment && (
            <p className="mt-1 text-xs text-ink-500">
              {alert.equipment}
              {alert.zone && ` · ${alert.zone}`}
            </p>
          )}

          <p className="mt-2 text-sm text-ink-600">{alert.detail}</p>

          {(alert.value || alert.threshold) && (
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-500">
              {alert.value && (
                <span>
                  Mesuré : <span className={`font-medium ${tone.text}`}>{alert.value}</span>
                </span>
              )}
              {alert.threshold && (
                <span>
                  Seuil : <span className="font-medium">{alert.threshold}</span>
                </span>
              )}
            </div>
          )}

          {alert.escalationReason && !isResolved && (
            <p className="mt-2 text-xs font-medium text-status-critical">{alert.escalationReason}</p>
          )}
          {alert.state === "in_progress" && alert.takenBy && (
            <p className="mt-2 text-xs text-ink-500">Prise en charge par {alert.takenBy}</p>
          )}

          {alert.correctiveAction && (
            <p className="mt-3 rounded-lg bg-status-ok/5 px-3 py-2 text-xs text-status-ok">
              <span className="font-medium">Action corrective : </span>
              {alert.correctiveAction}
            </p>
          )}

          {resolving && !isResolved && (
            <div className="mt-4 space-y-3 rounded-xl border border-ivory-300 bg-ivory-50 p-4">
              <label htmlFor={`action-${alert.id}`} className="block text-sm font-medium">
                Quelle action avez-vous menée ?{" "}
                {required ? (
                  <span className="text-xs font-normal text-status-critical">(obligatoire)</span>
                ) : (
                  <span className="text-xs font-normal text-ink-400">(facultatif)</span>
                )}
              </label>

              <div className="flex flex-wrap gap-2">
                {quickActions[alert.kind].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setAction(q)}
                    className={`min-h-9 rounded-full border px-3 text-xs transition ${
                      action === q
                        ? "border-ink-900 bg-ink-900 text-gold-300"
                        : "border-ivory-300 bg-white text-ink-700 hover:border-gold-400"
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>

              <textarea
                id={`action-${alert.id}`}
                rows={3}
                value={action}
                onChange={(e) => setAction(e.target.value)}
                placeholder="Décrivez l'action corrective réalisée"
                className="w-full rounded-xl border border-ivory-300 bg-white p-3 text-sm outline-none transition placeholder:text-ink-400 focus:border-gold-400 focus:ring-2 focus:ring-gold-400/30"
              />

              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="secondary" onClick={cancel} className="!min-h-10 !px-4 !text-sm">
                  Annuler
                </Button>
                <Button onClick={confirm} disabled={!canConfirm} className="!min-h-10 !px-4 !text-sm">
                  Confirmer la résolution
                </Button>
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-ivory-200 pt-3">
            <span className="text-xs text-ink-400">
              {isResolved
                ? `Résolue ${timeAgo(alert.resolvedAt)}${alert.resolvedBy ? ` par ${alert.resolvedBy}` : ""} · créée ${timeAgo(alert.createdAt)}`
                : `Créée ${timeAgo(alert.createdAt)}`}
            </span>
            {canWrite && !isResolved && !resolving && (
              <div className="flex flex-wrap gap-2">
                {alert.state === "open" ? (
                  <Button variant="secondary" onClick={() => onTake(alert.id)} className="!min-h-9 !px-3 !text-xs">
                    <Hand size={12} strokeWidth={2} /> Prendre en charge
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => onRelease(alert.id)} className="!min-h-9 !px-3 !text-xs">
                    Relâcher
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => setResolving(true)}
                  className="!min-h-9 !px-3 !text-xs"
                >
                  Marquer résolue <ChevronRight size={12} strokeWidth={2} />
                </Button>
              </div>
            )}
            {canReopen && isResolved && (
              <Button variant="secondary" onClick={() => onReopen(alert.id)} className="!min-h-9 !px-3 !text-xs">
                <RotateCcw size={12} strokeWidth={2} /> Rouvrir
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}