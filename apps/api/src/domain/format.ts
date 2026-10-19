export function formatTemp(t: number | null | undefined): string {
  if (t === null || t === undefined) return "--";
  const s = t.toFixed(1).replace(".", ",");
  return `${t > 0 ? "+" : ""}${s}°C`;
}

export function formatRange(min: number, max: number): string {
  const f = (n: number) => `${n > 0 ? "+" : ""}${n}`;
  return `${f(min)} à ${f(max)}°C`;
}

export function formatPolar(n: number): string {
  return `${n.toFixed(1).replace(".", ",")} %`;
}
