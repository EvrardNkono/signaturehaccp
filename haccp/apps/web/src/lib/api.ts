// Client HTTP de l'API Signature HACCP.
// - Cookies httpOnly (credentials: "include") : aucun jeton n'est manipulé côté navigateur.
// - Sur 401, tente UNE fois un rafraîchissement de session (rotation du jeton) puis rejoue la requête.

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  code: string;
  fields: Record<string, string>;
  details?: unknown;

  constructor(status: number, code: string, message: string, fields: Record<string, string> = {}, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.details = details;
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

export type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
};

function buildUrl(path: string, query?: Query): string {
  const url = `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return url;
  const qs = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  });
  const s = qs.toString();
  return s ? `${url}?${s}` : url;
}

async function toApiError(res: Response): Promise<ApiError> {
  let payload: { error?: { code?: string; message?: string; fields?: Record<string, string>; details?: unknown } } = {};
  try {
    payload = await res.json();
  } catch {
    /* corps vide ou non JSON */
  }
  const e = payload.error;
  return new ApiError(
    res.status,
    e?.code ?? "HTTP_ERROR",
    e?.message ?? `Erreur ${res.status}`,
    e?.fields ?? {},
    e?.details
  );
}

// Routes d'authentification où un 401 est une vraie réponse (identifiants faux, session absente...).
const NO_REFRESH = [
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/auth/logout",
  "/auth/forgot-password",
  "/auth/reset-password",
];

let refreshing: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch(buildUrl("/auth/refresh"), { method: "POST", credentials: "include" })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        // libère le verrou au prochain tick pour que les requêtes simultanées partagent le même résultat
        setTimeout(() => (refreshing = null), 0);
      });
  }
  return refreshing;
}

async function rawFetch(path: string, opts: RequestOptions): Promise<Response> {
  const isForm = typeof FormData !== "undefined" && opts.body instanceof FormData;
  const hasBody = opts.body !== undefined;
  const init: RequestInit = {
    method: opts.method ?? (hasBody ? "POST" : "GET"),
    credentials: "include",
    signal: opts.signal,
    headers: hasBody && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: hasBody ? (isForm ? (opts.body as FormData) : JSON.stringify(opts.body)) : undefined,
  };
  try {
    return await fetch(buildUrl(path, opts.query), init);
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError(0, "NETWORK_ERROR", "Impossible de joindre le serveur. Vérifiez votre connexion.");
  }
}

async function send(path: string, opts: RequestOptions): Promise<Response> {
  let res = await rawFetch(path, opts);
  const skipRefresh = NO_REFRESH.some((p) => path.startsWith(p));
  if (res.status === 401 && !skipRefresh) {
    if (await refreshSession()) res = await rawFetch(path, opts);
  }
  if (!res.ok) throw await toApiError(res);
  return res;
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await send(path, opts);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Télécharge un fichier protégé (export CSV / PDF) avec la session en cours. */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const res = await send(path, {});
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^";]+)"?/i.exec(cd);
  const name = match?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Message lisible pour l'utilisateur à partir d'une erreur quelconque. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const first = Object.values(err.fields)[0];
    return first && err.code === "VALIDATION_ERROR" ? first : err.message;
  }
  return err instanceof Error ? err.message : "Une erreur est survenue.";
}
