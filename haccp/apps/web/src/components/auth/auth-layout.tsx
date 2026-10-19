import Image from "next/image";
import type { ReactNode } from "react";

export const authInputClass =
  "min-h-12 w-full rounded-xl border border-ivory-300 bg-white px-4 text-sm outline-none transition placeholder:text-ink-400 focus:border-gold-400 focus:ring-2 focus:ring-gold-400/30";

/** Mise en page commune aux écrans d'accès : panneau de marque + formulaire. */
export function AuthLayout({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Panneau de marque : compact sur mobile, pleine hauteur sur grand écran */}
      <aside className="flex items-center gap-4 bg-ink-900 bg-ink-glow px-5 py-5 text-ivory-100 sm:gap-6 sm:px-10 sm:py-7 lg:flex-col lg:items-start lg:justify-between lg:gap-10 lg:px-16 lg:py-14">
        <div className="shrink-0 lg:w-full">
          <Image
            src="/logohaccp.webp"
            alt="Signature HACCP"
            width={120}
            height={120}
            priority
            className="h-14 w-14 object-contain sm:h-16 sm:w-16 lg:h-24 lg:w-24"
          />
          <div className="mt-4 hidden h-px w-16 bg-gold-gradient lg:block" />
        </div>

        <h2 className="max-w-md border-l border-gold-500/40 pl-4 font-display text-xl font-semibold leading-snug sm:pl-6 sm:text-2xl lg:border-l-0 lg:pl-0 lg:text-5xl lg:leading-tight">
          La conformité sanitaire, avec{" "}
          <span className="bg-gold-gradient bg-clip-text text-transparent">élégance</span> et{" "}
          <span className="bg-gold-gradient bg-clip-text text-transparent">rigueur</span>.
        </h2>

        <p className="hidden text-xs text-ink-500 lg:block">© 2026 Lahotte Sarl</p>
      </aside>

      <main className="flex items-start justify-center px-5 py-8 sm:px-10 sm:py-12 lg:items-center">
        <div className="w-full max-w-sm animate-fade-up">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-1 text-3xl font-semibold sm:text-4xl">{title}</h1>
          <div className="ornament mt-3 sm:mt-4" />
          {children}
        </div>
      </main>
    </div>
  );
}
