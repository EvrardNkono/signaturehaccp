"use client";

import { useEffect, useMemo, useState } from "react";
import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { TaskRow } from "@/components/nettoyage/task-row";
import { ErrorBox, InlineError, Loading } from "@/components/ui/state";
import { useApi } from "@/hooks/use-api";
import { api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";
import { hhmm } from "@/lib/time";
import { CleaningTask, toMinutes } from "@/lib/nettoyage";

type Filter = "all" | "todo" | "done";

const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "Toutes" },
  { value: "todo", label: "À faire" },
  { value: "done", label: "Faites" },
];

export default function NettoyagePage() {
  const { est, ep, can, user, refreshAlerts } = useSession();
  const tz = est?.timezone ?? "Europe/Paris";
  const { data, error, loading, reload } = useApi<{ date: string; data: CleaningTask[] }>(ep("/cleaning"));
  const tasks = useMemo(() => data?.data ?? [], [data]);
  const [filter, setFilter] = useState<Filter>("all");
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  // null au premier rendu : évite un décalage entre serveur et navigateur
  const [nowMin, setNowMin] = useState<number | null>(null);

  // Cocher : tout opérateur autorisé. Décocher : réservé aux responsables (règle de l'API).
  const canCheck = can("nettoyage", "write");
  const canUncheck = canCheck && !!user && ["manager", "admin", "super_admin"].includes(user.role);

  useEffect(() => {
    // Heure locale de l'établissement (et non celle du navigateur) pour détecter les retards
    const update = () => {
      const [h, m] = hhmm(new Date().toISOString(), tz).split(":").map(Number);
      setNowMin(h * 60 + m);
    };
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, [tz]);

  const toggle = async (id: string) => {
    const task = tasks.find((t) => t.id === id);
    const path = ep(`/cleaning/${id}/complete`);
    if (!task || !path) return;
    if (task.done && !canUncheck) return;
    if (!task.done && !canCheck) return;
    setPendingId(id);
    setActionError(null);
    try {
      await api(path, { method: task.done ? "DELETE" : "POST" });
      reload();
      refreshAlerts();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setPendingId(null);
    }
  };

  const isOverdue = (t: CleaningTask) =>
    nowMin !== null && !t.done && toMinutes(t.dueTime) < nowMin;

  const done = tasks.filter((t) => t.done).length;
  const overdueCount = tasks.filter(isOverdue).length;
  const percent = tasks.length ? (done / tasks.length) * 100 : 0;

  const visible = tasks.filter((t) =>
    filter === "all" ? true : filter === "todo" ? !t.done : t.done
  );
  const zones = Array.from(new Set(visible.map((t) => t.zone)));

  return (
    <>
      <Topbar title="Nettoyage" subtitle={`${done} / ${tasks.length} tâches faites aujourd'hui`} />
      <main className="mx-auto w-full max-w-[1400px] space-y-6 p-4 md:space-y-8 md:p-8 xl:p-10">
        <div className="animate-fade-up">
          <p className="eyebrow">Plan de nettoyage</p>
          <h1 className="mt-1 font-display text-4xl font-semibold md:text-5xl">Nettoyage</h1>
          <div className="ornament mt-4 max-w-xs" />
        </div>

        <Card className="p-5 md:p-6">
          <div className="flex items-baseline justify-between gap-3">
            <p className="eyebrow">Avancement du jour</p>
            <p className="font-display text-2xl font-semibold">
              {done}
              <span className="text-ink-400"> / {tasks.length}</span>
            </p>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ivory-200">
            <div className="h-full rounded-full bg-gold-gradient" style={{ width: `${percent}%` }} />
          </div>
          {overdueCount > 0 && (
            <p className="mt-3 text-sm font-medium text-status-critical">
              {overdueCount} tâche{overdueCount > 1 ? "s" : ""} en retard
            </p>
          )}
        </Card>

        <InlineError message={actionError} />

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

        {loading && !data ? (
          <Loading />
        ) : error ? (
          <ErrorBox message={error} onRetry={reload} />
        ) : zones.length === 0 ? (
          <Card className="p-8 text-center text-sm text-ink-500">Aucune tâche à afficher.</Card>
        ) : (
          zones.map((zone) => (
            <section key={zone}>
              <h2 className="mb-3 text-2xl font-semibold">{zone}</h2>
              <Card className="divide-y divide-ivory-200 p-0">
                {visible
                  .filter((t) => t.zone === zone)
                  .map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      overdue={isOverdue(t)}
                      tz={tz}
                      disabled={pendingId === t.id || (t.done ? !canUncheck : !canCheck)}
                      onToggle={toggle}
                    />
                  ))}
              </Card>
            </section>
          ))
        )}
      </main>
    </>
  );
}