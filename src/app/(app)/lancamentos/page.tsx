"use client";

import { Download, ListOrdered, Search, Upload } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { useData } from "@/components/data-provider";
import { Donut } from "@/components/donut";
import { ExportSheet } from "@/components/export-sheet";
import { TransactionRow } from "@/components/transaction-row";
import { EmptyState, Money, MonthSwitcher, PageHeader } from "@/components/ui";
import { currentMonth, dayHeading, monthKey, monthLabel } from "@/lib/dates";
import { categoryTotals, monthSummary } from "@/lib/finance";
import { normalizeDescription } from "@/lib/import/categorize";
import { formatMoney } from "@/lib/money";
import type { Transaction } from "@/lib/types";

type KindFilter = "all" | "expense" | "income" | "other";

const KIND_LABEL: Record<KindFilter, string> = {
  all: "Todos",
  expense: "Despesas",
  income: "Receitas",
  other: "Transferências e faturas",
};

export default function LancamentosPage() {
  // useSearchParams exige um Suspense em volta para o build estático
  return (
    <Suspense fallback={null}>
      <Lancamentos />
    </Suspense>
  );
}

/**
 * Aceita filtros iniciais pela URL, usados pelo painel inicial:
 * /lancamentos?mes=2026-11&categoria=<id ou none>&tipo=expense
 */
function Lancamentos() {
  const params = useSearchParams();
  const { transactions, accounts, cards, categories } = useData();
  const [month, setMonth] = useState(() => {
    const mes = params.get("mes");
    return mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? `${mes}-01` : currentMonth();
  });
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>(() => {
    const tipo = params.get("tipo");
    return tipo && tipo in KIND_LABEL ? (tipo as KindFilter) : "all";
  });
  const [source, setSource] = useState("");
  const [category, setCategory] = useState(() => {
    const id = params.get("categoria");
    return id === "none" || categories.some((c) => c.id === id) ? id! : "";
  });
  const [exporting, setExporting] = useState(false);

  // todos os filtros menos a categoria: base do gráfico, que serve para escolher a categoria
  const base = useMemo(() => {
    const q = normalizeDescription(query);
    return transactions.filter((t) => {
      if (monthKey(t.date) !== month) return false;
      if (kind === "expense" && t.kind !== "expense") return false;
      if (kind === "income" && t.kind !== "income") return false;
      if (kind === "other" && (t.kind === "income" || t.kind === "expense")) return false;
      if (source.startsWith("a:") && t.account_id !== source.slice(2) && t.to_account_id !== source.slice(2)) return false;
      if (source.startsWith("c:") && t.card_id !== source.slice(2)) return false;
      if (q && !normalizeDescription(t.description).includes(q)) return false;
      return true;
    });
  }, [transactions, month, query, kind, source]);

  const filtered = useMemo(
    () =>
      base.filter((t) => {
        if (category === "none" && t.category_id) return false;
        if (category && category !== "none" && t.category_id !== category) return false;
        return true;
      }),
    [base, category],
  );

  const byCategory = useMemo(() => categoryTotals(base, categories), [base, categories]);

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of filtered) {
      const list = map.get(t.date) ?? [];
      list.push(t);
      map.set(t.date, list);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const summary = monthSummary(filtered, month);

  const filterText = [
    kind !== "all" ? KIND_LABEL[kind] : null,
    source.startsWith("a:") ? accounts.find((a) => a.id === source.slice(2))?.name : null,
    source.startsWith("c:") ? cards.find((c) => c.id === source.slice(2))?.name : null,
    category === "none" ? "Sem categoria" : category ? categories.find((c) => c.id === category)?.name : null,
    query.trim() ? `busca "${query.trim()}"` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <PageHeader
        title="Lançamentos"
        action={
          <Link href="/importar" className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-sm font-semibold">
            <Upload className="size-4" /> Importar
          </Link>
        }
      />
      <div className="space-y-3">
        <MonthSwitcher month={month} onChange={setMonth} />
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
          <input
            className="field pl-11"
            type="search"
            placeholder="Buscar pela descrição"
            aria-label="Buscar lançamentos"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <select className="field pl-3 pr-7" aria-label="Tipo" value={kind} onChange={(e) => setKind(e.target.value as KindFilter)}>
            <option value="all">Todos</option>
            <option value="expense">Despesas</option>
            <option value="income">Receitas</option>
            <option value="other">Transf./faturas</option>
          </select>
          <select className="field pl-3 pr-7" aria-label="Conta ou cartão" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Contas</option>
            {accounts.map((a) => (
              <option key={a.id} value={`a:${a.id}`}>
                {a.name}
              </option>
            ))}
            {cards.map((c) => (
              <option key={c.id} value={`c:${c.id}`}>
                {c.name}
              </option>
            ))}
          </select>
          <select className="field pl-3 pr-7" aria-label="Categoria" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Categoria</option>
            <option value="none">Sem categoria</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="card grid grid-cols-3 divide-x divide-line py-3 text-center">
          <div>
            <p className="text-xs text-muted">Receitas</p>
            <p className="num text-sm font-semibold text-income">{formatMoney(summary.income)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Despesas</p>
            <p className="num text-sm font-semibold text-expense">{formatMoney(summary.expense)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Resultado</p>
            <p className="num text-sm font-semibold">{formatMoney(summary.balance)}</p>
          </div>
        </div>

        {byCategory.length > 0 && kind !== "income" && kind !== "other" ? (
          <section className="card p-4" aria-labelledby="graf-h">
            <h2 id="graf-h" className="mb-3 text-sm font-semibold text-ink-2">
              Despesas por categoria
            </h2>
            <Donut
              label="Despesas por categoria"
              slices={byCategory.map((r) => ({
                key: r.key,
                label: r.category?.name ?? "Sem categoria",
                value: r.total,
                color: r.category?.color ?? "#8c9690",
              }))}
              selected={category || null}
              onSelect={(key) => setCategory(key ?? "")}
            />
          </section>
        ) : null}

        <div className="flex items-center justify-between pl-2">
          <p className="text-sm text-muted">
            {filtered.length === 1 ? "1 lançamento" : `${filtered.length} lançamentos`}
          </p>
          <button
            type="button"
            onClick={() => setExporting(true)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-brand hover:bg-surface-2"
          >
            <Download className="size-4" /> Exportar planilha
          </button>
        </div>
      </div>

      <ExportSheet
        open={exporting}
        onClose={() => setExporting(false)}
        visible={filtered}
        visibleLabel={monthLabel(month)}
        filters={filterText}
        month={month}
      />

      <div className="mt-5 space-y-5">
        {groups.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<ListOrdered className="size-6" />}
              title="Nenhum lançamento"
              text={query || kind !== "all" || source || category ? "Nenhum resultado com esses filtros." : "Use o botão + para registrar."}
            />
          </div>
        ) : (
          groups.map(([date, list]) => {
            const dayTotal = list.reduce(
              (s, t) => s + (t.kind === "income" ? t.amount : t.kind === "expense" ? -t.amount : 0),
              0,
            );
            return (
              <section key={date}>
                <div className="mb-1 flex items-center justify-between px-2 text-sm">
                  <h2 className="font-semibold text-ink-2">{dayHeading(date)}</h2>
                  <Money value={dayTotal} className="text-xs text-muted" />
                </div>
                <div className="card p-1.5">
                  {list.map((t) => (
                    <TransactionRow key={t.id} t={t} />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>
    </>
  );
}
