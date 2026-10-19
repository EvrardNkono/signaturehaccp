export function ScoreRing({ value }: { value: number }) {
    const r = 54;
    const c = 2 * Math.PI * r;
    return (
      <div className="relative h-32 w-32 shrink-0 sm:h-36 sm:w-36">
        <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
          <defs>
            <linearGradient id="gold-ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#E0C98F" />
              <stop offset="100%" stopColor="#B8923F" />
            </linearGradient>
          </defs>
          <circle cx="64" cy="64" r={r} fill="none" strokeWidth="6" className="stroke-ink-700" />
          <circle
            cx="64" cy="64" r={r} fill="none" strokeWidth="6" strokeLinecap="round"
            stroke="url(#gold-ring)"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - value / 100)}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-display text-4xl font-semibold">{value}<span className="text-xl text-gold-400">%</span></span>
        </div>
      </div>
    );
  }