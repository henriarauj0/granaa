"use client";

import { ChartPie, DatabaseZap, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useData } from "@/components/data-provider";
import { Donut } from "@/components/donut";
import { FlowChart } from "@/components/flow-chart";
import { Button, EmptyState, ErrorBox, Field, IconButton, MoneyInput, PageHeader, Segmented, Sheet } from "@/components/ui";
import { deleteInvestment, deleteMovement, saveInvestment, saveMovement } from "@/lib/api";
import { isValidISODate, monthKey, monthLabel, shortDate, today } from "@/lib/dates";
import {
  averageMonthlyContribution,
  byClass,
  monthlyFlows,
  netInvested,
  portfolio,
  positionValue,
} from "@/lib/investments";
import { formatMoney, wholeMoney } from "@/lib/money";
import {
  INVESTMENT_CLASSES,
  type Investment,
  type InvestmentClass,
  type InvestmentMovement,
  type MovementKind,
} from "@/lib/types";

const CLASS = new Map(INVESTMENT_CLASSES.map((c, i) => [c.value, { ...c, order: i }]));
const KIND_LABEL: Record<MovementKind, string> = { aporte: "Aporte", resgate: "Resgate", saldo: "Saldo atualizado" };
const PAGE = 20;

type View = "ativo" | "classe";
type MovementTarget = { movement?: InvestmentMovement; investmentId?: string };

export default function InvestimentosPage() {
  const { investments, movements, investmentsReady } = useData();
  const [view, setView] = useState<View>("ativo");
  const [monthFilter, setMonthFilter] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [editingAsset, setEditingAsset] = useState<Investment | "new" | null>(null);
  const [editingMove, setEditingMove] = useState<MovementTarget | null>(null);

  const positions = useMemo(() => portfolio(investments, movements), [investments, movements]);
  const total = positions.reduce((s, p) => s + p.value, 0);
  const average = useMemo(() => averageMonthlyContribution(movements), [movements]);
  const flows = useMemo(() => monthlyFlows(movements, 6), [movements]);
  const assetName = useMemo(() => new Map(investments.map((i) => [i.id, i])), [investments]);

  const slices = useMemo(() => {
    if (view === "classe") {
      return byClass(positions).map((c) => ({ key: c.assetClass, label: c.label, value: c.value, color: c.color }));
    }
    // ativos agrupados por classe; dentro da classe, tons da mesma cor
    const sorted = [...positions].sort(
      (a, b) => CLASS.get(a.investment.asset_class)!.order - CLASS.get(b.investment.asset_class)!.order || b.value - a.value,
    );
    const seen = new Map<InvestmentClass, number>();
    return sorted.map((p) => {
      const cls = p.investment.asset_class;
      const i = seen.get(cls) ?? 0;
      seen.set(cls, i + 1);
      const base = CLASS.get(cls)!.color;
      const color = i === 0 ? base : `color-mix(in oklab, ${base}, var(--surface) ${Math.min(3, i) * 18}%)`;
      return { key: p.investment.id, label: p.investment.name, value: p.value, color };
    });
  }, [positions, view]);

  const months = useMemo(() => [...new Set(movements.map((m) => monthKey(m.date)))].sort().reverse(), [movements]);
  const listed = monthFilter ? movements.filter((m) => monthKey(m.date) === monthFilter) : movements;

  const add = () => (investments.length === 0 ? setEditingAsset("new") : setEditingMove({}));

  if (!investmentsReady) {
    return (
      <>
        <PageHeader title="Investimentos" />
        <div className="card">
          <EmptyState
            icon={<DatabaseZap className="size-6" />}
            title="Falta preparar o banco de dados"
            text="Rode no SQL Editor do Supabase o arquivo supabase/migrations/20261122000000_investimentos.sql e abra esta tela de novo."
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Investimentos"
        action={
          <IconButton label="Nova movimentação" onClick={add} className="bg-brand text-on-brand hover:bg-brand-strong">
            <Plus className="size-5" />
          </IconButton>
        }
      />

      {investments.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<ChartPie className="size-6" />}
            title="Monte sua carteira"
            text="Cadastre seus investimentos com o valor de hoje e registre aportes e resgates. O app mostra o patrimônio, a distribuição e quanto você aplica por mês."
            action={<Button onClick={() => setEditingAsset("new")}>Adicionar investimento</Button>}
          />
        </div>
      ) : (
        <div className="space-y-5">
          <section className="card grid grid-cols-3 divide-x divide-line py-3 text-center" aria-label="Resumo da carteira">
            <div className="px-2">
              <p className="text-xs text-muted">Patrimônio</p>
              <p className="num truncate text-sm font-semibold">{wholeMoney(total)}</p>
            </div>
            <div className="px-2">
              <p className="text-xs text-muted">Maior posição</p>
              <p className="truncate text-sm font-semibold">{positions[0]?.investment.name ?? "—"}</p>
            </div>
            <div className="px-2">
              <p className="text-xs text-muted">Aporte médio</p>
              <p className="num truncate text-sm font-semibold">{wholeMoney(average)}</p>
            </div>
          </section>

          <section className="card p-4" aria-labelledby="dist-h">
            <div className="mb-1 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="dist-h" className="text-sm font-semibold text-ink-2">
                  Distribuição da carteira
                </h2>
                <p className="num truncate text-2xl font-bold tracking-tight">{formatMoney(total)}</p>
              </div>
              <select
                className="field min-h-9 w-auto shrink-0 rounded-full py-0 pl-4 text-sm"
                aria-label="Agrupar por"
                value={view}
                onChange={(e) => setView(e.target.value as View)}
              >
                <option value="ativo">Ativo</option>
                <option value="classe">Classe</option>
              </select>
            </div>
            {slices.length > 0 ? (
              <div className="mt-3">
                <Donut key={view} label="Distribuição da carteira" slices={slices} />
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted">Nenhum investimento com saldo.</p>
            )}
          </section>

          <section className="card p-4" aria-labelledby="flux-h">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h2 id="flux-h" className="font-semibold">
                Aportes e resgates
              </h2>
              <span className="flex items-center gap-3 text-xs text-ink-2">
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-brand" aria-hidden /> Aportes
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-expense" aria-hidden /> Resgates
                </span>
              </span>
            </div>
            <FlowChart flows={flows} />
          </section>

          <section aria-labelledby="ativos-h">
            <div className="mb-2 flex items-center justify-between">
              <h2 id="ativos-h" className="text-lg font-bold">
                Seus investimentos
              </h2>
              <button type="button" onClick={() => setEditingAsset("new")} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand">
                <Plus className="size-4" /> Adicionar
              </button>
            </div>
            <div className="card divide-y divide-line overflow-hidden">
              {investments
                .map((inv) => ({ inv, value: positionValue(inv.id, movements) }))
                .sort((a, b) => b.value - a.value)
                .map(({ inv, value }) => {
                  const cls = CLASS.get(inv.asset_class)!;
                  const gain = value - netInvested(inv.id, movements);
                  return (
                    <button
                      key={inv.id}
                      type="button"
                      onClick={() => setEditingAsset(inv)}
                      className="flex w-full items-center gap-3 p-4 text-left hover:bg-surface-2"
                    >
                      <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: cls.color }} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{inv.name}</span>
                        <span className="block truncate text-xs text-muted">
                          {[cls.label, inv.institution].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="num block text-sm font-semibold">{formatMoney(value)}</span>
                        {Math.abs(gain) >= 0.01 ? (
                          <span className={`num text-xs ${gain > 0 ? "text-income" : "text-expense"}`}>
                            {gain > 0 ? "+" : "−"}
                            {formatMoney(Math.abs(gain))}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
            </div>
          </section>

          <section aria-labelledby="mov-h">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 id="mov-h" className="text-lg font-bold">
                Últimas movimentações
              </h2>
              <select
                className="field min-h-10 w-auto rounded-full py-0 pl-4 text-sm"
                aria-label="Mês das movimentações"
                value={monthFilter}
                onChange={(e) => {
                  setMonthFilter(e.target.value);
                  setLimit(PAGE);
                }}
              >
                <option value="">Todos os meses</option>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </select>
            </div>
            <div className="card p-1.5">
              {listed.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">Nenhuma movimentação.</p>
              ) : (
                listed.slice(0, limit).map((m) => {
                  const inv = assetName.get(m.investment_id);
                  const color = inv ? CLASS.get(inv.asset_class)!.color : "var(--muted)";
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setEditingMove({ movement: m })}
                      className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-surface-2"
                    >
                      <span
                        className="flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold"
                        style={{ background: `color-mix(in oklab, ${color} 18%, transparent)`, color }}
                        aria-hidden
                      >
                        {(inv?.name ?? "?").charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{inv?.name ?? "Investimento excluído"}</span>
                        <span className="block truncate text-xs text-muted">
                          {KIND_LABEL[m.kind]} · {shortDate(m.date)}
                          {m.notes ? ` · ${m.notes}` : ""}
                        </span>
                      </span>
                      <span
                        className={`num whitespace-nowrap text-sm font-semibold ${
                          m.kind === "aporte" ? "text-income" : m.kind === "resgate" ? "text-expense" : "text-ink-2"
                        }`}
                      >
                        {m.kind === "aporte" ? "+ " : m.kind === "resgate" ? "− " : ""}
                        {formatMoney(m.amount)}
                      </span>
                    </button>
                  );
                })
              )}
              {listed.length > limit ? (
                <button
                  type="button"
                  onClick={() => setLimit((l) => l + PAGE)}
                  className="min-h-11 w-full rounded-xl text-sm font-semibold text-brand hover:bg-surface-2"
                >
                  Mostrar mais
                </button>
              ) : null}
            </div>
          </section>

          <p className="px-2 text-xs text-muted">
            Os investimentos são um acompanhamento à parte: não tiram dinheiro das contas nem entram nas despesas. Para
            registrar rendimento, use &quot;Saldo atualizado&quot; com o valor que o banco ou a corretora mostra.
          </p>
        </div>
      )}

      <Sheet
        open={editingAsset !== null}
        onClose={() => setEditingAsset(null)}
        title={editingAsset === "new" ? "Novo investimento" : "Editar investimento"}
      >
        {editingAsset !== null ? (
          <AssetForm
            asset={editingAsset === "new" ? undefined : editingAsset}
            onDone={() => setEditingAsset(null)}
            onMove={(investmentId) => {
              setEditingAsset(null);
              setEditingMove({ investmentId });
            }}
          />
        ) : null}
      </Sheet>
      <Sheet
        open={editingMove !== null}
        onClose={() => setEditingMove(null)}
        title={editingMove?.movement ? "Editar movimentação" : "Nova movimentação"}
      >
        {editingMove !== null ? <MovementForm target={editingMove} onDone={() => setEditingMove(null)} /> : null}
      </Sheet>
    </>
  );
}

function AssetForm({ asset, onDone, onMove }: { asset?: Investment; onDone: () => void; onMove: (id: string) => void }) {
  const { reload, movements } = useData();
  const [name, setName] = useState(asset?.name ?? "");
  const [assetClass, setAssetClass] = useState<InvestmentClass>(asset?.asset_class ?? "renda_fixa");
  const [institution, setInstitution] = useState(asset?.institution ?? "");
  const [initial, setInitial] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const value = asset ? positionValue(asset.id, movements) : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Dê um nome para o investimento.");
    setBusy(true);
    try {
      const id = await saveInvestment({ name: name.trim(), asset_class: assetClass, institution: institution.trim() || null }, asset?.id);
      if (!asset && initial && initial > 0) {
        await saveMovement({ investment_id: id, kind: "saldo", amount: initial, date: today(), notes: null });
      }
      await reload();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!asset || !window.confirm(`Excluir "${asset.name}" e todas as movimentações dele?`)) return;
    setBusy(true);
    try {
      await deleteInvestment(asset.id);
      await reload();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {asset ? (
        <div className="flex items-center justify-between rounded-xl bg-surface-2 p-3">
          <span className="text-sm text-ink-2">
            Valor hoje <strong className="num block text-base text-ink">{formatMoney(value)}</strong>
          </span>
          <Button type="button" variant="secondary" className="min-h-10 bg-surface" onClick={() => onMove(asset.id)}>
            <Plus className="size-4" /> Movimentar
          </Button>
        </div>
      ) : null}
      <Field label="Nome">
        {(id) => <input id={id} className="field" maxLength={60} placeholder="Ex.: CDB Banco Inter, Tesouro IPCA+ 2035" value={name} onChange={(e) => setName(e.target.value)} />}
      </Field>
      <Field label="Classe">
        {(id) => (
          <select id={id} className="field" value={assetClass} onChange={(e) => setAssetClass(e.target.value as InvestmentClass)}>
            {INVESTMENT_CLASSES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Banco ou corretora (opcional)">
        {(id) => <input id={id} className="field" maxLength={60} placeholder="Ex.: XP, Nubank" value={institution} onChange={(e) => setInstitution(e.target.value)} />}
      </Field>
      {!asset ? (
        <Field label="Valor hoje (opcional)" hint="Quanto este investimento vale agora. Depois você registra aportes e resgates.">
          {(id) => <MoneyInput id={id} value={initial} onChange={setInitial} />}
        </Field>
      ) : null}
      <ErrorBox>{error}</ErrorBox>
      <Button type="submit" loading={busy} className="w-full">
        {asset ? "Salvar" : "Adicionar investimento"}
      </Button>
      {asset ? (
        <Button type="button" variant="danger" className="w-full" onClick={remove} disabled={busy}>
          <Trash2 className="size-4" /> Excluir investimento
        </Button>
      ) : null}
    </form>
  );
}

function MovementForm({ target, onDone }: { target: MovementTarget; onDone: () => void }) {
  const { reload, investments, movements } = useData();
  const original = target.movement;
  const [investmentId, setInvestmentId] = useState(original?.investment_id ?? target.investmentId ?? investments[0]?.id ?? "");
  const [kind, setKind] = useState<MovementKind>(original?.kind ?? "aporte");
  const [amount, setAmount] = useState<number | null>(original?.amount ?? null);
  const [date, setDate] = useState(original?.date ?? today());
  const [notes, setNotes] = useState(original?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const current = investmentId ? positionValue(investmentId, movements) : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!investmentId) return setError("Escolha o investimento.");
    if (amount == null || amount < 0 || (kind !== "saldo" && amount === 0)) return setError("Informe o valor.");
    if (!isValidISODate(date)) return setError("Data inválida.");
    setBusy(true);
    try {
      await saveMovement({ investment_id: investmentId, kind, amount, date, notes: notes.trim() || null }, original?.id);
      await reload();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!original || !window.confirm("Excluir esta movimentação?")) return;
    setBusy(true);
    try {
      await deleteMovement(original.id);
      await reload();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Segmented<MovementKind>
        label="Tipo"
        value={kind}
        onChange={setKind}
        options={[
          { value: "aporte", label: "Aporte" },
          { value: "resgate", label: "Resgate" },
          { value: "saldo", label: "Saldo" },
        ]}
      />
      <Field label="Investimento" hint={investmentId && !original ? `Valor hoje: ${formatMoney(current)}` : undefined}>
        {(id) => (
          <select id={id} className="field" value={investmentId} onChange={(e) => setInvestmentId(e.target.value)}>
            {investments.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field
        label={kind === "aporte" ? "Quanto aplicou?" : kind === "resgate" ? "Quanto resgatou?" : "Quanto vale nesta data?"}
        hint={kind === "saldo" ? "Use o valor que o banco ou a corretora mostra. A diferença para o que você aplicou é o rendimento." : undefined}
      >
        {(id) => <MoneyInput id={id} value={amount} onChange={setAmount} autoFocus={!original} large />}
      </Field>
      <Field label="Data">{(id) => <input id={id} type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
      <Field label="Observação (opcional)">
        {(id) => <input id={id} className="field" maxLength={280} value={notes} onChange={(e) => setNotes(e.target.value)} />}
      </Field>
      <ErrorBox>{error}</ErrorBox>
      <Button type="submit" loading={busy} className="w-full">
        {original ? "Salvar" : "Registrar"}
      </Button>
      {original ? (
        <Button type="button" variant="danger" className="w-full" onClick={remove} disabled={busy}>
          <Trash2 className="size-4" /> Excluir movimentação
        </Button>
      ) : null}
    </form>
  );
}
