"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus, Thermometer } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorBox, InlineError, Loading } from "@/components/ui/state";
import { LotForm } from "@/components/tracabilite/lot-form";
import { useApi } from "@/hooks/use-api";
import { api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";
import {
  Lot,
  LotInput,
  categoryLabels,
  dayLabel,
  formatDate,
  isTempOk,
  maxReceptionTemp,
  statusLabels,
  tone,
} from "@/lib/tracabilite";

type Filter = "stock" | "watch" | "closed";

const filters: { value: Filter; label: string }[] = [
  { value: "stock", label: "En stock" },
  { value: "watch", label: "À traiter" },
  { value: "closed", label: "Sortis" },
];

export default function TracabilitePage() {
  const { ep, can, refreshAlerts } = useSession();
  const canWrite = can("tracabilite", "write");
  const [filter, setFilter] = useState<Filter>("stock");
  const [showForm, setShowForm] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const stockQ = useApi<{ data: Lot[] }>(ep("/lots"), { state: "stock", limit: 200 });
  // Les lots sortis ne sont chargés que dans l'onglet « Sortis »
  const usedQ = useApi<{ data: Lot[] }>(filter === "closed" ? ep("/lots") : null, { state: "used", limit: 100 });
  const discardedQ = useApi<{ data: Lot[] }>(filter === "closed" ? ep("/lots") : null, { state: "discarded", limit: 100 });

  const inStock = useMemo(() => stockQ.data?.data ?? [], [stockQ.data]);
  const closedLots = useMemo(() => [...(usedQ.data?.data ?? []), ...(discardedQ.data?.data ?? [])], [usedQ.data, discardedQ.data]);

  const reloadAll = () => {
    stockQ.reload();
    if (filter === "closed") {
      usedQ.reload();
      discardedQ.reload();
    }
    refreshAlerts();
  };

  const add = async (input: LotInput): Promise<string | null> => {
    const path = ep("/lots");
    if (!path) return "Établissement inconnu.";
    try {
      await api(path, { method: "POST", body: input });
      setShowForm(false);
      setFilter("stock");
      stockQ.reload();
      refreshAlerts();
      return null;
    } catch (err) {
      return errorMessage(err);
    }
  };

  const close = async (id: string, state: "used" | "discarded") => {
    const path = ep(`/lots/${id}/${state === "used" ? "use" : "discard"}`);
    if (!path) return;
    setPendingId(id);
    setActionError(null);
    try {
      await api(path, { method: "POST", body: {} });
      reloadAll();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setPendingId(null);
    }
  };

  const expired = inStock.filter((l) => l.dlcStatus === "expired").length;
  const soon = inStock.filter((l) => l.dlcStatus === "today" || l.dlcStatus === "soon").length;

  const visible = (filter === "closed" ? closedLots : filter === "watch" ? inStock.filter((l) => l.dlcStatus !== "ok") : inStock).sort(
    (a, b) => (filter === "closed" ? b.dlc.localeCompare(a.dlc) : a.dlc.localeCompare(b.dlc))
  );

  if (stockQ.loading && !stockQ.data) {
    return (
      <>
        <Topbar title="Traçabilité et DLC" />
        <main className="mx-auto w-full max-w-[1400px] p-4 md:p-8 xl:p-10">
          <Loading />
        </main>
      </>
    );
  }
  if (stockQ.error) {
    return (
      <>
        <Topbar title="Traçabilité et DLC" />
        <main className="mx-auto w-full max-w-[1400px] p-4 md:p-8 xl:p-10">
          <ErrorBox message={stockQ.error} onRetry={stockQ.reload} />
        </main>
      </>
    );
  }

  return (
    <>
      <Topbar title="Traçabilité et DLC" subtitle={`${inStock.length} lot(s) en stock`} />
      <main className="mx-auto w-full max-w-[1400px] space-y-6 p-4 md:space-y-8 md:p-8 xl:p-10">
        <div className="animate-fade-up">
          <p className="eyebrow">Réception et stock</p>
          <h1 className="mt-1 font-display text-4xl font-semibold md:text-5xl">Traçabilité</h1>
          <div className="ornament mt-4 max-w-xs" />
        </div>

        <section className="grid grid-cols-3 gap-3 md:gap-6">
          <Card className="p-4 md:p-5">
            <p className="text-xs text-ink-500">Périmés</p>
            <p className="mt-1 font-display text-3xl font-semibold text-status-critical md:text-4xl">{expired}</p>
          </Card>
          <Card className="p-4 md:p-5">
            <p className="text-xs text-ink-500">Bientôt périmés</p>
            <p className="mt-1 font-display text-3xl font-semibold text-status-warn md:text-4xl">{soon}</p>
          </Card>
          <Card className="p-4 md:p-5">
            <p className="text-xs text-ink-500">En stock</p>
            <p className="mt-1 font-display text-3xl font-semibold md:text-4xl">{inStock.length}</p>
          </Card>
        </section>

        {expired > 0 && (
          <p className="rounded-2xl border border-status-critical/25 bg-white p-4 text-sm font-medium text-status-critical shadow-card">
            {expired} lot{expired > 1 ? "s" : ""} périmé{expired > 1 ? "s" : ""} à retirer immédiatement du stock.
          </p>
        )}

        {canWrite &&
          (showForm ? (
            <LotForm onSubmit={add} onCancel={() => setShowForm(false)} />
          ) : (
            <Button onClick={() => setShowForm(true)}>
              <Plus size={16} strokeWidth={1.75} /> Nouvelle réception
            </Button>
          ))}

        <InlineError message={actionError} />

        <div className="flex gap-2">
          {filters.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`min-h-11 rounded-full px-4 text-sm transition-colors ${
                filter === f.value ? "bg-ink-900 text-white" : "bg-ivory-200 text-ink-500 hover:text-ink-900"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {filter === "closed" && (usedQ.loading || discardedQ.loading) && closedLots.length === 0 ? (
          <Loading />
        ) : visible.length === 0 ? (
          <Card className="p-8 text-center text-sm text-ink-500">Aucun lot à afficher.</Card>
        ) : (
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {visible.map((l) => {
              const days = l.daysLeft;
              const status = l.dlcStatus ?? "ok";
              const closed = l.state !== "stock";
              const tempOk = isTempOk(l.category, l.receptionTemp);
              return (
                <Card key={l.id} className={`overflow-hidden p-5 ${closed ? "opacity-70" : ""}`}>
                  <span className={`absolute inset-x-0 top-0 h-0.5 ${closed ? "bg-ink-400" : tone[status].bar}`} />

                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{l.product}</p>
                      <p className="truncate text-xs text-ink-500">
                        {categoryLabels[l.category]} · {l.supplier}
                      </p>
                    </div>
                    {closed ? (
                      <span className="shrink-0 rounded-full bg-ivory-200 px-2.5 py-1 text-[11px] font-medium text-ink-500">
                        {l.state === "used" ? "Utilisé" : "Jeté"}
                      </span>
                    ) : (
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${tone[status].chip}`}>
                        {statusLabels[status]}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-ink-500">
                    <span>
                      DLC :{" "}
                      <span className={`font-medium ${closed ? "" : tone[status].text}`}>{formatDate(l.dlc)}</span>
                      {!closed && <span className="text-ink-400"> · {dayLabel(days)}</span>}
                    </span>
                    <span>Lot : <span className="font-medium text-ink-900">{l.lotNumber}</span></span>
                    <span>Quantité : {l.quantity}</span>
                    <span>Reçu le {formatDate(l.receivedAt)}</span>
                  </div>

                  {l.receptionTemp !== null && (
                    <p className={`mt-3 flex items-center gap-1 text-xs ${tempOk ? "text-ink-500" : "font-medium text-status-critical"}`}>
                      <Thermometer size={13} strokeWidth={1.75} />
                      À réception : {String(l.receptionTemp).replace(".", ",")} °C
                      {maxReceptionTemp[l.category] !== null && ` (max ${maxReceptionTemp[l.category]} °C)`}
                    </p>
                  )}

                  {l.note && (
                    <p className="mt-3 rounded-lg bg-status-ok/5 px-3 py-2 text-xs text-status-ok">
                      <span className="font-medium">Note : </span>
                      {l.note}
                    </p>
                  )}

                  {closed ? (
                    <p className="mt-3 border-t border-ivory-200 pt-3 text-xs text-ink-400">
                      Sorti du stock le {l.closedAt ? formatDate(l.closedAt) : "—"}
                    </p>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-ivory-200 pt-3">
                      {canWrite ? (
                        <>
                          <Button variant="secondary" disabled={pendingId === l.id} onClick={() => close(l.id, "used")} className="!min-h-9 !px-3 !text-xs">
                            {pendingId === l.id ? <Loader2 size={12} className="animate-spin" /> : null} Marquer utilisé
                          </Button>
                          <Button variant="secondary" disabled={pendingId === l.id} onClick={() => close(l.id, "discarded")} className="!min-h-9 !px-3 !text-xs">
                            Jeter
                          </Button>
                        </>
                      ) : (
                        <span className="text-xs text-ink-400">Lecture seule</span>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </section>
        )}
      </main>
    </>
  );
}