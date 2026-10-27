"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { BookOpen, Check, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGuide } from "./guide-provider";
import { useSession } from "@/lib/session";

function useIsDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return desktop;
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

/** Visite guidée : met en avant la page dans le menu (ordinateur) ou s'affiche en bandeau (mobile). */
function TourStep() {
  const { steps, index, current, next, prev, goTo, close } = useGuide();
  const desktop = useIsDesktop();
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardH, setCardH] = useState(320);
  const cardRef = useRef<HTMLDivElement>(null);
  const stepId = current?.id;
  const target = current?.module;

  useLayoutEffect(() => {
    if (!desktop || !target) {
      setRect(null);
      return;
    }
    const find = () => document.querySelector<HTMLElement>(`[data-guide="${target}"]`);
    find()?.scrollIntoView({ block: "nearest" });
    const measure = () => setRect(find()?.getBoundingClientRect() ?? null);
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [desktop, target]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  }, [stepId, desktop]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, next, prev]);

  if (!current) return null;

  const first = index === 0;
  const last = index === steps.length - 1;
  const Icon = current.icon;

  let style: CSSProperties | undefined;
  if (desktop) {
    style = rect
      ? { left: rect.right + 20, top: clamp(rect.top + rect.height / 2 - cardH / 2, 16, window.innerHeight - cardH - 16) }
      : { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  }

  return (
    <>
      {desktop && (
        <>
          {/* Fond : bloque les clics pendant la visite ; la visite se quitte avec la croix ou Échap */}
          <div className={`fixed inset-0 z-[60] ${rect ? "" : "bg-ink-950/60"}`} aria-hidden="true" />
          {rect && (
            <div
              aria-hidden="true"
              className="pointer-events-none fixed z-[61] rounded-xl transition-all duration-300"
              style={{
                left: rect.left - 4,
                top: rect.top - 4,
                width: rect.width + 8,
                height: rect.height + 8,
                boxShadow: "0 0 0 9999px rgba(15,13,11,0.6), 0 0 0 2px #CDAE67",
              }}
            />
          )}
        </>
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-labelledby="guide-title"
        aria-describedby="guide-body"
        style={style}
        className="fixed inset-x-3 bottom-24 z-[70] max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border border-gold-500/30 bg-ink-900 bg-ink-glow p-5 text-ivory-100 shadow-lux animate-fade-up lg:bottom-auto lg:right-auto lg:w-[24rem] lg:max-h-[calc(100vh-2rem)] lg:p-6"
      >
        <button
          onClick={close}
          aria-label="Quitter la visite guidée"
          title="Quitter la visite"
          className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-ink-400 transition hover:bg-white/5 hover:text-ivory-100"
        >
          <X size={18} strokeWidth={1.5} />
        </button>

        <div className="flex items-center gap-3 pr-10">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-gradient text-ink-950">
            <Icon size={18} strokeWidth={1.75} />
          </span>
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-gold-300">
            {first ? "Visite guidée" : `Étape ${index} sur ${steps.length - 1}`}
          </p>
        </div>

        <h2 id="guide-title" className="mt-4 text-2xl font-semibold text-ivory-50">
          {current.title}
        </h2>
        <p id="guide-body" className="mt-2 text-sm leading-relaxed text-ivory-200">
          {current.body}
        </p>

        <ol className="mt-5 flex flex-wrap items-center gap-1.5" aria-label="Étapes de la visite">
          {steps.map((s, i) => (
            <li key={s.id}>
              <button
                onClick={() => goTo(i)}
                aria-label={`Aller à : ${s.title}`}
                aria-current={i === index ? "step" : undefined}
                title={s.title}
                className="flex h-6 w-4 items-center justify-center"
              >
                <span className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-gold-400" : "w-1.5 bg-white/25 hover:bg-white/50"}`} />
              </button>
            </li>
          ))}
        </ol>

        <div className="mt-5 flex items-center justify-between gap-3">
          {first ? (
            <button onClick={close} className="min-h-11 px-1 text-sm text-ink-400 transition hover:text-ivory-100">
              Plus tard
            </button>
          ) : (
            <button onClick={prev} className="min-h-11 px-1 text-sm text-ink-400 transition hover:text-ivory-100">
              Précédent
            </button>
          )}
          <Button key={current.id} autoFocus onClick={next}>
            {first ? "Commencer la visite" : last ? "Terminer" : "Suivant"}
          </Button>
        </div>
        {!first && !last && (
          <button onClick={close} className="mt-1 w-full min-h-9 text-center text-xs text-ink-400 transition hover:text-ivory-100">
            Quitter la visite
          </button>
        )}
      </div>
    </>
  );
}

/** Fenêtre « Guide d'utilisation » : reprendre la visite, sauter à une page précise, réafficher la checklist. */
function GuideMenu() {
  const { steps, state, start, restart, closeMenu, setChecklistHidden } = useGuide();
  const { can } = useSession();
  const seen = new Set(state?.seenSteps ?? []);
  const seenCount = steps.filter((s) => seen.has(s.id)).length;
  const firstUnseen = steps.find((s) => !seen.has(s.id));
  const canChecklist = can("parametres", "write");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeMenu();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeMenu]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink-950/60 p-3 backdrop-blur-sm sm:items-center" onClick={closeMenu}>
      <div
        role="dialog"
        aria-labelledby="guide-menu-title"
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-ivory-300/70 bg-white p-5 shadow-card animate-fade-up md:p-6"
      >
        <button
          onClick={closeMenu}
          aria-label="Fermer"
          className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-ink-500 transition hover:bg-ivory-100"
        >
          <X size={18} strokeWidth={1.5} />
        </button>

        <p className="eyebrow">Aide</p>
        <h2 id="guide-menu-title" className="mt-1 text-2xl font-semibold md:text-3xl">
          Guide d&apos;utilisation
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          {seenCount} page{seenCount > 1 ? "s" : ""} découverte{seenCount > 1 ? "s" : ""} sur {steps.length}. Choisissez une étape pour y aller directement.
        </p>

        <ul className="mt-4 divide-y divide-ivory-200 rounded-xl border border-ivory-300/70">
          {steps.map((s) => {
            const done = seen.has(s.id);
            return (
              <li key={s.id}>
                <button onClick={() => start(s.id)} className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left text-sm transition hover:bg-ivory-100">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                      done ? "border-status-ok bg-status-ok text-white" : "border-ivory-300 text-transparent"
                    }`}
                    aria-hidden="true"
                  >
                    <Check size={13} strokeWidth={2.5} />
                  </span>
                  <span className="flex-1">{s.title}</span>
                  <span className="sr-only">{done ? "déjà vue" : "pas encore vue"}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Button className="flex-1" onClick={() => start(firstUnseen?.id)}>
            <BookOpen size={16} strokeWidth={1.75} />
            {seenCount === 0 ? "Commencer la visite" : firstUnseen ? "Reprendre la visite" : "Revoir la visite"}
          </Button>
          <Button variant="secondary" className="flex-1" onClick={() => void restart()}>
            <RotateCcw size={16} strokeWidth={1.75} />
            Depuis le début
          </Button>
        </div>

        {canChecklist && (
          <button
            onClick={() => {
              setChecklistHidden(!state?.checklistHidden);
              closeMenu();
            }}
            className="mt-4 w-full min-h-10 text-center text-sm text-gold-600 transition hover:text-gold-500"
          >
            {state?.checklistHidden ? "Réafficher la checklist de démarrage" : "Masquer la checklist de démarrage"}
          </button>
        )}
      </div>
    </div>
  );
}

export function GuideTour() {
  const { running, current, menuOpen } = useGuide();
  return (
    <>
      {running && current && <TourStep />}
      {menuOpen && <GuideMenu />}
    </>
  );
}
