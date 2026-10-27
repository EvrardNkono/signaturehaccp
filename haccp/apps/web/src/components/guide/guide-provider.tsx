"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { buildSteps, type GuideApi, type GuideState, type GuideStep } from "@/lib/guide";

type GuideContextValue = {
  /** Progression de l'utilisateur ; null tant qu'elle n'est pas chargée. */
  state: GuideState | null;
  steps: GuideStep[];
  running: boolean;
  index: number;
  current: GuideStep | null;
  menuOpen: boolean;
  openMenu: () => void;
  closeMenu: () => void;
  /** Lance la visite, éventuellement à partir d'une étape précise. */
  start: (stepId?: string) => void;
  next: () => void;
  prev: () => void;
  goTo: (index: number) => void;
  /** Ferme la visite sans la terminer (elle ne se relancera plus seule). */
  close: () => void;
  /** Recommence depuis le début en effaçant la progression. */
  restart: () => Promise<void>;
  setChecklistHidden: (hidden: boolean) => void;
};

const noop = () => undefined;
const fallback: GuideContextValue = {
  state: null,
  steps: [],
  running: false,
  index: 0,
  current: null,
  menuOpen: false,
  openMenu: noop,
  closeMenu: noop,
  start: noop,
  next: noop,
  prev: noop,
  goTo: noop,
  close: noop,
  restart: async () => undefined,
  setChecklistHidden: noop,
};

const GuideContext = createContext<GuideContextValue>(fallback);

const pick = (g: GuideApi): GuideState => ({ status: g.status, seenSteps: g.seenSteps, checklistHidden: g.checklistHidden });

export function GuideProvider({ children }: { children: ReactNode }) {
  const { status: sessionStatus, user, can } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const userId = user?.id ?? null;

  const [state, setState] = useState<GuideState | null>(null);
  const [running, setRunning] = useState(false);
  const [index, setIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  const autoStarted = useRef(false);
  const stateRef = useRef<GuideState | null>(null);
  stateRef.current = state;
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const steps = useMemo(() => buildSteps(can), [can]);
  const current = running ? (steps[index] ?? null) : null;
  const currentId = current?.id ?? null;
  const currentHref = current?.href ?? null;

  // Chargement de la progression (propre à l'utilisateur connecté).
  useEffect(() => {
    if (sessionStatus !== "authenticated" || !userId) {
      setState(null);
      setRunning(false);
      setMenuOpen(false);
      autoStarted.current = false;
      return;
    }
    let cancelled = false;
    api<GuideApi>("/me/guide")
      .then((g) => {
        if (!cancelled) setState(pick(g));
      })
      .catch(() => undefined); // le guide est facultatif : une erreur ne doit jamais gêner l'application
    return () => {
      cancelled = true;
    };
  }, [sessionStatus, userId]);

  // Lancement automatique, une seule fois, à la toute première connexion.
  useEffect(() => {
    if (!state || autoStarted.current || steps.length === 0) return;
    autoStarted.current = true;
    if (state.status === "active" && state.seenSteps.length === 0) {
      setIndex(0);
      setRunning(true);
    }
  }, [state, steps.length]);

  const save = useCallback((patch: Partial<GuideState>) => {
    setState((prev) => (prev ? { ...prev, ...patch } : prev));
    api("/me/guide", { method: "PUT", body: patch }).catch(() => undefined);
  }, []);

  // Une étape est « vue » dès qu'elle s'affiche.
  useEffect(() => {
    if (!currentId) return;
    const seen = stateRef.current?.seenSteps ?? [];
    if (!seen.includes(currentId)) save({ seenSteps: [...seen, currentId] });
  }, [currentId, save]);

  // Ouvre la page présentée par l'étape en cours.
  useEffect(() => {
    if (!currentHref) return;
    const p = pathnameRef.current;
    if (p !== currentHref && !p.startsWith(`${currentHref}/`)) router.push(currentHref);
  }, [currentHref, router]);

  const close = useCallback(() => {
    setRunning(false);
    if (stateRef.current && stateRef.current.status !== "completed") save({ status: "dismissed" });
  }, [save]);

  const finish = useCallback(() => {
    setRunning(false);
    save({ status: "completed" });
  }, [save]);

  const start = useCallback(
    (stepId?: string) => {
      const i = stepId ? steps.findIndex((s) => s.id === stepId) : 0;
      setMenuOpen(false);
      setIndex(i >= 0 ? i : 0);
      setRunning(true);
    },
    [steps]
  );

  const next = useCallback(() => {
    if (index >= steps.length - 1) finish();
    else setIndex(index + 1);
  }, [index, steps.length, finish]);

  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const goTo = useCallback((i: number) => setIndex(Math.min(Math.max(0, i), Math.max(0, steps.length - 1))), [steps.length]);

  const restart = useCallback(async () => {
    try {
      setState(pick(await api<GuideApi>("/me/guide/reset", { method: "POST" })));
    } catch {
      /* on relance quand même l'affichage de la visite */
    }
    setMenuOpen(false);
    setIndex(0);
    setRunning(true);
  }, []);

  const setChecklistHidden = useCallback((hidden: boolean) => save({ checklistHidden: hidden }), [save]);
  const openMenu = useCallback(() => {
    setRunning(false);
    setMenuOpen(true);
  }, []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const value = useMemo<GuideContextValue>(
    () => ({ state, steps, running, index, current, menuOpen, openMenu, closeMenu, start, next, prev, goTo, close, restart, setChecklistHidden }),
    [state, steps, running, index, current, menuOpen, openMenu, closeMenu, start, next, prev, goTo, close, restart, setChecklistHidden]
  );

  return <GuideContext.Provider value={value}>{children}</GuideContext.Provider>;
}

export function useGuide(): GuideContextValue {
  return useContext(GuideContext);
}
