"use client";

import { useMemo } from "react";
import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { ErrorBox, Loading } from "@/components/ui/state";
import { FryerForm } from "@/components/huile/fryer-form";
import { useApi } from "@/hooks/use-api";
import { api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";
import {
  DEFAULT_LIMITS,
  EXPECTED_PER_FRYER,
  Fryer,
  OilControl,
  OilInput,
  OilLimits,
  aspectLabels,
  formatPolar,
  slotLabels,
  statusLabels,
  tone,
} from "@/lib/huile";
import { hhmm, todayIn } from "@/lib/time";

type FryersResponse = { date: string; limits: OilLimits; data: Fryer[] };

export default function HuilePage() {
  const { est, ep, can, refreshAlerts } = useSession();
  const tz = est?.timezone ?? "Europe/Paris";
  const today = todayIn(tz);
  const yesterday = useMemo(() => todayIn(tz, new Date(Date.now() - 86_400_000)), [tz]);

  const fryersQ = useApi<FryersResponse>(ep("/oil/fryers"));
  const todayQ = useApi<{ data: OilControl[] }>(ep("/oil/controls"), { day: today });
  const yesterdayQ = useApi<{ data: OilControl[] }>(ep("/oil/controls"), { day: yesterday });

  const reloadAll = () => {
    fryersQ.reload();
    todayQ.reload();
    yesterdayQ.reload();
    refreshAlerts();
  };

  const add = async (input: OilInput): Promise<string | null> => {
    try {
      await api(ep("/oil/controls")!, { method: "POST", body: input });
      reloadAll();
      return null;
    } catch (err) {
      return errorMessage(err);
    }
  };

  const oilChanged = async (fryerId: string): Promise<string | null> => {
    try {
      await api(ep(`/oil/fryers/${fryerId}/changes`)!, { method: "POST", body: {} });
      reloadAll();
      return null;
    } catch (err) {
      return errorMessage(err);
    }
  };

  if (fryersQ.loading && !fryersQ.data) {
    return (
      <>
        <Topbar title="Huile de friture" />
        <main className="mx-auto w-full max-w-[1400px] p-4 md:p-8 xl:p-10">
          <Loading />
        </main>
      </>
    );
  }
  if (fryersQ.error || !fryersQ.data) {
    return (
      <>
        <Topbar title="Huile de friture" />
        <main className="mx-auto w-full max-w-[1400px] p-4 md:p-8 xl:p-10">
          <ErrorBox message={fryersQ.error ?? "Données indisponibles."} onRetry={reloadAll} />
        </main>
      </>
    );
  }

  const fryers = fryersQ.data.data;
  const limits = fryersQ.data.limits ?? DEFAULT_LIMITS;
  const todayControls = todayQ.data?.data ?? [];
  const history = [...todayControls, ...(yesterdayQ.data?.data ?? [])].sort((a, b) => b.at.localeCompare(a.at));

  const expected = fryers.length * EXPECTED_PER_FRYER;
  const done = new Set(todayControls.map((c) => `${c.fryerId}-${c.slot}`)).size;
  const percent = expected ? Math.min((done / expected) * 100, 100) : 0;
  const toChange = fryers.filter((f) => f.lastControl?.status === "change").length;
  const canWrite = can("huile", "write");

  return (
    <>
      <Topbar title="Huile de friture" subtitle={`${done} / ${expected} contrôles faits aujourd'hui`} />
      <main className="mx-auto w-full max-w-[1400px] space-y-6 p-4 md:space-y-8 md:p-8 xl:p-10">
        <div className="animate-fade-up">
          <p className="eyebrow">Autocontrôle</p>
          <h1 className="mt-1 font-display text-4xl font-semibold md:text-5xl">Huile de friture</h1>
          <div className="ornament mt-4 max-w-xs" />
        </div>

        <Card className="p-5 md:p-6">
          <div className="flex items-baseline justify-between gap-3">
            <p className="eyebrow">Avancement du jour</p>
            <p className="font-display text-2xl font-semibold">
              {done}
              <span className="text-ink-400"> / {expected}</span>
            </p>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ivory-200">
            <div className="h-full rounded-full bg-gold-gradient" style={{ width: `${percent}%` }} />
          </div>
          {toChange > 0 && (
            <p className="mt-3 text-sm font-medium text-status-critical">
              {toChange} friteuse{toChange > 1 ? "s" : ""} avec une huile à changer
            </p>
          )}
        </Card>

        <section>
          <h2 className="mb-4 text-2xl font-semibold md:text-3xl">Nouveau contrôle</h2>
          {fryers.length === 0 ? (
            <Card className="p-8 text-center text-sm text-ink-500">Aucune friteuse dans vos équipements.</Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {fryers.map((f) => (
                <FryerForm
                  key={f.id}
                  fryer={f}
                  limits={limits}
                  tz={tz}
                  canWrite={canWrite}
                  onSubmit={add}
                  onOilChanged={oilChanged}
                />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-4 text-2xl font-semibold md:text-3xl">Historique</h2>
          {history.length === 0 ? (
            <Card className="p-8 text-center text-sm text-ink-500">Aucun contrôle récent.</Card>
          ) : (
            <Card className="divide-y divide-ivory-200 p-0">
              {history.map((c) => (
                <div key={c.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{c.fryerName}</p>
                      <p className="text-xs text-ink-400">
                        {c.dayKey === today ? "Aujourd'hui" : "Hier"} · {slotLabels[c.slot]} · {hhmm(c.at, tz)} · {c.by}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${tone[c.status].chip}`}>
                      {statusLabels[c.status]}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-500">
                    <span>
                      Polaires : <span className={`font-medium ${tone[c.status].text}`}>{formatPolar(c.polar)}</span>
                    </span>
                    <span>Température : {c.temp} °C</span>
                    <span>Aspect : {aspectLabels[c.aspect]}</span>
                  </div>
                  {c.action && (
                    <p className="mt-2 rounded-lg bg-status-ok/5 px-3 py-2 text-xs text-status-ok">
                      <span className="font-medium">Action corrective : </span>
                      {c.action}
                    </p>
                  )}
                </div>
              ))}
            </Card>
          )}
        </section>
      </main>
    </>
  );
}
