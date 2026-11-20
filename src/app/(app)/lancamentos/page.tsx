"use client";

import { ListOrdered, Search, Upload } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useData } from "@/components/data-provider";
import { TransactionRow } from "@/components/transaction-row";
import { EmptyState, Money, MonthSwitcher, PageHeader } from "@/components/ui";
import { currentMonth, dayHeading, monthKey } from "@/lib/dates";
import { monthSummary } from "@/lib/finance";
import { normalizeDescription } from "@/lib/import/categorize";
import { formatMoney } from "@/lib/money";
import type { Transaction } from "@/lib/types";

type KindFilter = "all" | "expense" | "income" | "other";

export default function LancamentosPage() {
  const { transactions, accounts, cards, categories } = useData();
  const [month, setMonth] = useState(currentMonth());
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [source, setSource] = useState("");
  const [category, setCategory] = useState("");

  const filtered = useMemo(() => {
    const q = normalizeDescription(query);
    return transactions.filter((t) => {
      if (monthKey(t.date) !== month) return false;
      if (kind === "expense" && t.kind !== "expense") return false;
      if (kind === "income" && t.kind !== "income") return false;
      if (kind === "other" && (t.kind === "income" || t.kind === "expense")) return false;
      if (source.startsWith("a:") && t.account_id !== source.slice(2) && t.to_account_id !== source.slice(2)) return false;
      if (source.startsWith("c:") && t.card_id !== source.slice(2)) return false;
      if (category === "none" && t.category_id) return false;
      if (category && category !== "none" && t.category_id !== category) return false;
      if (q && !normalizeDescription(t.description).includes(q)) return false;
      return true;
    });
  }, [transactions, month, query, kind, source, category]);

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
          <select className="field text-sm" aria-label="Tipo" value={kind} onChange={(e) => setKind(e.target.value as KindFilter)}>
            <option value="all">Todos</option>
            <option value="expense">Despesas</option>
            <option value="income">Receitas</option>
            <option value="other">Transf./faturas</option>
          </select>
          <select className="field text-sm" aria-label="Conta ou cartão" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Contas e cartões</option>
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
          <select className="field text-sm" aria-label="Categoria" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Categorias</option>
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
      </div>

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
