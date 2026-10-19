/** Date/heure locales d'un fuseau IANA, sans dépendance externe. */
export function nowInTz(timeZone: string, at: Date = new Date()) {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    }).formatToParts(at);
  } catch {
    return nowInTz("Europe/Paris", at);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  const weekday = get("weekday"); // Mon, Tue, ... Sun
  return { date, minutes, weekday, isSunday: weekday === "Sun" };
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Clé de semaine ISO "YYYY-Www" pour une date "YYYY-MM-DD". */
export function isoWeekKey(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const dayNum = (d.getUTCDay() + 6) % 7; // lundi = 0
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // jeudi de la semaine
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export const isHHMM = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/** Début (inclus) et fin (exclue) d'une journée locale "YYYY-MM-DD" dans un fuseau IANA, exprimés en UTC. */
export function dayBounds(timeZone: string, day: string): { start: Date; end: Date } {
  const utcMid = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
  const local = nowInTz(timeZone, new Date(utcMid));
  const diffDays = Math.round((Date.parse(`${local.date}T00:00:00Z`) - utcMid) / 86_400_000);
  const offsetMin = diffDays * 1440 + local.minutes; // décalage local - UTC à minuit UTC
  const start = new Date(utcMid - offsetMin * 60_000);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}
