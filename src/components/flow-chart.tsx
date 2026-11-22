"use client";

import { useState } from "react";
import { monthLabel, shortMonth } from "@/lib/dates";
import { niceMax, type MonthFlow } from "@/lib/investments";
import { formatMoney } from "@/lib/money";

const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const HEIGHT = 150;

/** Barras agrupadas de aportes e resgates por mês. Tocar num mês mostra os valores. */
export function FlowChart({ flows }: { flows: MonthFlow[] }) {
  const [active, setActive] = useState<string | null>(null);
  const max = niceMax(Math.max(0, ...flows.flatMap((f) => [f.aportes, f.resgates])));
  // topo, meio e base do eixo
  const ticks = [max, max / 2, 0].map((value, i) => ({ value, top: (i / 2) * HEIGHT }));
  const current = flows.find((f) => f.month === active) ?? null;
  const h = (v: number) => (v > 0 ? Math.max(3, (v / max) * HEIGHT) : 0);

  return (
    <div>
      <p className="mb-3 min-h-10 text-sm text-ink-2" aria-live="polite">
        {current ? (
          <>
            <span className="font-semibold text-ink">{monthLabel(current.month)}</span>
            <br />
            Aportes <strong className="num text-ink">{formatMoney(current.aportes)}</strong> · Resgates{" "}
            <strong className="num text-ink">{formatMoney(current.resgates)}</strong>
          </>
        ) : (
          <span className="text-muted">Toque num mês para ver os valores.</span>
        )}
      </p>
      <div className="flex">
        <div className="relative w-10 shrink-0 text-[11px] text-muted" style={{ height: HEIGHT }} aria-hidden>
          {ticks.map((t) => (
            <span key={t.top} className="num absolute right-2 -translate-y-1/2" style={{ top: t.top }}>
              {compact.format(t.value)}
            </span>
          ))}
        </div>
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: HEIGHT }} aria-hidden>
            {ticks.map((t) => (
              <span key={t.top} className="absolute inset-x-0 border-t border-dashed border-line" style={{ top: t.top }} />
            ))}
          </div>
          <div className="relative flex">
            {flows.map((f) => {
              const on = active === f.month;
              return (
                <button
                  key={f.month}
                  type="button"
                  onClick={() => setActive(on ? null : f.month)}
                  onPointerEnter={(e) => e.pointerType === "mouse" && setActive(f.month)}
                  aria-pressed={on}
                  aria-label={`${monthLabel(f.month)}: aportes ${formatMoney(f.aportes)}, resgates ${formatMoney(f.resgates)}`}
                  className={`flex flex-1 flex-col items-center rounded-lg ${on ? "bg-surface-2" : ""}`}
                >
                  <span className="flex items-end gap-0.5" style={{ height: HEIGHT }}>
                    <span className="w-3 rounded-t bg-brand sm:w-4" style={{ height: h(f.aportes) }} />
                    <span className="w-3 rounded-t bg-expense sm:w-4" style={{ height: h(f.resgates) }} />
                  </span>
                  <span className={`py-1.5 text-xs ${on ? "font-semibold text-ink" : "text-muted"}`}>{shortMonth(f.month)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
