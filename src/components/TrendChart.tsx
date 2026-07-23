"use client";

import { useMemo, useRef, useState } from "react";
import { fmtDay, fmtHours } from "./format";

export interface TrendPoint {
  weekStart: string;
  aht: number | null; // null = no denominator that week → gap in the line
  hours: number;
  count: number; // approved (writer) or reviewed (reviewer)
}

const W = 640;
const H = 200;
const PAD = { top: 16, right: 16, bottom: 26, left: 40 };

function niceMax(v: number): number {
  if (v <= 1) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (v <= m * pow) return m * pow;
  }
  return 10 * pow;
}

/** Weekly AHT line: single series (slot-1 blue), hairline target reference,
 *  crosshair + tooltip. No legend — the card title names the series. */
export function TrendChart({
  points,
  target,
  countLabel,
}: {
  points: TrendPoint[];
  target: number;
  countLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const { xs, yOf, yMax, ticks, segments } = useMemo(() => {
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const n = points.length;
    const xs = points.map((_, i) => PAD.left + (n <= 1 ? innerW / 2 : (i * innerW) / (n - 1)));
    const dataMax = Math.max(target * 1.3, ...points.map((p) => p.aht ?? 0));
    const yMax = niceMax(dataMax);
    const yOf = (v: number) => PAD.top + innerH - (v / yMax) * innerH;
    const tickCount = 4;
    const ticks = Array.from({ length: tickCount + 1 }, (_, i) => (yMax / tickCount) * i);
    // split into contiguous non-null runs so zero-weeks read as gaps
    const segments: number[][] = [];
    let run: number[] = [];
    points.forEach((p, i) => {
      if (p.aht === null) {
        if (run.length) segments.push(run);
        run = [];
      } else run.push(i);
    });
    if (run.length) segments.push(run);
    return { xs, yOf, yMax, ticks, segments };
  }, [points, target]);

  if (points.length === 0 || points.every((p) => p.aht === null)) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted">
        Not enough data for a trend yet
      </div>
    );
  }

  function onMove(e: React.PointerEvent) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    for (let i = 1; i < xs.length; i++) {
      if (Math.abs(xs[i] - x) < Math.abs(xs[best] - x)) best = i;
    }
    setHover(best);
  }

  const hp = hover !== null ? points[hover] : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`Weekly AHT trend, target ${target} hours`}
      >
        {/* gridlines + ticks */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={yOf(t)}
              y2={yOf(t)}
              stroke="var(--grid)"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 6}
              y={yOf(t) + 3}
              textAnchor="end"
              fontSize={10}
              fill="var(--muted)"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {t}
            </text>
          </g>
        ))}
        {/* target reference */}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={yOf(target)}
          y2={yOf(target)}
          stroke="var(--baseline)"
          strokeWidth={1}
        />
        <text
          x={W - PAD.right}
          y={yOf(target) - 4}
          textAnchor="end"
          fontSize={10}
          fill="var(--ink-2)"
        >
          target {Number(target.toFixed(2))}
        </text>
        {/* x labels: first, last, and every ~4th */}
        {points.map((p, i) => {
          const every = Math.max(1, Math.ceil(points.length / 6));
          if (i % every !== 0 && i !== points.length - 1) return null;
          return (
            <text
              key={p.weekStart}
              x={xs[i]}
              y={H - 8}
              textAnchor="middle"
              fontSize={10}
              fill="var(--muted)"
            >
              {fmtDay(p.weekStart)}
            </text>
          );
        })}
        {/* crosshair */}
        {hover !== null && (
          <line
            x1={xs[hover]}
            x2={xs[hover]}
            y1={PAD.top}
            y2={H - PAD.bottom}
            stroke="var(--baseline)"
            strokeWidth={1}
          />
        )}
        {/* line segments (gaps where aht is null) */}
        {segments.map((seg, si) => (
          <polyline
            key={si}
            points={seg.map((i) => `${xs[i]},${yOf(points[i].aht!)}`).join(" ")}
            fill="none"
            stroke="var(--series-1)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {/* markers: isolated points always; otherwise hovered + last */}
        {points.map((p, i) => {
          if (p.aht === null) return null;
          const isolated = segments.some((s) => s.length === 1 && s[0] === i);
          const lastIdx = [...points.keys()].filter((i2) => points[i2].aht !== null).pop();
          if (!isolated && hover !== i && i !== lastIdx) return null;
          return (
            <circle
              key={p.weekStart}
              cx={xs[i]}
              cy={yOf(p.aht)}
              r={4}
              fill="var(--series-1)"
              stroke="var(--surface)"
              strokeWidth={2}
            />
          );
        })}
      </svg>
      {/* tooltip */}
      {hp && hover !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-lg border border-borderc bg-surface px-3 py-2 text-xs shadow-md"
          style={{
            left: `${Math.min(85, Math.max(2, (xs[hover] / W) * 100))}%`,
            transform: xs[hover] > W * 0.7 ? "translateX(-100%)" : undefined,
          }}
        >
          <div className="font-medium text-ink-2">Week of {fmtDay(hp.weekStart)}</div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3 rounded bg-series-1" aria-hidden />
            <span className="font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
              {fmtHours(hp.aht)} hrs
            </span>
            <span className="text-muted">AHT</span>
          </div>
          <div className="mt-0.5 text-muted" style={{ fontVariantNumeric: "tabular-nums" }}>
            {hp.hours.toFixed(1)} hrs · {hp.count} {countLabel}
          </div>
        </div>
      )}
    </div>
  );
}
