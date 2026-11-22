"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { NO_CATEGORY, NO_CATEGORY_COLOR, categoryItems, expensesByCategory } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { useData } from "./data-provider";
import { categorySlices, Donut, visible } from "./donut";
import { TransactionRow } from "./transaction-row";

const VISIBLE = 8;

/** Gastos por categoria do mês. Tocar numa categoria mostra o que entrou nela. */
export function CategoryBreakdown({ month }: { month: string }) {
  const { transactions, categories } = useData();
  const rows = useMemo(() => expensesByCategory(transactions, categories, month), [transactions, categories, month]);
  // guarda o mês junto para fechar a categoria aberta quando o mês muda
  const [open, setOpen] = useState<{ month: string; key: string } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const openKey = open?.month === month ? open.key : null;

  const items = useMemo(
    () => (openKey ? categoryItems(transactions, month, openKey) : []),
    [transactions, month, openKey],
  );

  if (rows.length === 0) {
    return <p className="py-4 text-center text-sm text-muted">Nenhum gasto neste mês.</p>;
  }

  const shown = showAll ? rows : rows.slice(0, VISIBLE);
  const max = rows[0].total;

  function select(key: string | null) {
    setOpen(key ? { month, key } : null);
    if (key && rows.findIndex((r) => r.key === key) >= VISIBLE) setShowAll(true);
  }

  return (
    <>
      <Donut
        label="Gastos por categoria"
        slices={categorySlices(rows)}
        selected={openKey}
        onSelect={select}
      />
      <p className="mb-2 mt-4 text-xs text-muted">Toque numa categoria para ver cada gasto.</p>
      <ul className="-mx-2 space-y-1">
        {shown.map((row) => {
          const expanded = row.key === openKey;
          const panelId = `categoria-${row.key}`;
          const name = row.category?.name ?? NO_CATEGORY;
          return (
            <li key={row.key}>
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => setOpen(expanded ? null : { month, key: row.key })}
                className="block w-full rounded-xl px-2 py-2 text-left hover:bg-surface-2 aria-expanded:bg-surface-2"
              >
                <span className="mb-1 flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: visible(row.category?.color ?? NO_CATEGORY_COLOR) }} aria-hidden />
                    <span className="truncate">{name}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <span className="num text-ink-2">
                      <strong className="text-ink">{formatMoney(row.total)}</strong> · {Math.round(row.share * 100)}%
                    </span>
                    <ChevronDown className={`size-4 text-muted transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden />
                  </span>
                </span>
                <span className="block h-2 overflow-hidden rounded-full bg-surface-2">
                  <span
                    className="block h-full rounded-full bg-brand"
                    style={{ width: `${Math.max(2, (row.total / max) * 100)}%` }}
                  />
                </span>
              </button>
              {expanded ? (
                <div id={panelId} className="mx-2 mb-2 mt-1 border-l-2 border-line pl-2">
                  {items.map((t) => (
                    <TransactionRow key={t.id} t={t} showDate />
                  ))}
                  <Link
                    href={`/lancamentos?mes=${month.slice(0, 7)}&categoria=${row.key}`}
                    className="inline-flex min-h-11 items-center gap-1 px-2 text-sm font-semibold text-brand"
                  >
                    Abrir em Lançamentos <ChevronRight className="size-4" />
                  </Link>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {rows.length > VISIBLE ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 min-h-11 w-full rounded-xl text-sm font-semibold text-brand hover:bg-surface-2"
        >
          {showAll ? "Mostrar menos" : `Ver as ${rows.length} categorias`}
        </button>
      ) : null}
    </>
  );
}
