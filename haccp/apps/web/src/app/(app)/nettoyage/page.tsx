"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TaskRow } from "@/components/nettoyage/task-row";
import { TaskForm } from "@/components/nettoyage/task-form";
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
  // Créer / modifier / supprimer un modèle de tâche : responsables et au-dessus (règle de l'API).
  const canManage = canUncheck;

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CleaningTask | null>(null);
  const [deleting, setDeleting] = useState<CleaningTask | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (t: CleaningTask) => {
    setEditing(t);
    setFormOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const path = ep(`/cleaning/${deleting.id}`);
    if (!path) return;
    setDeleteBusy(true);
    setActionError(null);
    try {
      await api(path, { method: "DELETE" });
      setDeleting(null);
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  };

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
          {canManage && (
            <Button onClick={openCreate} className="mt-5">
              <Plus size={16} strokeWidth={1.75} /> Ajouter une tâche
            </Button>
          )}
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
          <Card className="p-8 text-center text-sm text-ink-500">
            <p>{tasks.length === 0 ? "Aucune tâche dans le plan de nettoyage." : "Aucune tâche à afficher."}</p>
            {tasks.length === 0 && canManage && (
              <Button onClick={openCreate} className="mt-4">
                <Plus size={16} strokeWidth={1.75} /> Créer la première tâche
              </Button>
            )}
          </Card>
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
                      onEdit={canManage ? openEdit : undefined}
                      onDelete={canManage ? setDeleting : undefined}
                    />
                  ))}
              </Card>
            </section>
          ))
        )}
      </main>

      <TaskForm
        open={formOpen}
        task={editing}
        zones={Array.from(new Set(tasks.map((t) => t.zone))).sort()}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          reload();
          refreshAlerts();
        }}
      />

      {deleting && (
        <>
          <div className="fixed inset-0 z-40 bg-ink-950/60 backdrop-blur-sm" onClick={() => !deleteBusy && setDeleting(null)} />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-task-title"
            className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-gold-500/20 bg-ink-900 bg-ink-glow p-6 text-ivory-100 shadow-lux"
          >
            <p className="eyebrow !text-gold-300">Confirmation</p>
            <h3 id="delete-task-title" className="mt-1 text-2xl font-semibold">
              Supprimer cette tâche ?
            </h3>
            <div className="ornament mt-3 w-20" />
            <p className="mt-4 text-sm leading-relaxed text-ivory-200">
              « {deleting.title} » disparaîtra du plan de nettoyage. L&apos;historique des validations déjà
              enregistrées reste conservé.
            </p>
            <div className="mt-6 flex gap-3">
              <Button
                variant="secondary"
                onClick={() => setDeleting(null)}
                disabled={deleteBusy}
                className="flex-1 !border-ivory-100/30 !text-ivory-100 hover:!bg-ivory-100 hover:!text-ink-900"
              >
                Annuler
              </Button>
              <button
                onClick={confirmDelete}
                disabled={deleteBusy}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-terracotta-500 px-5 text-sm font-medium tracking-wide text-ivory-50 transition hover:bg-terracotta-400 disabled:opacity-60"
              >
                {deleteBusy ? <Loader2 size={16} className="animate-spin" /> : null} Supprimer
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}