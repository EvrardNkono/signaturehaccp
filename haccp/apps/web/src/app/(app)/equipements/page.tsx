"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { EquipmentCard } from "@/components/equipements/equipment-card";
import { EquipmentForm } from "@/components/equipements/equipment-form";
import { ErrorBox, Loading } from "@/components/ui/state";
import { useApi } from "@/hooks/use-api";
import { useSession } from "@/lib/session";
import { Equipment, EquipmentType, typeLabels } from "@/lib/equipment";

const filters: { key: "all" | EquipmentType; label: string }[] = [
  { key: "all", label: "Tous" },
  { key: "fridge", label: typeLabels.fridge + "s" },
  { key: "coldroom", label: typeLabels.coldroom + "s" },
  { key: "freezer", label: typeLabels.freezer + "s" },
  { key: "fryer", label: typeLabels.fryer + "s" },
];

export default function EquipementsPage() {
  const { ep, can, refreshAlerts } = useSession();
  const { data, error, loading, reload } = useApi<{ data: Equipment[] }>(ep("/equipments"));
  const items = useMemo(() => data?.data ?? [], [data]);
  const canWrite = can("equipements", "write");
  const [filter, setFilter] = useState<"all" | EquipmentType>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const visible = useMemo(
    () =>
      items.filter(
        (e) =>
          (filter === "all" || e.type === filter) &&
          e.name.toLowerCase().includes(query.toLowerCase())
      ),
    [items, filter, query]
  );

  return (
    <>
      <Topbar title="Équipements" subtitle={`${items.length} équipements surveillés`} />
      <main className="mx-auto w-full max-w-[1400px] space-y-6 p-4 md:p-8 xl:p-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="relative md:max-w-xs md:flex-1">
            <Search size={16} strokeWidth={1.5} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un équipement"
              className="min-h-12 w-full rounded-xl border border-ivory-300 bg-white pl-11 pr-4 text-sm outline-none transition placeholder:text-ink-400 focus:border-gold-400 focus:ring-2 focus:ring-gold-400/30"
            />
          </div>
          {canWrite && (
            <Button onClick={() => setOpen(true)}>
              <Plus size={16} strokeWidth={1.75} /> Ajouter un équipement
            </Button>
          )}
        </div>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`min-h-11 shrink-0 rounded-full border px-4 text-sm transition ${
                filter === f.key
                  ? "border-ink-900 bg-ink-900 text-gold-300"
                  : "border-ivory-300 bg-white text-ink-700 hover:border-gold-400"
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
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ivory-300 bg-white/60 px-6 py-16 text-center">
            <p className="font-display text-2xl font-semibold">Aucun équipement trouvé</p>
            <p className="mt-2 text-sm text-ink-500">Modifiez votre recherche ou ajoutez un équipement.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((e) => (
              <Link key={e.id} href={`/equipements/${e.id}`} className="block">
                <EquipmentCard equipment={e} />
              </Link>
            ))}
          </div>
        )}
      </main>

      <EquipmentForm
        open={open}
        onClose={() => setOpen(false)}
        onSaved={() => {
          reload();
          refreshAlerts();
        }}
      />
    </>
  );
}