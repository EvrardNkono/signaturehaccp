"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Lock, Menu } from "lucide-react";
import { Sidebar } from "./sidebar";
import { nav, mobileTabs } from "./nav";
import { Card } from "@/components/ui/card";
import { useSession } from "@/lib/session";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { status, can, alerts, est } = useSession();

  useEffect(() => {
    if (status === "anonymous") router.replace(`/connexion?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  if (status !== "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ivory-50 text-ink-500" role="status">
        <Loader2 className="mr-3 animate-spin" size={20} /> Chargement…
      </div>
    );
  }

  const visibleNav = nav.filter((n) => can(n.module));
  const tabs = visibleNav.filter((n) => mobileTabs.includes(n.href));
  const current = nav.find((n) => pathname.startsWith(n.href));
  const forbidden = current ? !can(current.module) : false;

  return (
    <div className="flex min-h-screen">
      <Sidebar open={open} onClose={() => setOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col pb-24 lg:pb-0">
        {forbidden ? (
          <main className="mx-auto w-full max-w-xl p-8">
            <Card className="flex flex-col items-center gap-3 p-10 text-center">
              <Lock size={24} className="text-ink-400" />
              <p className="font-display text-2xl font-semibold">Accès non autorisé</p>
              <p className="text-sm text-ink-500">Votre rôle ne donne pas accès à cette page.</p>
              <Link href="/dashboard" className="text-sm text-gold-600 hover:text-gold-500">
                Retour au tableau de bord
              </Link>
            </Card>
          </main>
        ) : !est ? (
          <main className="mx-auto w-full max-w-xl p-8">
            <Card className="p-10 text-center text-sm text-ink-500">
              Aucun établissement n&apos;est associé à votre compte. Contactez un administrateur.
            </Card>
          </main>
        ) : (
          children
        )}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-gold-500/20 bg-ink-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <ul className="mx-auto grid max-w-xl grid-cols-5">
          {tabs.map((t) => {
            const active = pathname.startsWith(t.href);
            const count = t.module === "alertes" ? alerts.open : 0;
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  className={`relative flex flex-col items-center gap-1 py-3 text-[10px] ${
                    active ? "text-gold-300" : "text-ink-400"
                  }`}
                >
                  <span className="relative">
                    <t.icon size={22} strokeWidth={1.5} />
                    {count ? (
                      <span className="absolute -right-2 -top-1.5 rounded-full bg-status-critical px-1.5 text-[9px] font-medium text-white">
                        {count}
                      </span>
                    ) : null}
                  </span>
                  {t.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              onClick={() => setOpen(true)}
              className="flex w-full flex-col items-center gap-1 py-3 text-[10px] text-ink-400"
            >
              <Menu size={22} strokeWidth={1.5} />
              Menu
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}
