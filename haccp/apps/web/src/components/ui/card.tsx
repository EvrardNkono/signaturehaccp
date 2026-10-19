import type { HTMLAttributes } from "react";

export function Card({
  tone = "light",
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: "light" | "dark" }) {
  const t =
    tone === "dark"
      ? "border-gold-500/20 bg-ink-900 bg-ink-glow text-ivory-100 shadow-lux"
      : "border-ivory-300/70 bg-white shadow-card";
  return <div className={`relative rounded-2xl border p-5 md:p-6 ${t} ${className}`} {...props} />;
}