"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle, AlertOctagon, Loader2 } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorBox, InlineError, Loading } from "@/components/ui/state";
import { useApi } from "@/hooks/use-api";
import { api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Equipment } from "@/lib/equipment";
import { hhmm } from "@/lib/time";
import {
  Reading,
  ReadingStatus,
  formatRange,
  formatTemp,
  getStatus,
  parseTemp,
  statusLabels,
} from "@/lib/releves";

const tone: Record<ReadingStatus, { text: string; bar: string; chip: string }> = {
  ok: { text: "text-status-ok", bar: "bg-status-ok", chip: "bg-status-ok/10 text-status-ok" },
  warn: { text: "text-status-warn", bar: "bg-status-warn", chip: "bg-status-warn/10 text-status-warn" },
  critical: { text: "text-status-critical", bar: "bg-status-critical", chip: "bg-status-critical/10 text-status-critical" },
};

const statusIcon = { ok: CheckCircle2, warn: AlertTriangle, critical: AlertOctagon };

type Draft = { value: string; action: string };

export default function RelevesPage() {
  const { est, ep, can, refreshAlerts } = useSession();
  const tz = est?.timezone;
  const canWrite = can("releves", "write");
  const eqQ = useApi<{ data: Equipment[] }>(ep("/equipments"));
  const rdQ = useApi<{ data: Reading[] }>(ep("/readings"), { limit: 200 });
  const equipments = useMemo(() => eqQ.data?.data ?? [], [eqQ.data]);
  const readings = useMemo(() => rdQ.data?.data ?? [], [rdQ.data]);

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setDraft = (id: string, patch: Partial<Draft>) =>
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { value: "", action: "" }), ...patch },
    }));
  const lastOf = (id: string) => readings.find((r) => r.equipmentId === id);

  const submit = async (id: string) => {
    const e = equipments.find((x) => x.id === id);
    const d = drafts[id];
    const path = ep("/readings");
    if (!e || !d || !path) return;
    const value = parseTemp(d.value);
    if (value === null) return;
    const status = getStatus(value, e);
    if (status === "critical" && !d.action.trim()) return;

    setBusyId(id);
    setErrors((p) => ({ ...p, [id]: "" }));
    try {
      await api(path, { method: "POST", body: { equipmentId: id, value, action: d.action.trim() || undefined } });
      setDrafts((prev) => ({ ...prev, [id]: { value: "", action: "" } }));
      eqQ.reload();
      rdQ.reload();
      refreshAlerts();
    } catch (err) {
      setErrors((p) => ({ ...p, [id]: errorMessage(err) }));
    } finally {
      setBusyId(null);
    }
  };

  const counts = { ok: 0, warn: 0, critical: 0 };
  equipments.forEach((e) => {
    const l = lastOf(e.id);
    if (l) counts[l.status]++;
  });

  if ((eqQ.loading || rdQ.loading) && (!eqQ.data || !rdQ.data)) {
    return (
      <>
        <Topbar title="Relevés de température" />
        <main className="mx-auto w-full max-w-[1400px] p-4 md:p-8 xl:p-10">
          <Loading />
        </main>
      </>
    );
  }
  if (eqQ.error || rdQ.error) {
    return (
      <>
        <Topbar title="Relevés de température" />
        <main className="mx-auto w-full max-w-[1400px] p-4 md:p-8 xl:p-10">
          <ErrorBox
            message={eqQ.error ?? rdQ.error ?? ""}
            onRetry={() => {
              eqQ.reload();
              rdQ.reload();
            }}
          />
        </main>
      </>
    );
  }

  return (
    <>
      <Topbar title="Relevés de température" subtitle={`${readings.length} relevé(s) aujourd'hui`} />
      <main className="mx-auto w-full max-w-[1400px] space-y-6 p-4 md:space-y-8 md:p-8 xl:p-10">
        <div className="animate-fade-up">
          <p className="eyebrow">Autocontrôle</p>
          <h1 className="mt-1 font-display text-4xl font-semibold md:text-5xl">Relevés</h1>
          <div className="ornament mt-4 max-w-xs" />
        </div>

        <section className="grid grid-cols-3 gap-3 md:gap-6">
          {(["ok", "warn", "critical"] as ReadingStatus[]).map((s) => (
            <Card key={s} className="p-4 md:p-5">
              <p className="text-xs text-ink-500">{statusLabels[s]}</p>
              <p className={`mt-1 font-display text-3xl font-semibold md:text-4xl ${tone[s].text}`}>
                {counts[s]}
              </p>
            </Card>
          ))}
        </section>

        {canWrite && (
        <section>
          <h2 className="mb-4 text-2xl font-semibold md:text-3xl">Nouveau relevé</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {equipments.map((e) => {
              const d = drafts[e.id] ?? { value: "", action: "" };
              const parsed = parseTemp(d.value);
              const live = parsed !== null ? getStatus(parsed, e) : null;
              const last = lastOf(e.id);
              const needsAction = live === "warn" || live === "critical";
              const blocked = parsed === null || (live === "critical" && !d.action.trim());

              return (
                <Card key={e.id} className="overflow-hidden p-5">
                  <span className={`absolute inset-x-0 top-0 h-0.5 ${tone[live ?? last?.status ?? "ok"].bar}`} />
                  <p className="truncate text-sm font-medium">{e.name}</p>
                  <p className="mt-1 text-xs text-ink-500">
                    {e.zone} · Plage : {formatRange(e)}
                  </p>
                  {last && (
                    <p className="mt-3 text-xs text-ink-400">
                      Dernier : <span className={`font-medium ${tone[last.status].text}`}>{formatTemp(last.value)}</span>{" "}
                      à {hhmm(last.at, tz)}
                    </p>
                  )}

                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="ex : 2,8"
                      value={d.value}
                      onChange={(ev) => setDraft(e.id, { value: ev.target.value })}
                      className="min-h-11 w-full rounded-xl border border-ivory-300 bg-white px-3 text-lg outline-none focus:border-gold-500"
                    />
                    <span className="text-sm text-ink-500">°C</span>
                  </div>

                  {live && (
                    <p className={`mt-2 text-xs font-medium ${tone[live].text}`}>{statusLabels[live]}</p>
                  )}

                  {needsAction && (
                    <textarea
                      rows={2}
                      placeholder={live === "critical" ? "Action corrective (obligatoire)" : "Action corrective (facultatif)"}
                      value={d.action}
                      onChange={(ev) => setDraft(e.id, { action: ev.target.value })}
                      className="mt-3 w-full rounded-xl border border-ivory-300 bg-white p-3 text-sm outline-none focus:border-gold-500"
                    />
                  )}

                  <InlineError message={errors[e.id]} />

                  <Button className="mt-3 w-full" onClick={() => submit(e.id)} disabled={blocked || busyId === e.id}>
                    {busyId === e.id ? <Loader2 size={16} className="animate-spin" /> : null} Enregistrer
                  </Button>
                </Card>
              );
            })}
          </div>
        </section>
        )}

        <section>
          <h2 className="mb-4 text-2xl font-semibold md:text-3xl">Historique du jour</h2>
          <Card className="divide-y divide-ivory-200 p-0">
            {readings.length === 0 && <p className="p-6 text-center text-sm text-ink-500">Aucun relevé aujourd&apos;hui.</p>}
            {readings.map((r) => {
              const Icon = statusIcon[r.status];
              return (
                <div key={r.id} className="flex items-start gap-3 p-4">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone[r.status].chip}`}>
                    <Icon size={16} strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className="truncate text-sm font-medium">{r.equipmentName}</p>
                      <p className={`font-display text-xl font-semibold ${tone[r.status].text}`}>
                        {formatTemp(r.value)}
                      </p>
                    </div>
                    <p className="text-xs text-ink-400">
                      {hhmm(r.at, tz)} · {r.by}{r.source === "iot" ? " (capteur)" : ""} · {statusLabels[r.status]}
                    </p>
                    {r.action && (
                      <p className="mt-2 rounded-lg bg-status-ok/5 px-3 py-2 text-xs text-status-ok">
                        <span className="font-medium">Action corrective : </span>
                        {r.action}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
        </section>
      </main>
    </>
  );
}