"use client";

import { Archive, ArchiveRestore, ChevronLeft, ChevronRight, Pencil, Receipt, SearchX, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CardForm } from "@/components/card-form";
import { useData } from "@/components/data-provider";
import { TransactionRow } from "@/components/transaction-row";
import { Badge, Button, EmptyState, ErrorBox, Field, IconButton, MoneyInput, PageHeader, Sheet } from "@/components/ui";
import { createTransaction, deleteCard, setCardArchived } from "@/lib/api";
import { addMonths, fullDate, monthLabel, today } from "@/lib/dates";
import { currentInvoiceMonth, invoiceSummary, type InvoiceStatus } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import type { CreditCard } from "@/lib/types";

const STATUS: Record<InvoiceStatus, { label: string; tone: "neutral" | "good" | "warning" | "danger" }> = {
  aberta: { label: "Aberta", tone: "neutral" },
  futura: { label: "Futura", tone: "neutral" },
  fechada: { label: "Fechada", tone: "warning" },
  vencida: { label: "Vencida", tone: "danger" },
  paga: { label: "Paga", tone: "good" },
};

export default function CartaoPage() {
  const { id } = useParams<{ id: string }>();
  const { cardById } = useData();
  const card = cardById.get(id);
  if (!card)
    return (
      <>
        <PageHeader title="Cartão" back="/cartoes" />
        <EmptyState icon={<SearchX className="size-6" />} title="Cartão não encontrado" />
      </>
    );
  return <CardDetail key={card.id} card={card} />;
}

function CardDetail({ card }: { card: CreditCard }) {
  const router = useRouter();
  const { transactions, reload } = useData();
  const [month, setMonth] = useState(() => currentInvoiceMonth(card));
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inv = useMemo(() => invoiceSummary(card, month, transactions), [card, month, transactions]);
  const payments = transactions.filter((t) => t.kind === "card_payment" && t.card_id === card.id && t.invoice_month === month);
  const status = STATUS[inv.status];

  async function toggleArchive() {
    try {
      await setCardArchived(card.id, !card.archived);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    }
  }

  async function remove() {
    const count = transactions.filter((t) => t.card_id === card.id).length;
    const msg =
      count > 0
        ? `Excluir o cartão "${card.name}" e seus ${count} lançamentos? Isso não pode ser desfeito. Se quiser só escondê-lo, use Arquivar.`
        : `Excluir o cartão "${card.name}"?`;
    if (!window.confirm(msg)) return;
    try {
      await deleteCard(card.id);
      await reload();
      router.replace("/cartoes");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao excluir.");
    }
  }

  return (
    <>
      <PageHeader
        title={card.name}
        back="/cartoes"
        subtitle={`Fecha dia ${card.closing_day} · vence dia ${card.due_day}`}
        action={
          <IconButton label="Editar cartão" onClick={() => setEditing(true)}>
            <Pencil className="size-5" />
          </IconButton>
        }
      />

      <div className="flex items-center justify-between rounded-full bg-surface-2 p-1">
        <IconButton label="Fatura anterior" className="size-9" onClick={() => setMonth(addMonths(month, -1))}>
          <ChevronLeft className="size-5" />
        </IconButton>
        <span className="text-sm font-semibold">Fatura de {monthLabel(month)}</span>
        <IconButton label="Próxima fatura" className="size-9" onClick={() => setMonth(addMonths(month, 1))}>
          <ChevronRight className="size-5" />
        </IconButton>
      </div>

      <section className="card mt-4 p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted">Total da fatura</p>
            <p className="num text-3xl font-bold">{formatMoney(inv.total)}</p>
          </div>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted">Fechamento</dt>
            <dd className="font-medium">{fullDate(inv.closingDate)}</dd>
          </div>
          <div>
            <dt className="text-muted">Vencimento</dt>
            <dd className="font-medium">{fullDate(inv.dueDate)}</dd>
          </div>
          {inv.credits > 0 ? (
            <div>
              <dt className="text-muted">Créditos/estornos</dt>
              <dd className="num font-medium">{formatMoney(inv.credits)}</dd>
            </div>
          ) : null}
          {inv.paid > 0 ? (
            <div>
              <dt className="text-muted">Pago</dt>
              <dd className="num font-medium">{formatMoney(inv.paid)}</dd>
            </div>
          ) : null}
        </dl>
        {inv.remaining > 0 ? (
          <Button className="mt-5 w-full" onClick={() => setPaying(true)}>
            <Receipt className="size-5" /> Pagar fatura ({formatMoney(inv.remaining)})
          </Button>
        ) : null}
      </section>

      <ErrorBox>{error}</ErrorBox>

      <section className="mt-6">
        <h2 className="mb-2 text-lg font-bold">Compras</h2>
        <div className="card p-1.5">
          {inv.items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Nenhuma compra nesta fatura.</p>
          ) : (
            inv.items.map((t) => <TransactionRow key={t.id} t={t} showDate />)
          )}
        </div>
      </section>

      {payments.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-2 text-lg font-bold">Pagamentos</h2>
          <div className="card p-1.5">
            {payments.map((t) => (
              <TransactionRow key={t.id} t={t} showDate />
            ))}
          </div>
        </section>
      ) : null}

      <div className="mt-8 flex flex-col gap-2">
        <Button variant="secondary" onClick={toggleArchive}>
          {card.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
          {card.archived ? "Desarquivar cartão" : "Arquivar cartão"}
        </Button>
        <Button variant="danger" onClick={remove}>
          <Trash2 className="size-4" /> Excluir cartão
        </Button>
      </div>

      <Sheet open={editing} onClose={() => setEditing(false)} title="Editar cartão">
        <CardForm card={card} onDone={() => setEditing(false)} />
      </Sheet>
      <Sheet open={paying} onClose={() => setPaying(false)} title="Pagar fatura">
        <PayInvoiceForm card={card} month={month} remaining={inv.remaining} onDone={() => setPaying(false)} />
      </Sheet>
    </>
  );
}

function PayInvoiceForm({ card, month, remaining, onDone }: { card: CreditCard; month: string; remaining: number; onDone: () => void }) {
  const { accounts, reload } = useData();
  const active = accounts.filter((a) => !a.archived);
  const [amount, setAmount] = useState<number | null>(remaining);
  const [accountId, setAccountId] = useState(active[0]?.id ?? "");
  const [date, setDate] = useState(today());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || amount <= 0) return setError("Informe o valor pago.");
    if (!accountId) return setError("Escolha a conta de onde saiu o dinheiro.");
    setSaving(true);
    try {
      await createTransaction(
        {
          kind: "card_payment",
          description: `Fatura ${card.name} ${monthLabel(month, false).toLowerCase()}`,
          amount,
          date,
          categoryId: null,
          accountId,
          cardId: card.id,
          toAccountId: null,
          installments: 1,
          notes: null,
          invoiceMonth: month,
        },
        card,
      );
      await reload();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao registrar pagamento.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-ink-2">
        O valor sai da conta escolhida e abate a fatura de {monthLabel(month)}. Ele não conta como despesa, porque as compras já foram contadas.
      </p>
      <Field label="Valor pago">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} large />}</Field>
      <Field label="Pago com a conta">
        {(id) => (
          <select id={id} className="field" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {active.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Data do pagamento">
        {(id) => <input id={id} type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />}
      </Field>
      <ErrorBox>{error}</ErrorBox>
      <Button type="submit" loading={saving} className="w-full">
        Registrar pagamento
      </Button>
      {active.length === 0 ? (
        <p className="text-sm text-muted">
          Cadastre uma conta em <Link href="/contas" className="text-brand">Contas</Link> primeiro.
        </p>
      ) : null}
    </form>
  );
}
