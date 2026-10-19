import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary";

const variants: Record<Variant, string> = {
  primary:
    "bg-gold-gradient text-ink-950 shadow-[0_1px_0_rgba(255,255,255,0.45)_inset,0_8px_20px_-8px_rgba(151,118,40,0.6)] hover:brightness-105 active:brightness-95",
  secondary:
    "border border-ink-900/80 text-ink-900 hover:bg-ink-900 hover:text-ivory-100",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-medium tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}