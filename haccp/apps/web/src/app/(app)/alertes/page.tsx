"use client";

import { useState } from "react";
import { Topbar } from "@/components/layout/topbar";
import { AlertCard } from "@/components/alertes/alert-card";
import { Card } from "@/components/ui/card";
import { ErrorBox, InlineError, Loading } from "@/components/ui/state";
import { useApi } from "@/hooks/use-api";
import { api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Alert, AlertSeverity, AlertsSummary, severityLabels } from "@/lib/alerts";

type Filter = "active" | "resolved" | "all";

const filters: { value: Filter; label: string }[] = [
  { value: "active", label: "Actives" },
  { value: "resolved", label: "Résolues" },
  { value: "all", label: "Toutes" },
];

const summaryTone: Record<AlertSeverity, string> = {
  critical: "text-status-critical",
  warn: "text-status-warn",
  info: "text-ink-500",
};

const sevOrder: Record<AlertSeverity, number> = { critical: 0, warn: 1, info: 2 };

export default function AlertesPage() {
  const { ep, can, user, refreshAlerts } = useSession();
  const [filter, setFilter] = useState<Filter>("active");
  const [actionError, setActionError] = useState<string | null>(null);

  // « Toutes » = actives + résolues : l'API filtre par état, on fusionne les deux listes.
  const activeQ = useApi<{ data: Alert[]; summary: AlertsSummary }>(
    filter === "resolved" ? null : ep("/alerts"),
    { state: "active", limit: 100 }
  );
  const resolvedQ = useApi<{ data: Alert[]; summary: AlertsSummary }>(
    filter === "active" ? null : ep("/alerts"),
    { state: "resolved", limit: 100 }
  );
  // Compteurs par gravité : toujours les alertes actives
  const summaryQ = useApi<{ summary: AlertsSummary }>(ep("/alerts"), { state: "active", limit: 1 });

  const canWrite = can("alertes", "write");
  const canReopen = canWrite && !!user && ["manager", "admin", "super_admin"].includes(user.role);

  const reloadAll = () => {
    activeQ.reload();
    resolvedQ.reload();
    summaryQ.reload();
    refreshAlerts();
  };

  const run = async (id: string, action: "take" | "release" | "resolve" | "reopen", body?: object) => {
    const path = ep(`/alerts/${id}/${action}`);
    if (!path) return;
    setActionError(null);
    try {
      await api(path, { method: "POST", body: body ?? {} });
      reloadAll();
    } catch (err) {
      // Relancé aussi en cas d'erreur : l'alerte a pu changer d'état entre-temps
      setActionError(errorMessage(err));
      reloadAll();
    }
  };

  const summary = summaryQ.data?.summary;
  const loadingAny = (filter !== "resolved" && activeQ.loading && !activeQ.data) || (filter !== "active" && resolvedQ.loading && !resolvedQ.data);
  const errorAny = (filter !== "resolved" ? activeQ.error : null) ?? (filter !== "active" ? resolvedQ.error : null);

  const visible: Alert[] = [
    ...(filter !== "resolved" ? activeQ.data?.data ?? [] : []),
    ...(filter !== "active" ? resolvedQ.data?.data ?? [] : []),
  ].sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity] || a.createdAt.localeCompare(b.createdAt));

  return (
    <>
      <Topbar title="Alertes" subtitle={`${summary?.open ?? 0} alerte(s) active(s)`} />
      <main className="mx-auto w-full max-w-[1400px] space-y-6 p-4 md:space-y-8 md:p-8 xl:p-10">
        <div className="animate-fade-up">
          <p className="eyebrow">Suivi</p>
          <h1 className="mt-1 font-display text-4xl font-semibold md:text-5xl">Alertes</h1>
          <div className="ornament mt-4 max-w-xs" />
        </div>

        <section data-tour="al-summary" className="grid grid-cols-3 gap-3 md:gap-6">
          {(["critical", "warn", "info"] as AlertSeverity[]).map((s) => (
            <Card key={s} className="p-4 md:p-5">
              <p className="text-xs text-ink-500">{severityLabels[s]}</p>
              <p className={`mt-1 font-display text-3xl font-semibold md:text-4xl ${summaryTone[s]}`}>
                {summary ? summary[s] : 0}
              </p>
            </Card>
          ))}
        </section>

        <div className="flex gap-2">
          {filters.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`min-h-11 rounded-full px-4 text-sm transition-colors ${
                filter === f.value
                  ? "bg-ink-900 text-white"
                  : "bg-ivory-200 text-ink-500 hover:text-ink-900"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <InlineError message={actionError} />

        {loadingAny ? (
          <Loading />
        ) : errorAny ? (
          <ErrorBox message={errorAny} onRetry={reloadAll} />
        ) : visible.length === 0 ? (
          <Card className="p-8 text-center text-sm text-ink-500">Aucune alerte à afficher.</Card>
        ) : (
          <section data-tour="al-list" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {visible.map((a) => (
              <AlertCard
                key={a.id}
                alert={a}
                canWrite={canWrite}
                canReopen={canReopen}
                onTake={(id) => run(id, "take")}
                onRelease={(id) => run(id, "release")}
                onReopen={(id) => run(id, "reopen")}
                onResolve={(id, correctiveAction) => run(id, "resolve", { correctiveAction })}
              />
            ))}
          </section>
        )}
      </main>
    </>
  );
}