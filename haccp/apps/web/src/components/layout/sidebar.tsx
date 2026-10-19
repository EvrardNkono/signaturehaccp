"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { nav } from "./nav";
import { fullName, useSession } from "@/lib/session";

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, company, est, establishments, setEstablishmentId, can, alerts, logout } = useSession();
  const items = nav.filter((n) => can(n.module));

  const signOut = async () => {
    await logout();
    router.replace("/connexion");
  };

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-ink-950/70 backdrop-blur-sm lg:hidden" onClick={onClose} />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-ink-900 bg-ink-glow text-ivory-100 transition-transform duration-300 lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:translate-x-0 xl:w-72 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between px-8 pb-6 pt-10">
          <div>
            <Image
              src="/logohaccp.webp"
              alt="Signature HACCP"
              width={160}
              height={48}
              priority
              className="h-12 w-auto"
            />
            <div className="mt-5 h-px w-14 bg-gold-gradient" />
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer le menu"
            className="flex h-10 w-10 items-center justify-center rounded-full text-ink-400 hover:text-ivory-100 lg:hidden"
          >
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-2">
          {items.map((item) => {
            const active = pathname.startsWith(item.href);
            const count = item.module === "alertes" ? alerts.open : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`relative flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${
                  active
                    ? "bg-white/5 text-gold-300"
                    : "text-ink-400 hover:bg-white/5 hover:text-ivory-100"
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-gold-400" />
                )}
                <item.icon size={18} strokeWidth={1.5} />
                <span className="flex-1">{item.label}</span>
                {count ? (
                  <span className="rounded-full bg-status-critical px-2 py-0.5 text-[10px] font-medium text-white">
                    {count}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        {establishments.length > 1 && (
          <div className="mx-4 mb-2">
            <label className="block text-[11px] uppercase tracking-[0.2em] text-ink-400">
              Établissement
              <select
                value={est?.id ?? ""}
                onChange={(e) => setEstablishmentId(e.target.value)}
                className="mt-1 min-h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm normal-case tracking-normal text-ivory-100 outline-none"
              >
                {establishments.map((e) => (
                  <option key={e.id} value={e.id} className="text-ink-900">
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="m-4 flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-gradient font-display text-lg font-semibold text-ink-950">
            {(user?.firstName?.[0] ?? "?").toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{user ? fullName(user) : ""}</p>
            <p className="truncate text-xs text-ink-400">{est?.name ?? company?.name ?? ""}</p>
          </div>
          <button
            onClick={signOut}
            aria-label="Se déconnecter"
            title="Se déconnecter"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-400 transition hover:bg-white/5 hover:text-ivory-100"
          >
            <LogOut size={18} strokeWidth={1.5} />
          </button>
        </div>
      </aside>
    </>
  );
}