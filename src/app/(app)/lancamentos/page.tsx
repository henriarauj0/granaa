"use client";

import { CalendarDays, CheckCheck, Download, ListOrdered, Plus, Search, SlidersHorizontal, Tags, Trash2, Upload, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { useData } from "@/components/data-provider";
import { categorySlices, Donut } from "@/components/donut";
import { ExportSheet } from "@/components/export-sheet";
import { TransactionRow } from "@/components/transaction-row";
import { Button, EmptyState, ErrorBox, Field, Money, PageHeader, PeriodSwitcher, Pills, ROUND, RoundAction, Segmented, Sheet, SummaryStrip } from "@/components/ui";
import { deleteTransactions, setTransactionsCategory } from "@/lib/api";
import { addDays, addMonths, currentMonth, dayHeading, dayLabel, isValidISODate, monthKey, monthLabel, today, weekLabel, weekStart } from "@/lib/dates";
import { NO_CATEGORY, categoryKey, categoryTotals, lancamentosLabel, periodSummary } from "@/lib/finance";
import { normalizeDescription } from "@/lib/import/categorize";
import type { Transaction } from "@/lib/types";

type KindFilter = "all" | "expense" | "income" | "other";
type Mode = "month" | "week" | "day";

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
 * /lancamentos?mes=2026-11&categoria=<id ou none>&tipo=expense, ?semana=2026-11-23 ou ?dia=2026-11-25
 */
function Lancamentos() {
  const params = useSearchParams();
  const router = useRouter();
  const { transactions, accounts, cards, categories, accountById, cardById, categoryById, reload } = useData();

  const [mode, setMode] = useState<Mode>(() =>
    isValidISODate(params.get("dia") ?? "") ? "day" : isValidISODate(params.get("semana") ?? "") ? "week" : "month",
  );
  const [month, setMonth] = useState(() => {
    const mes = params.get("mes");
    return mes && isValidISODate(`${mes}-01`) ? `${mes}-01` : currentMonth();
  });
  const [day, setDay] = useState(() => {
    const dia = params.get("dia") ?? "";
    return isValidISODate(dia) ? dia : today();
  });
  // segunda-feira da semana escolhida
  const [week, setWeek] = useState(() => {
    const semana = params.get("semana") ?? "";
    return weekStart(isValidISODate(semana) ? semana : today());
  });
  const weekEnd = addDays(week, 6);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>(() => {
    const tipo = params.get("tipo");
    return tipo === "expense" || tipo === "income" || tipo === "other" ? tipo : "all";
  });
  const [source, setSource] = useState("");
  const [category, setCategory] = useState(() => {
    const id = params.get("categoria");
    return id && (id === "none" || categoryById.has(id)) ? id : "";
  });
  const [showFilters, setShowFilters] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [recategorizing, setRecategorizing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // todos os filtros menos a categoria: base do gráfico, que serve para escolher a categoria
  const base = useMemo(() => {
    const q = normalizeDescription(query);
    return transactions.filter((t) => {
      if (mode === "day" && t.date !== day) return false;
      if (mode === "week" && (t.date < week || t.date > weekEnd)) return false;
      if (mode === "month" && monthKey(t.date) !== month) return false;
      if (kind === "expense" && t.kind !== "expense") return false;
      if (kind === "income" && t.kind !== "income") return false;
      if (kind === "other" && (t.kind === "income" || t.kind === "expense")) return false;
      if (source.startsWith("a:") && t.account_id !== source.slice(2) && t.to_account_id !== source.slice(2)) return false;
      if (source.startsWith("c:") && t.card_id !== source.slice(2)) return false;
      if (q && !normalizeDescription(t.description).includes(q)) return false;
      return true;
    });
  }, [transactions, mode, day, week, weekEnd, month, query, kind, source]);

  const filtered = useMemo(() => (category ? base.filter((t) => categoryKey(t) === category) : base), [base, category]);
  const byCategory = useMemo(() => categoryTotals(base, categories), [base, categories]);
  const summary = useMemo(() => periodSummary(filtered), [filtered]);

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of filtered) {
      const list = map.get(t.date) ?? [];
      list.push(t);
      map.set(t.date, list);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  // só conta como selecionado o que está na tela
  const chosen = useMemo(() => filtered.filter((t) => selected.has(t.id)), [filtered, selected]);

  const period =
    mode === "day"
      ? { label: dayLabel(day), key: day }
      : mode === "week"
        ? { label: weekLabel(week), key: `semana-${week}` }
        : { label: monthLabel(month), key: month.slice(0, 7) };
  const hasFilters = !!(query.trim() || source || category);

  const filterText = [
    kind !== "all" ? KIND_LABEL[kind] : null,
    source.startsWith("a:") ? accountById.get(source.slice(2))?.name : null,
    source.startsWith("c:") ? cardById.get(source.slice(2))?.name : null,
    category === "none" ? NO_CATEGORY : category ? categoryById.get(category)?.name : null,
    query.trim() ? `busca "${query.trim()}"` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  function step(n: number) {
    if (mode === "day") setDay(addDays(day, n));
    else if (mode === "week") setWeek(addDays(week, 7 * n));
    else setMonth(addMonths(month, n));
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function stopSelecting() {
    setSelecting(false);
    setSelected(new Set());
    setError(null);
  }

  async function removeSelected() {
    if (chosen.length === 0) return;
    const parcelas = chosen.some((t) => t.installment_group)
      ? " Em compras parceladas, só as parcelas marcadas são excluídas."
      : "";
    if (!window.confirm(`Excluir ${lancamentosLabel(chosen.length)}? Isso não pode ser desfeito.${parcelas}`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteTransactions(chosen.map((t) => t.id));
      await reload();
      stopSelecting();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível excluir.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Lançamentos"
        action={
          <button type="button" aria-label="Escolher período" title="Escolher período" onClick={() => setPeriodOpen(true)} className={`size-12 ${ROUND}`}>
            <CalendarDays className="size-5" />
          </button>
        }
      />

      <div className="space-y-4">
        <PeriodSwitcher
          label={period.label}
          unit={mode === "day" ? "dia" : mode === "week" ? "semana" : "mês"}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
        />

        <SummaryStrip {...summary} />

        {byCategory.length > 0 && kind !== "income" && kind !== "other" ? (
          <section className="card p-4" aria-labelledby="graf-h">
            <h2 id="graf-h" className="mb-3 text-center text-sm font-medium text-ink-2">
              Despesas por categoria
            </h2>
            <Donut
              label="Despesas por categoria"
              slices={categorySlices(byCategory)}
              selected={category || null}
              onSelect={(key) => setCategory(key ?? "")}
            />
          </section>
        ) : null}

        <div className="flex gap-1 pt-1">
          <RoundAction label="Importar" icon={<Upload className="size-5" />} onClick={() => router.push("/importar")} />
          <RoundAction
            label="Filtros"
            icon={<SlidersHorizontal className="size-5" />}
            onClick={() => setShowFilters((v) => !v)}
            active={showFilters || hasFilters}
          />
          <RoundAction label="Exportar" icon={<Download className="size-5" />} onClick={() => setExporting(true)} />
          <RoundAction
            label={selecting ? "Cancelar" : "Selecionar"}
            icon={selecting ? <X className="size-5" /> : <CheckCheck className="size-5" />}
            onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
            active={selecting}
          />
          <RoundAction label="Novo" icon={<Plus className="size-6" />} onClick={() => router.push("/lancamentos/novo")} primary />
        </div>

        {showFilters || hasFilters ? (
          <div className="space-y-2">
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
            <div className="grid grid-cols-2 gap-2">
              <select className="field pl-3 pr-7" aria-label="Conta ou cartão" value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="">Todas as contas</option>
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
                <option value="">Todas as categorias</option>
                <option value="none">{NO_CATEGORY}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            {hasFilters ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setSource("");
                  setCategory("");
                }}
                className="min-h-10 px-1 text-sm font-semibold text-brand"
              >
                Limpar filtros
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-3 pt-2">
          <h2 className="text-xl font-medium">Lançamentos</h2>
          <Pills<KindFilter>
            label="Tipo de lançamento"
            value={kind}
            onChange={setKind}
            options={[
              { value: "all", label: "Todos" },
              { value: "income", label: "Receitas" },
              { value: "expense", label: "Despesas" },
              { value: "other", label: "Transf. e faturas" },
            ]}
          />
          <p className="px-1 text-xs text-muted">
            {lancamentosLabel(filtered.length)}
            {selecting
              ? " · toque para marcar"
              : filtered.length > 0
                ? " · toque num lançamento para editar ou excluir"
                : ""}
          </p>
        </div>
      </div>

      {exporting ? (
        <ExportSheet onClose={() => setExporting(false)} visible={filtered} filters={filterText} period={period} />
      ) : null}

      <div className={`mt-4 space-y-5 ${selecting ? "pb-24" : ""}`}>
        {groups.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<ListOrdered className="size-6" />}
              title="Nenhum lançamento"
              text={hasFilters || kind !== "all" ? "Nenhum resultado com esses filtros." : "Use o botão Novo para registrar."}
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
                <div className="mb-2 flex items-center justify-between px-1 text-sm">
                  <h3 className="font-medium text-ink-2">{dayHeading(date)}</h3>
                  <Money value={dayTotal} className="text-xs text-muted" />
                </div>
                <div className="space-y-2">
                  {list.map((t) => (
                    <TransactionRow
                      key={t.id}
                      t={t}
                      boxed
                      selected={selecting ? selected.has(t.id) : undefined}
                      onToggle={selecting ? toggle : undefined}
                    />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>

      {selecting ? (
        <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 px-4">
          <div className="card mx-auto flex max-w-2xl flex-wrap items-center gap-2 p-3">
            <span className="min-w-0 flex-1 text-sm font-semibold">
              {chosen.length === 0 ? "Nenhum marcado" : chosen.length === 1 ? "1 marcado" : `${chosen.length} marcados`}
            </span>
            <button
              type="button"
              onClick={() => setSelected(chosen.length === filtered.length ? new Set() : new Set(filtered.map((t) => t.id)))}
              className="min-h-10 rounded-full px-3 text-sm font-semibold text-brand hover:bg-surface-2"
            >
              {chosen.length === filtered.length && filtered.length > 0 ? "Desmarcar" : "Marcar todos"}
            </button>
            <button
              type="button"
              disabled={chosen.length === 0 || busy}
              onClick={() => setRecategorizing(true)}
              className={`size-10 ${ROUND} disabled:opacity-40`}
              aria-label="Trocar categoria dos marcados"
              title="Trocar categoria"
            >
              <Tags className="size-5" />
            </button>
            <button
              type="button"
              disabled={chosen.length === 0 || busy}
              onClick={removeSelected}
              className="inline-flex size-10 items-center justify-center rounded-full bg-danger-soft text-expense disabled:opacity-40"
              aria-label="Excluir os marcados"
              title="Excluir"
            >
              <Trash2 className="size-5" />
            </button>
            {error ? <p className="w-full text-sm text-expense">{error}</p> : null}
          </div>
        </div>
      ) : null}

      <Sheet open={periodOpen} onClose={() => setPeriodOpen(false)} title="Período">
        <PeriodForm
          mode={mode}
          month={month}
          week={week}
          day={day}
          onApply={(m, value) => {
            setMode(m);
            if (m === "day") setDay(value);
            else if (m === "week") setWeek(weekStart(value));
            else setMonth(value);
            setPeriodOpen(false);
          }}
        />
      </Sheet>

      <Sheet open={recategorizing} onClose={() => setRecategorizing(false)} title="Trocar categoria">
        {recategorizing ? (
          <RecategorizeForm
            items={chosen}
            onDone={async () => {
              setRecategorizing(false);
              stopSelecting();
            }}
          />
        ) : null}
      </Sheet>
    </>
  );
}

function PeriodForm({
  mode,
  month,
  week,
  day,
  onApply,
}: {
  mode: Mode;
  month: string;
  week: string;
  day: string;
  onApply: (m: Mode, value: string) => void;
}) {
  const [m, setM] = useState<Mode>(mode);
  const [monthValue, setMonthValue] = useState(month.slice(0, 7));
  // na semana, escolhe-se qualquer dia dela
  const [weekValue, setWeekValue] = useState(week);
  const [dayValue, setDayValue] = useState(day);
  const valid =
    m === "day" ? isValidISODate(dayValue) : m === "week" ? isValidISODate(weekValue) : isValidISODate(`${monthValue}-01`);
  const value = m === "day" ? dayValue : m === "week" ? weekValue : `${monthValue}-01`;
  const now = m === "day" ? today() : m === "week" ? weekStart(today()) : currentMonth();

  return (
    <div className="space-y-4">
      <Segmented<Mode>
        label="Ver por"
        value={m}
        onChange={setM}
        options={[
          { value: "month", label: "Mês" },
          { value: "week", label: "Semana" },
          { value: "day", label: "Dia" },
        ]}
      />
      {m === "month" ? (
        <Field label="Mês">{(id) => <input id={id} type="month" className="field" value={monthValue} onChange={(e) => setMonthValue(e.target.value)} />}</Field>
      ) : m === "week" ? (
        <Field
          label="Um dia da semana"
          hint={isValidISODate(weekValue) ? `Semana de ${weekLabel(weekStart(weekValue))} (segunda a domingo).` : "Semanas vão de segunda a domingo."}
        >
          {(id) => <input id={id} type="date" className="field" value={weekValue} onChange={(e) => setWeekValue(e.target.value)} />}
        </Field>
      ) : (
        <Field label="Dia">{(id) => <input id={id} type="date" className="field" value={dayValue} onChange={(e) => setDayValue(e.target.value)} />}</Field>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" onClick={() => onApply(m, now)}>
          {m === "day" ? "Hoje" : m === "week" ? "Esta semana" : "Este mês"}
        </Button>
        <Button type="button" disabled={!valid} onClick={() => onApply(m, value)}>
          Ver
        </Button>
      </div>
    </div>
  );
}

function RecategorizeForm({ items, onDone }: { items: Transaction[]; onDone: () => void }) {
  const { categories, reload } = useData();
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosenCategory = categories.find((c) => c.id === target) ?? null;
  // categoria de despesa só vale para despesas, e de receita só para receitas
  const eligible = items.filter((t) =>
    target === "none" ? t.kind === "income" || t.kind === "expense" : chosenCategory ? t.kind === chosenCategory.kind : false,
  );
  const skipped = target ? items.length - eligible.length : 0;

  async function apply() {
    if (eligible.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await setTransactionsCategory(
        eligible.map((t) => t.id),
        target === "none" ? null : target,
      );
      await reload();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível trocar a categoria.");
      setBusy(false);
    }
  }

  const expense = categories.filter((c) => c.kind === "expense");
  const income = categories.filter((c) => c.kind === "income");

  return (
    <div className="space-y-4">
      <Field label={`Nova categoria para ${lancamentosLabel(items.length)}`}>
        {(id) => (
          <select id={id} className="field" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Escolha…</option>
            <option value="none">{NO_CATEGORY}</option>
            <optgroup label="Despesas">
              {expense.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Receitas">
              {income.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          </select>
        )}
      </Field>
      {skipped > 0 ? (
        <p className="text-sm text-ink-2">
          {skipped === 1 ? "1 lançamento marcado não é" : `${skipped} lançamentos marcados não são`} do mesmo tipo da categoria e
          {skipped === 1 ? " fica" : " ficam"} como está.
        </p>
      ) : null}
      <ErrorBox>{error}</ErrorBox>
      <Button className="w-full" loading={busy} disabled={eligible.length === 0} onClick={apply}>
        Aplicar em {lancamentosLabel(eligible.length)}
      </Button>
    </div>
  );
}
