"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";

type Query = Record<string, string | number | boolean | undefined | null>;

/**
 * Charge une ressource GET. `path = null` met la requête en attente (ex. établissement pas encore connu).
 * `reload()` relance sans afficher l'état de chargement (rafraîchissement discret après une action).
 */
export function useApi<T>(path: string | null, query?: Query) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);
  const seq = useRef(0);
  const key = path === null ? null : `${path}?${JSON.stringify(query ?? {})}`;
  const queryRef = useRef(query);
  queryRef.current = query;

  const load = useCallback(
    async (silent: boolean) => {
      if (path === null) return;
      const id = ++seq.current;
      if (!silent) setLoading(true);
      try {
        const res = await api<T>(path, { query: queryRef.current });
        if (id !== seq.current) return;
        setData(res);
        setError(null);
      } catch (err) {
        if (id !== seq.current) return;
        setError(errorMessage(err));
      } finally {
        if (id === seq.current) setLoading(false);
      }
    },
    [path]
  );

  useEffect(() => {
    if (key === null) return;
    const counter = seq;
    load(false);
    return () => {
      counter.current++; // invalide la requête en cours si le chemin change ou si la page se ferme
    };
  }, [key, load]);

  const reload = useCallback(() => load(true), [load]);
  return { data, setData, error, loading, reload };
}
