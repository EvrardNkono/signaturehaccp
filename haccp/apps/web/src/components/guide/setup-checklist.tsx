"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useApi } from "@/hooks/use-api";
import { api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useGuide } from "./guide-provider";

type Onboarding = { steps: string[]; completedSteps: string[]; detectedSteps: string[]; completed: boolean };

const items: { id: string; label: string; hint: string; href?: string }[] = [
  { id: "establishment", label: "Renseigner votre établissement", hint: "Adresse, contact et fuseau horaire.", href: "/parametres" },
  { id: "equipments", label: "Ajouter vos équipements", hint: "Chambres froides, réfrigérateurs, congélateurs.", href: "/equipements" },
  { id: "team", label: "Inviter votre équipe", hint: "Un compte et un rôle pour chaque collaborateur.", href: "/utilisateurs" },
  { id: "thresholds", label: "Ajuster les seuils de température", hint: "Adaptez les plages à vos produits.", href: "/parametres" },
  { id: "document", label: "Joindre un document", hint: "Par exemple votre KBIS ou votre plan de maîtrise sanitaire." },
];

/** Checklist « Premiers pas » du tableau de bord : réservée aux administrateurs, masquable, cochée automatiquement. */
export function SetupChecklist() {
  const { can } = useSession();
  const guide = useGuide();
  const allowed = can("parametres", "write");
  const data = useApi<Onboarding>(allowed ? "/company/onboarding" : null);
  const [error, setError] = useState<string | null>(null);

  const d = data.data;
  if (!allowed || guide.state?.checklistHidden || !d || d.completed) return null;

  const done = new Set([...d.completedSteps, ...d.detectedSteps]);
  const count = items.filter((i) => done.has(i.id)).length;

  const markDone = async (id: string) => {
    setError(null);
    try {
      await api("/company/onboarding", { method: "PUT", body: { completedSteps: [...new Set([...d.completedSteps, id])] } });
      data.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Premiers pas</p>
          <h2 className="mt-1 text-2xl font-semibold">Configurez votre espace</h2>
          <p className="mt-1 text-sm text-ink-500">
            {count} étape{count > 1 ? "s" : ""} sur {items.length}. Les étapes se cochent d&apos;elles-mêmes dès que c&apos;est fait.
          </p>
        </div>
        <button
          onClick={() => guide.setChecklistHidden(true)}
          aria-label="Masquer la checklist"
          title="Masquer (réaffichable depuis le bouton Guide)"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-400 transition hover:bg-ivory-100 hover:text-ink-900"
        >
          <X size={18} strokeWidth={1.5} />
        </button>
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-ivory-200" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={count}>
        <div className="h-full rounded-full bg-gold-gradient transition-all" style={{ width: `${(count / items.length) * 100}%` }} />
      </div>

      <ul className="mt-4 divide-y divide-ivory-200">
        {items.map((item) => {
          const ok = done.has(item.id);
          return (
            <li key={item.id} className="flex items-center gap-3 py-3">
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${ok ? "border-status-ok bg-status-ok text-white" : "border-ivory-300 text-transparent"}`}
              >
                <Check size={13} strokeWidth={2.5} />
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${ok ? "text-ink-400 line-through" : ""}`}>{item.label}</p>
                {!ok && <p className="text-xs text-ink-500">{item.hint}</p>}
              </div>
              {ok ? (
                <span className="text-xs text-status-ok">Fait</span>
              ) : (
                <div className="flex shrink-0 items-center gap-3">
                  <button onClick={() => void markDone(item.id)} className="min-h-10 text-xs text-ink-500 transition hover:text-ink-900">
                    Marquer fait
                  </button>
                  {item.href && (
                    <Link href={item.href} className="inline-flex min-h-10 items-center gap-1 text-sm text-gold-600 transition hover:text-gold-500">
                      Y aller <ArrowRight size={14} strokeWidth={1.75} />
                    </Link>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-2 text-xs text-status-critical">{error}</p>}
    </Card>
  );
}
