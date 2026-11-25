"use client";

import { ChevronRight, CreditCard, Menu, Target, Upload, Wallet } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CategoryBreakdown } from "@/components/category-breakdown";
import { useData } from "@/components/data-provider";
import { TransactionRow } from "@/components/transaction-row";
import { Badge, EmptyState, MonthSwitcher, ProgressBar, ROUND, SummaryStrip } from "@/components/ui";
import { currentMonth, fullDate, monthKey } from "@/lib/dates";
import {
  accountBalance,
  currentInvoiceMonth,
  goalProgress,
  invoiceSummary,
  monthSummary,
} from "@/lib/finance";
import { formatMoney } from "@/lib/money";

export default function InicioPage() {
  const { profile, accounts, cards, transactions, goals } = useData();
  const [month, setMonth] = useState(currentMonth());

  const firstName = profile?.full_name?.split(" ")[0] ?? "";
  const activeAccounts = accounts.filter((a) => !a.archived);
  const totalBalance = activeAccounts.reduce((sum, a) => sum + accountBalance(a, transactions), 0);
  const summary = useMemo(() => monthSummary(transactions, month), [transactions, month]);
  const monthTx = transactions.filter((t) => monthKey(t.date) === month).slice(0, 6);
  const activeCards = cards.filter((c) => !c.archived);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted">Olá{firstName ? `, ${firstName}` : ""}</p>
          <h1 className="text-[28px] font-medium tracking-tight">Seu dinheiro</h1>
        </div>
        <Link href="/mais" aria-label="Mais opções" title="Mais opções" className={`size-12 ${ROUND}`}>
          <Menu className="size-5" />
        </Link>
      </header>

      {/* Saldo */}
      <section className="rounded-3xl bg-hero p-5 text-on-hero shadow-lg" aria-label="Saldo">
        <p className="text-sm opacity-80">Saldo em contas hoje</p>
        <p className="num mt-1 text-4xl font-bold tracking-tight">{formatMoney(totalBalance)}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {activeAccounts.slice(0, 4).map((a) => (
            <span key={a.id} className="rounded-full bg-black/15 px-3 py-1 text-xs">
              {a.name}: <span className="num font-semibold">{formatMoney(accountBalance(a, transactions))}</span>
            </span>
          ))}
          <Link href="/contas" className="rounded-full bg-black/15 px-3 py-1 text-xs font-semibold">
            Contas →
          </Link>
        </div>
      </section>

      <MonthSwitcher month={month} onChange={setMonth} />

      {/* Resumo do mês */}
      <SummaryStrip {...summary} />

      {/* Cartões */}
      <section aria-labelledby="cartoes-h">
        <SectionTitle id="cartoes-h" title="Faturas" href="/cartoes" />
        {activeCards.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<CreditCard className="size-6" />}
              title="Nenhum cartão cadastrado"
              text="Cadastre seus cartões para acompanhar as faturas."
              action={<Link href="/cartoes" className="font-semibold text-brand">Adicionar cartão</Link>}
            />
          </div>
        ) : (
          <div className="card divide-y divide-line">
            {activeCards.map((card) => {
              const inv = invoiceSummary(card, currentInvoiceMonth(card), transactions);
              return (
                <Link key={card.id} href={`/cartoes/${card.id}`} className="flex items-center gap-3 p-4">
                  <span className="h-8 w-12 shrink-0 rounded-md" style={{ background: card.color }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{card.name}</span>
                    <span className="text-xs text-muted">Vence {fullDate(inv.dueDate)}</span>
                  </span>
                  <span className="text-right">
                    <span className="num block font-semibold">{formatMoney(inv.total)}</span>
                    <Badge tone="neutral">fatura aberta</Badge>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Gastos por categoria */}
      <section aria-labelledby="cat-h">
        <SectionTitle id="cat-h" title="Gastos por categoria" />
        <div className="card p-4">
          <CategoryBreakdown month={month} />
        </div>
      </section>

      {/* Metas */}
      <section aria-labelledby="metas-h">
        <SectionTitle id="metas-h" title="Metas" href="/metas" />
        {goals.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<Target className="size-6" />}
              title="Nenhuma meta ainda"
              text="Defina um valor-alvo e acompanhe quanto já acumulou."
              action={<Link href="/metas" className="font-semibold text-brand">Criar meta</Link>}
            />
          </div>
        ) : (
          <div className="card space-y-4 p-4">
            {goals.slice(0, 3).map((g) => {
              const p = goalProgress(g.saved_amount, g.target_amount);
              return (
                <div key={g.id}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="font-medium">{g.name}</span>
                    <span className="num text-muted">
                      {formatMoney(g.saved_amount)} de {formatMoney(g.target_amount)}
                    </span>
                  </div>
                  <ProgressBar value={p} color={g.color} label={`Progresso da meta ${g.name}`} />
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Últimos lançamentos */}
      <section aria-labelledby="ult-h">
        <SectionTitle id="ult-h" title="Lançamentos do mês" href="/lancamentos" />
        <div className="card p-2">
          {monthTx.length === 0 ? (
            <EmptyState
              icon={<Wallet className="size-6" />}
              title="Nada por aqui"
              text="Registre um gasto pelo botão + ou importe um extrato."
              action={
                <Link href="/importar" className="inline-flex items-center gap-1 font-semibold text-brand">
                  <Upload className="size-4" /> Importar extrato
                </Link>
              }
            />
          ) : (
            monthTx.map((t) => <TransactionRow key={t.id} t={t} showDate />)
          )}
        </div>
      </section>
    </div>
  );
}

function SectionTitle({ id, title, href }: { id: string; title: string; href?: string }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 id={id} className="text-lg font-bold">
        {title}
      </h2>
      {href ? (
        <Link href={href} className="inline-flex items-center text-sm font-semibold text-brand">
          Ver tudo <ChevronRight className="size-4" />
        </Link>
      ) : null}
    </div>
  );
}
