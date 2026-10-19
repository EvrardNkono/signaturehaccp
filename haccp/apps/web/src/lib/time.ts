// Affichage des dates ISO renvoyées par l'API.

export function timeAgo(iso?: string | null, now: Date = new Date()): string {
  if (!iso) return "aucun relevé";
  const diff = Math.max(0, now.getTime() - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}

export function hhmm(iso?: string | null, tz?: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(iso));
}

export function dateTime(iso?: string | null, tz?: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: tz }).format(new Date(iso));
}

/** "YYYY-MM-DD" du jour dans un fuseau donné. */
export function todayIn(tz?: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return parts; // en-CA => AAAA-MM-JJ
}

export function longDate(tz?: string, now: Date = new Date()): string {
  const s = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(now);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "il y a 3 j" / "Aujourd'hui 09:12" pour la dernière connexion. */
export function lastSeen(iso?: string | null, tz?: string): string {
  if (!iso) return "Jamais connecté";
  const d = new Date(iso);
  const today = todayIn(tz);
  const yesterday = todayIn(tz, new Date(Date.now() - 86_400_000));
  const day = todayIn(tz, d);
  if (day === today) return `Aujourd'hui ${hhmm(iso, tz)}`;
  if (day === yesterday) return `Hier ${hhmm(iso, tz)}`;
  return dateTime(iso, tz);
}
