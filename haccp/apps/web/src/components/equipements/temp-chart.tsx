import type { Point } from "@/lib/equipements";

const W = 640;
const H = 260;
const PAD = { l: 48, r: 14, t: 14, b: 28 };

export function TempChart({
  points,
  min,
  max,
  className = "",
}: {
  points: Point[];
  min: number;
  max: number;
  className?: string;
}) {
  if (points.length < 2) return null;

  const values = points.map((p) => p.value);
  const lo = Math.min(...values, min) - 2;
  const hi = Math.max(...values, max) + 2;

  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (i / (points.length - 1)) * innerW;
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * innerH;
  const clampY = (v: number) => Math.min(Math.max(y(v), PAD.t), PAD.t + innerH);

  const bandTop = clampY(max);
  const bandBottom = clampY(min);

  const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");
  const last = points[points.length - 1];
  const labelIdx = [0, Math.floor((points.length - 1) / 2), points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`h-auto w-full ${className}`}
      role="img"
      aria-label="Courbe de température"
    >
      {/* Bande de plage autorisée */}
      <rect
        x={PAD.l}
        y={bandTop}
        width={innerW}
        height={Math.max(bandBottom - bandTop, 0)}
        fill="#3F7D5C"
        fillOpacity={0.1}
      />

      {/* Graduations */}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="#EEE7D8" />
          <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#857A6E">
            {t.toFixed(0)}°
          </text>
        </g>
      ))}

      {/* Seuil max */}
      <line
        x1={PAD.l}
        x2={W - PAD.r}
        y1={bandTop}
        y2={bandTop}
        stroke="#B3402F"
        strokeDasharray="5 4"
        strokeOpacity={0.6}
      />

      {/* Courbe */}
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={x(points.length - 1)} cy={y(last.value)} r={5} fill="currentColor" />

      {/* Étiquettes de temps */}
      {labelIdx.map((i) => (
        <text
          key={i}
          x={x(i)}
          y={H - 8}
          textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
          fontSize="11"
          fill="#857A6E"
        >
          {points[i].time}
        </text>
      ))}
    </svg>
  );
}