"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ClipboardPen, Signal, WifiOff, Battery, Hand } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { TempChart } from "@/components/equipements/temp-chart";
import { ErrorBox, Loading } from "@/components/ui/state";
import { useApi } from "@/hooks/use-api";
import { useSession } from "@/lib/session";
import { EquipmentHistory, toPoints } from "@/lib/equipements";
import {
  Equipment,
  Status,
  formatRange,
  formatTemp,
  getStatus,
  statusForValue,
  typeLabels,
} from "@/lib/equipment";
import { Alert, severityLabels, stateLabels } from "@/lib/alerts";
import { dateTime, timeAgo } from "@/lib/time";

const tone: Record<Status, { text: string; bar: string; dot: string; label: string }> = {
  ok: { text: "text-status-ok", bar: "bg-status-ok", dot: "bg-status-ok", label: "Conforme" },
  warn: { text: "text-status-warn", bar: "bg-status-warn", dot: "bg-status-warn", label: "À surveiller" },
  critical: { text: "text-status-critical", bar: "bg-status-critical", dot: "bg-status-critical", label: "Non conforme" },
  offline: { text: "text-ink-400", bar: "bg-ink-400", dot: "bg-ink-400", label: "Hors ligne" },
};

export default function EquipementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { est, ep, can } = useSession();
  const tz = est?.timezone;
  const eqQ = useApi<Equipment>(ep(`/equipments/${id}`));
  const histQ = useApi<EquipmentHistory>(ep(`/equipments/${id}/history`), { hours: 24 });
  const alertsQ = useApi<{ data: Alert[] }>(ep("/alerts"), { equipmentId: id, limit: 20 });

  if (eqQ.loading && !eqQ.data) {
    return (
      <>
        <Topbar title="Équipement" />
        <main className="mx-auto w-full max-w-[1400px] p-4 md:p-8 xl:p-10">
          <Loading />
        </main>
      </>
    );
  }
  if (eqQ.error || !eqQ.data) {
    return (
      <>
        <Topbar title="Équipement" />
        <main className="mx-auto w-full max-w-[1400px] space-y-4 p-4 md:p-8 xl:p-10">
          <Link href="/equipements" className="flex min-h-11 w-fit items-center gap-1 text-sm text-gold-600 hover:text-gold-500">
            <ArrowLeft size={14} /> Tous les équipements
          </Link>
          <ErrorBox message={eqQ.error ?? "Équipement introuvable."} onRetry={eqQ.reload} />
        </main>
      </>
    );
  }

  const equipment = eqQ.data;
  const hist = histQ.data;
  const points = hist ? toPoints(hist.points, tz) : [];
  const status = getStatus(equipment);
  const t = tone[status];
  const stats = hist?.stats ?? null;
  const alerts = alertsQ.data?.data ?? [];
  const sensor = equipment.sensor;

  return (
    <>
      <Topbar
        title={equipment.name}
        subtitle={`${typeLabels[equipment.type]} · ${equipment.zone} · Plage : ${formatRange(equipment)}`}
      />
      <main className="mx-auto w-full max-w-[1400px] space-y-6 p-4 md:space-y-8 md:p-8 xl:p-10">
        <Link
          href="/equipements"
          className="flex min-h-11 w-fit items-center gap-1 text-sm text-gold-600 hover:text-gold-500"
        >
          <ArrowLeft size={14} /> Tous les équipements
        </Link>

        {/* En-tête */}
        <Card className="overflow-hidden p-5 md:p-6">
          <span className={`absolute inset-x-0 top-0 h-0.5 ${t.bar}`} />
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="eyebrow">Température actuelle</p>
              <p className={`mt-1 font-display text-5xl font-semibold md:text-6xl ${t.text}`}>
                {formatTemp(equipment.temp)}
              </p>
              <p className={`mt-2 flex items-center gap-2 text-sm font-medium ${t.text}`}>
                <span className={`h-2.5 w-2.5 rounded-full ${t.dot}`} />
                {t.label}
                <span className="font-normal text-ink-400">· dernier relevé {timeAgo(equipment.lastReadingAt)}</span>
              </p>
              <p className="mt-3 flex items-center gap-3 text-xs text-ink-500">
                {sensor ? (
                  <>
                    {sensor.online ? (
                      <span className="flex items-center gap-1">
                        <Signal size={13} strokeWidth={1.5} /> Signal {sensor.signal}/4
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-status-critical">
                        <WifiOff size={13} strokeWidth={1.5} /> Capteur perdu
                      </span>
                    )}
                    <span className={`flex items-center gap-1 ${sensor.battery < 15 ? "text-status-critical" : ""}`}>
                      <Battery size={13} strokeWidth={1.5} /> {sensor.battery}%
                    </span>
                  </>
                ) : (
                  <span className="flex items-center gap-1">
                    <Hand size={13} strokeWidth={1.5} /> Relevé manuel
                  </span>
                )}
              </p>
            </div>
            {can("releves", "write") && (
              <Link
                href="/releves"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-ink-900 px-5 text-sm font-medium text-white hover:bg-ink-800"
              >
                <ClipboardPen size={16} strokeWidth={1.5} /> Nouveau relevé
              </Link>
            )}
          </div>
        </Card>

        {/* Courbe */}
        <Card className="p-5 md:p-6">
          <p className="eyebrow">24 dernières heures</p>
          <h2 className="mt-1 text-2xl font-semibold">Courbe de température</h2>
          {points.length < 2 ? (
            <p className="mt-4 rounded-xl bg-ivory-100 px-4 py-6 text-center text-sm text-ink-500">
              Pas assez de relevés sur les dernières 24 h pour tracer une courbe.
            </p>
          ) : (
            <TempChart points={points} min={equipment.min} max={equipment.max} className={`mt-4 ${t.text}`} />
          )}
          <p className="mt-2 text-xs text-ink-400">
            Zone verte : plage autorisée. Ligne pointillée rouge : seuil maximum.
          </p>

          {stats && (
            <div className="mt-5 grid grid-cols-3 gap-3 border-t border-ivory-200 pt-4 text-center">
              {[
                { label: "Minimum", value: stats.min },
                { label: "Moyenne", value: stats.avg },
                { label: "Maximum", value: stats.max },
              ].map((s) => (
                <div key={s.label}>
                  <p className="text-xs text-ink-500">{s.label}</p>
                  <p className="mt-1 font-display text-xl font-semibold">{formatTemp(s.value)}</p>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-5">
          {/* Historique */}
          <section className="lg:col-span-3">
            <h2 className="mb-4 text-2xl font-semibold">Historique des relevés</h2>
            <Card className="divide-y divide-ivory-200 p-0">
              {(hist?.points.length ?? 0) === 0 && (
                <p className="p-6 text-center text-sm text-ink-500">Aucun relevé sur les dernières 24 h.</p>
              )}
              {[...(hist?.points ?? [])].reverse().map((p, i) => {
                const s = statusForValue(p.value, equipment);
                return (
                  <div key={`${p.at}-${i}`} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone[s].dot}`} />
                      <span className="text-sm text-ink-500">{dateTime(p.at, tz)}{p.source === "iot" ? " · capteur" : ""}</span>
                    </div>
                    <div className="flex items-baseline gap-3">
                      <span className={`text-xs ${tone[s].text}`}>{tone[s].label}</span>
                      <span className={`font-display text-lg font-semibold ${tone[s].text}`}>
                        {formatTemp(p.value)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </Card>
          </section>

          {/* Alertes liées */}
          <section className="lg:col-span-2">
            <h2 className="mb-4 text-2xl font-semibold">Alertes liées</h2>
            {alerts.length === 0 ? (
              <Card className="p-6 text-center text-sm text-ink-500">Aucune alerte pour cet équipement.</Card>
            ) : (
              <div className="space-y-3">
                {alerts.map((a) => (
                  <Link key={a.id} href="/alertes" className="block">
                    <Card className="p-4 transition-shadow hover:shadow-lux">
                      <p className="text-xs text-ink-500">
                        {severityLabels[a.severity]} · {stateLabels[a.state]}
                      </p>
                      <p className="mt-1 text-sm font-medium">{a.title}</p>
                      <p className="mt-1 text-xs text-ink-400">{timeAgo(a.createdAt)}</p>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}