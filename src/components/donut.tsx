"use client";

import { useState } from "react";
import { centerMoney, formatMoney } from "@/lib/money";

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

const SIZE = 156;
const OUTER = 76;
const INNER = 50;
/** Vão entre fatias, em px, medido na borda. */
const GAP = 2;
/** Traço da mesma cor que arredonda os cantos (e engorda a fatia em STROKE/2). */
const STROKE = 3;

function point(r: number, angle: number) {
  return [SIZE / 2 + r * Math.sin(angle), SIZE / 2 - r * Math.cos(angle)].map((n) => n.toFixed(2)).join(" ");
}

/** Fatia de anel entre dois ângulos (radianos, a partir do topo, sentido horário). */
function slicePath(a0: number, a1: number): string | null {
  const pad = GAP + STROKE;
  const ro = OUTER - STROKE / 2;
  const ri = INNER + STROKE / 2;
  // vão de largura constante: o recuo em ângulo é maior no raio interno
  const o0 = a0 + pad / 2 / ro;
  const o1 = a1 - pad / 2 / ro;
  const i0 = a0 + pad / 2 / ri;
  const i1 = a1 - pad / 2 / ri;
  if (i1 <= i0) {
    // fatia fina demais para o vão: vira um traço radial
    const mid = (a0 + a1) / 2;
    return `M ${point(ri, mid)} L ${point(ro, mid)}`;
  }
  const large = o1 - o0 > Math.PI ? 1 : 0;
  const largeIn = i1 - i0 > Math.PI ? 1 : 0;
  return [
    `M ${point(ro, o0)}`,
    `A ${ro} ${ro} 0 ${large} 1 ${point(ro, o1)}`,
    `L ${point(ri, i1)}`,
    `A ${ri} ${ri} 0 ${largeIn} 0 ${point(ri, i0)}`,
    "Z",
  ].join(" ");
}

/** Cores quase pretas somem no tema escuro; usa um cinza no lugar. */
function visible(color: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.03 ? "var(--series-other)" : color;
}

/**
 * Gráfico de rosca com legenda. Tocar numa fatia ou na legenda mostra o
 * valor no centro e avisa onSelect (quando informado).
 */
export function Donut({
  slices,
  label,
  legendCount = 4,
  selected,
  onSelect,
}: {
  slices: DonutSlice[];
  /** Nome do conjunto, para leitores de tela. */
  label: string;
  legendCount?: number;
  selected?: string | null;
  onSelect?: (key: string | null) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const data = slices.filter((s) => s.value > 0);
  const total = data.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return null;

  const active = hover ?? selected ?? null;
  const current = data.find((s) => s.key === active) ?? null;
  const toggle = (key: string) => onSelect?.(selected === key ? null : key);

  let angle = 0;
  const arcs = data.map((s) => {
    const a0 = angle;
    angle += (s.value / total) * Math.PI * 2;
    return { ...s, a0, a1: angle };
  });

  // legenda sempre pelos maiores valores, mesmo que as fatias venham agrupadas
  const legend = [...data].sort((a, b) => b.value - a.value).slice(0, legendCount);
  const rest = data.length - legend.length;
  const pct = (v: number) => {
    const p = (v / total) * 100;
    return p > 0 && p < 1 ? "<1%" : `${Math.round(p)}%`;
  };

  return (
    <div className="flex items-center gap-3 min-[400px]:gap-4">
      <div className="relative size-[132px] shrink-0 min-[400px]:size-[156px]">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full" role="group" aria-label={label}>
          {data.length === 1 ? (
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={(OUTER + INNER) / 2}
              fill="none"
              style={{ stroke: visible(data[0].color) }}
              strokeWidth={OUTER - INNER}
            />
          ) : (
            arcs.map((a) => {
              const d = slicePath(a.a0, a.a1);
              if (!d) return null;
              const color = visible(a.color);
              const dim = active != null && active !== a.key;
              return (
                <path
                  key={a.key}
                  d={d}
                  style={{ fill: color, stroke: color }}
                  strokeWidth={STROKE}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  opacity={dim ? 0.3 : 1}
                  className="cursor-pointer outline-none transition-opacity"
                  role="button"
                  tabIndex={0}
                  aria-label={`${a.label}: ${formatMoney(a.value)}, ${pct(a.value)}`}
                  aria-pressed={selected === a.key}
                  onPointerEnter={(e) => e.pointerType === "mouse" && setHover(a.key)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(a.key)}
                  onBlur={() => setHover(null)}
                  onClick={() => toggle(a.key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggle(a.key);
                    }
                  }}
                />
              );
            })
          )}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-7 text-center" aria-live="polite">
          {current ? (
            <>
              <span className="line-clamp-2 text-[11px] leading-tight text-ink-2">{current.label}</span>
              <span className="num text-[13px] font-bold min-[400px]:text-sm">{centerMoney(current.value)}</span>
              <span className="num text-[11px] text-muted">{pct(current.value)}</span>
            </>
          ) : (
            <>
              <span className="text-[11px] text-muted">Total</span>
              <span className="num text-[13px] font-bold min-[400px]:text-sm">{centerMoney(total)}</span>
            </>
          )}
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-0.5 text-sm">
        {legend.map((s) => (
          <li key={s.key}>
            <button
              type="button"
              onClick={() => toggle(s.key)}
              aria-pressed={selected === s.key}
              className="-mx-1.5 flex min-h-9 w-[calc(100%+0.75rem)] items-center gap-2 rounded-lg px-1.5 text-left hover:bg-surface-2 aria-pressed:bg-surface-2"
            >
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: visible(s.color) }} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{s.label}</span>
              <span className="num shrink-0 text-ink-2">{pct(s.value)}</span>
            </button>
          </li>
        ))}
        {rest > 0 ? <li className="px-0 pt-1 text-xs text-muted">{rest === 1 ? "+ 1 outra" : `+ ${rest} outras`}</li> : null}
      </ul>
    </div>
  );
}
