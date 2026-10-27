"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, ArrowRight, LineChart } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScoreRing } from "@/components/ui/score-ring";
import { Sparkline } from "@/components/ui/sparkline";
import { ErrorBox, Loading } from "@/components/ui/state";
import { SetupChecklist } from "@/components/guide/setup-checklist";
import { useApi } from "@/hooks/use-api";
import { useSession } from "@/lib/session";
import { Equipment, Status, formatRange, formatTemp, getStatus } from "@/lib/equipment";
import { longDate, timeAgo } from "@/lib/time";

const tone: Record<Status, { text: string; dot: string; bar: string }> = {
  ok: { text: "text-status-ok", dot: "bg-status-ok", bar: "bg-status-ok" },
  warn: { text: "text-status-warn", dot: "bg-status-warn", bar: "bg-status-warn" },
  critical: { text: "text-status-critical", dot: "bg-status-critical", bar: "bg-status-critical" },
  offline: { text: "text-ink-400", dot: "bg-ink-400", bar: "bg-ink-400" },
};

type DashboardData = {
  date: string;
  score: number;
  summary: { label: string; done: number; total: number }[];
  progress: { label: string; done: number; total: number }[];
  equipmentCounts: { ok: number; warn: number; critical: number; offline: number; total: number };
  criticalEquipment: Equipment | null;
  alerts: { open: number; critical: number; warn: number; info: number };
};

export default function DashboardPage() {
  const { est, ep, user } = useSession();
  const dash = useApi<DashboardData>(ep("/dashboard"));
  const eqs = useApi<{ data: Equipment[] }>(ep("/equipments"));

  const subtitle = `${longDate(est?.timezone)} · ${est?.name ?? ""}`;

  if ((dash.loading || eqs.loading) && (!dash.data || !eqs.data)) {
    return (
      <>
        <Topbar title="Tableau de bord" subtitle={subtitle} />
        <main className="mx-auto w-full max-w-[1400px] p-4 md:p-8 xl:p-10">
          <Loading />
        </main>
      </>
    );
  }
  if (dash.error || eqs.error || !dash.data || !eqs.data) {
    return (
      <>
        <Topbar title="Tableau de bord" subtitle={subtitle} />
        <main className="mx-auto w-full max-w-[1400px] p-4 md:p-8 xl:p-10">
          <ErrorBox
            message={dash.error ?? eqs.error ?? "Données indisponibles."}
            onRetry={() => {
              dash.reload();
              eqs.reload();
            }}
          />
        </main>
      </>
    );
  }

  const d = dash.data;
  const equipments = eqs.data.data.map((e) => ({ ...e, status: getStatus(e) }));
  const critical = d.criticalEquipment ? { ...d.criticalEquipment, status: getStatus(d.criticalEquipment) } : null;
  const okCount = d.equipmentCounts.ok;

  return (
    <>
      <Topbar title="Tableau de bord" subtitle={subtitle} />
      <main className="mx-auto w-full max-w-[1400px] space-y-6 p-4 md:space-y-8 md:p-8 xl:p-10">
        <div className="animate-fade-up">
          <p className="eyebrow">Bienvenue</p>
          <p className="mt-1 font-display text-4xl font-semibold md:text-5xl">Bonjour {user?.firstName}</p>
          <div className="ornament mt-4 max-w-xs" />
        </div>

        <SetupChecklist />

        {/* Urgence */}
        {critical && (
          <section className="animate-fade-up flex flex-col gap-5 rounded-2xl border border-status-critical/25 bg-white p-5 shadow-card md:flex-row md:items-center md:justify-between md:p-6">
            <div className="flex items-start gap-4">
              <div className="relative shrink-0">
                <span className="absolute inset-0 animate-ping rounded-full bg-status-critical/30" />
                <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-status-critical text-white">
                  <AlertTriangle size={22} strokeWidth={1.75} />
                </div>
              </div>
              <div className="min-w-0">
                <p className="eyebrow !text-status-critical">Action requise</p>
                <p className="mt-1 font-display text-2xl font-semibold">
                  {critical.name} : {formatTemp(critical.temp)}
                </p>
                <p className="mt-1 text-sm text-ink-500">
                  Hors de la plage autorisée ({formatRange(critical)}). Dernier relevé {timeAgo(critical.lastReadingAt)}.
                  Les denrées sont en danger.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row md:shrink-0">
              <Link href="/alertes" className="w-full sm:w-auto">
                <Button className="w-full sm:w-auto">Traiter l'alerte</Button>
              </Link>
              <Link href={`/equipements/${critical.id}`} className="w-full sm:w-auto">
                <Button variant="secondary" className="w-full sm:w-auto">
                  <LineChart size={16} strokeWidth={1.5} /> Voir la courbe
                </Button>
              </Link>
            </div>
          </section>
        )}

        {/* État global */}
        <section className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-5">
          <Card tone="dark" data-tour="dash-score" className="lg:col-span-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-gold-400">
              Score de conformité
            </p>
            <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row">
              <ScoreRing value={d.score} />
              <div className="space-y-3 text-sm">
                <p className="flex items-center gap-2 text-ivory-200">
                  <CheckCircle2 size={16} className="text-status-ok" /> {okCount} équipement
                  {okCount > 1 ? "s" : ""} conforme{okCount > 1 ? "s" : ""} sur {d.equipmentCounts.total}
                </p>
                {d.alerts.open > 0 && (
                  <p className="text-ink-400">
                    {d.alerts.open} alerte{d.alerts.open > 1 ? "s" : ""} active{d.alerts.open > 1 ? "s" : ""}
                  </p>
                )}
              </div>
            </div>
          </Card>

          <Card data-tour="dash-progress" className="lg:col-span-3">
            <p className="eyebrow">Aujourd'hui</p>
            <h2 className="mt-1 text-2xl font-semibold">Avancement du jour</h2>
            <ul className="mt-6 space-y-5">
              {d.progress.map((p) => (
                <li key={p.label}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{p.label}</span>
                    <span className="shrink-0 font-display text-lg">
                      {p.done}<span className="text-ink-400"> / {p.total}</span>
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ivory-200">
                    <div
                      className="h-full rounded-full bg-gold-gradient"
                      style={{ width: `${p.total ? Math.min((p.done / p.total) * 100, 100) : 0}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        {/* Détail */}
        <section data-tour="dash-equipments">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Surveillance</p>
              <h2 className="text-2xl font-semibold md:text-3xl">Équipements</h2>
            </div>
            <Link href="/equipements" className="flex min-h-11 items-center gap-1 text-sm text-gold-600 hover:text-gold-500">
              Tout voir <ArrowRight size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {equipments.map((e) => (
              <Link key={e.id} href={`/equipements/${e.id}`} className="block">
                <Card className="overflow-hidden p-5 transition-shadow hover:shadow-lux">
                  <span className={`absolute inset-x-0 top-0 h-0.5 ${tone[e.status].bar}`} />
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{e.name}</p>
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone[e.status].dot}`} />
                  </div>
                  <p className={`mt-3 font-display text-4xl font-semibold ${tone[e.status].text}`}>
                    {formatTemp(e.temp)}
                  </p>
                  <Sparkline data={e.history} className={`mt-3 ${tone[e.status].text}`} />
                  <div className="mt-3 flex flex-wrap justify-between gap-x-3 text-xs text-ink-500">
                    <span>Plage : {formatRange(e)}</span>
                    <span>{e.lastReadingAt ? timeAgo(e.lastReadingAt) : "aucun relevé"}</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}