"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createTransaction, deleteInstallmentGroup, deleteTransaction, updateTransaction } from "@/lib/api";
import { addMonths, fullDate, isValidISODate, monthLabel, today } from "@/lib/dates";
import { invoiceMonthFor } from "@/lib/finance";
import { formatMoney, splitInstallments } from "@/lib/money";
import type { Transaction, TransactionKind } from "@/lib/types";
import { useData } from "./data-provider";
import { Button, ErrorBox, Field, MoneyInput, Segmented } from "./ui";

type FormKind = "expense" | "income" | "transfer";

export function TransactionForm({ original }: { original?: Transaction }) {
  const router = useRouter();
  const { accounts, cards, categories, reload, cardById } = useData();
  const activeAccounts = accounts.filter((a) => !a.archived || a.id === original?.account_id || a.id === original?.to_account_id);
  const activeCards = cards.filter((c) => !c.archived || c.id === original?.card_id);

  const isCardPayment = original?.kind === "card_payment";
  const [kind, setKind] = useState<FormKind>(
    original && original.kind !== "card_payment" ? (original.kind as FormKind) : "expense",
  );
  const [amount, setAmount] = useState<number | null>(original?.amount ?? null);
  const [description, setDescription] = useState(original?.description ?? "");
  const [date, setDate] = useState(original?.date ?? today());
  const [categoryId, setCategoryId] = useState<string>(original?.category_id ?? "");
  // origem: "a:<id>" para conta, "c:<id>" para cartão
  const [source, setSource] = useState<string>(() => {
    if (original?.card_id && !isCardPayment) return `c:${original.card_id}`;
    if (original?.account_id) return `a:${original.account_id}`;
    return activeAccounts[0] ? `a:${activeAccounts[0].id}` : "";
  });
  const [toAccount, setToAccount] = useState<string>(original?.to_account_id ?? "");
  const [installments, setInstallments] = useState(1);
  const [notes, setNotes] = useState(original?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const kindCategories = categories.filter((c) => c.kind === (kind === "income" ? "income" : "expense"));
  const selectedCard = source.startsWith("c:") ? cardById.get(source.slice(2)) ?? null : null;
  const accountId = source.startsWith("a:") ? source.slice(2) : null;
  // lançamento anterior ao acerto de saldo da conta fica só no histórico
  const checkedAccount = [accountId, kind === "transfer" ? toAccount : null]
    .map((id) => accounts.find((a) => a.id === id))
    .find((a) => a?.balance_date && date < a.balance_date);

  const invoicePreview = useMemo(() => {
    if (!selectedCard || !isValidISODate(date)) return null;
    const first = invoiceMonthFor(date, selectedCard.closing_day, selectedCard.due_day);
    return { first, last: addMonths(first, installments - 1) };
  }, [selectedCard, date, installments]);

  function leave() {
    setSaving(false);
    if (window.history.length > 1) router.back();
    else router.replace("/lancamentos");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!amount || amount <= 0) return setError("Informe um valor maior que zero.");
    if (!description.trim()) return setError("Informe uma descrição.");
    if (!isValidISODate(date)) return setError("Data inválida.");
    if (!source && !isCardPayment) return setError("Escolha a conta ou o cartão.");
    if (kind === "transfer") {
      if (!accountId) return setError("Transferências são entre contas.");
      if (!toAccount || toAccount === accountId) return setError("Escolha uma conta de destino diferente.");
    }
    const txKind: TransactionKind = isCardPayment ? "card_payment" : kind;
    const input = {
      kind: txKind,
      description,
      amount,
      date,
      categoryId: categoryId || null,
      accountId: isCardPayment ? original!.account_id : accountId,
      cardId: isCardPayment ? original!.card_id : selectedCard?.id ?? null,
      toAccountId: kind === "transfer" ? toAccount : null,
      installments: kind === "expense" && selectedCard ? installments : 1,
      notes,
      invoiceMonth: isCardPayment ? original!.invoice_month : undefined,
    };
    setSaving(true);
    try {
      const card = input.cardId ? cardById.get(input.cardId) ?? null : null;
      if (original) await updateTransaction(original.id, input, card, original);
      else await createTransaction(input, card);
      await reload();
      leave();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar.");
      setSaving(false);
    }
  }

  async function remove(all: boolean) {
    if (!original) return;
    const msg = all
      ? `Excluir todas as ${original.installment_total} parcelas desta compra?`
      : "Excluir este lançamento?";
    if (!window.confirm(msg)) return;
    setSaving(true);
    try {
      if (all && original.installment_group) await deleteInstallmentGroup(original.installment_group);
      else await deleteTransaction(original.id);
      await reload();
      leave();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-5">
      {isCardPayment ? (
        <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-ink-2">
          Pagamento da fatura de {original?.invoice_month ? monthLabel(original.invoice_month) : ""}.
        </p>
      ) : (
        <Segmented<FormKind>
          label="Tipo de lançamento"
          value={kind}
          onChange={(k) => {
            setKind(k);
            setCategoryId("");
            if (k !== "expense" && source.startsWith("c:") && k === "transfer") {
              setSource(activeAccounts[0] ? `a:${activeAccounts[0].id}` : "");
            }
          }}
          options={[
            { value: "expense", label: "Despesa" },
            { value: "income", label: "Receita" },
            { value: "transfer", label: "Transferência" },
          ]}
        />
      )}

      <Field label="Valor">
        {(id) => <MoneyInput id={id} value={amount} onChange={setAmount} autoFocus={!original} large />}
      </Field>

      <Field label="Descrição">
        {(id) => (
          <input
            id={id}
            className="field"
            maxLength={140}
            placeholder={kind === "income" ? "Ex.: Salário" : kind === "transfer" ? "Ex.: Guardar na poupança" : "Ex.: Mercado"}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Data">
          {(id) => <input id={id} type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />}
        </Field>
        {kind !== "transfer" && !isCardPayment ? (
          <Field label="Categoria">
            {(id) => (
              <select id={id} className="field" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Sem categoria</option>
                {kindCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : null}
      </div>
      {checkedAccount ? (
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink-2">
          A data é anterior ao acerto de saldo de {checkedAccount.name} ({fullDate(checkedAccount.balance_date!)}). O
          lançamento entra no histórico e nos relatórios, mas não muda o saldo de hoje, que já foi conferido com o banco.
        </p>
      ) : null}

      {!isCardPayment ? (
        <Field label={kind === "transfer" ? "De (conta de origem)" : kind === "income" ? "Entrou em" : "Pago com"}>
          {(id) => (
            <select id={id} className="field" value={source} onChange={(e) => setSource(e.target.value)}>
              {activeAccounts.length > 0 ? (
                <optgroup label="Contas">
                  {activeAccounts.map((a) => (
                    <option key={a.id} value={`a:${a.id}`}>
                      {a.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {kind !== "transfer" && activeCards.length > 0 ? (
                <optgroup label={kind === "income" ? "Cartões (estorno/crédito)" : "Cartões de crédito"}>
                  {activeCards.map((c) => (
                    <option key={c.id} value={`c:${c.id}`}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          )}
        </Field>
      ) : null}

      {kind === "transfer" ? (
        <Field label="Para (conta de destino)">
          {(id) => (
            <select id={id} className="field" value={toAccount} onChange={(e) => setToAccount(e.target.value)}>
              <option value="">Escolha…</option>
              {activeAccounts
                .filter((a) => `a:${a.id}` !== source)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          )}
        </Field>
      ) : null}

      {selectedCard && kind === "expense" && !original ? (
        <Field
          label="Parcelas"
          hint={
            installments > 1 && amount
              ? `${installments}× de ${formatMoney(splitInstallments(amount, installments)[1])}`
              : undefined
          }
        >
          {(id) => (
            <select id={id} className="field" value={installments} onChange={(e) => setInstallments(Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? "À vista" : `${n}×`}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : null}

      {invoicePreview && !original ? (
        <p className="rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand">
          {installments > 1
            ? `Parcelas nas faturas de ${monthLabel(invoicePreview.first)} a ${monthLabel(invoicePreview.last)}.`
            : `Entra na fatura de ${monthLabel(invoicePreview.first)}.`}
        </p>
      ) : null}

      {original?.installment_total ? (
        <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-ink-2">
          Parcela {original.installment_number} de {original.installment_total}. As alterações valem só para esta parcela.
        </p>
      ) : null}

      <Field label="Observação (opcional)">
        {(id) => <textarea id={id} className="field min-h-20" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />}
      </Field>

      <ErrorBox>{error}</ErrorBox>

      <Button type="submit" loading={saving} className="w-full">
        {original ? "Salvar alterações" : "Salvar lançamento"}
      </Button>

      {original ? (
        <div className="flex flex-col gap-2">
          <Button type="button" variant="danger" onClick={() => remove(false)} disabled={saving}>
            <Trash2 className="size-4" /> {original.installment_total ? "Excluir esta parcela" : "Excluir lançamento"}
          </Button>
          {original.installment_group ? (
            <Button type="button" variant="ghost" onClick={() => remove(true)} disabled={saving}>
              Excluir todas as parcelas
            </Button>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
