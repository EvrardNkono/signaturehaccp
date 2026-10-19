"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { fullName, roleLabelsFr, useSession } from "@/lib/session";

export function Topbar({ title, subtitle }: { title: string; subtitle?: string }) {
  const { user, alerts, can } = useSession();
  const initial = (user?.firstName?.[0] ?? "?").toUpperCase();

  return (
    <header className="sticky top-0 z-20 border-b border-ivory-300/60 bg-ivory-50/85 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur md:px-8 md:py-5 xl:px-10">
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold md:text-3xl">{title}</h1>
          {subtitle && <p className="truncate text-xs text-ink-500 md:text-sm">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3">
          {can("alertes") && (
            <Link
              href="/alertes"
              aria-label={`Alertes (${alerts.open} active${alerts.open > 1 ? "s" : ""})`}
              className="relative flex h-11 w-11 items-center justify-center rounded-full border border-ivory-300 bg-white text-ink-700 transition hover:border-gold-400"
            >
              <Bell size={18} strokeWidth={1.5} />
              {alerts.open > 0 && (
                <span
                  className={`absolute right-2.5 top-2.5 h-2 w-2 rounded-full ${
                    alerts.critical > 0 ? "bg-status-critical" : "bg-status-warn"
                  }`}
                />
              )}
            </Link>
          )}
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium">{user ? fullName(user) : ""}</p>
            <p className="text-xs text-ink-500">{user ? roleLabelsFr[user.role] : ""}</p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-ink-900 font-display text-lg text-gold-300 ring-1 ring-gold-500/40">
            {initial}
          </div>
        </div>
      </div>
    </header>
  );
}
