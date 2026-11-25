"use client";

import { ArrowLeftRight, Check, CreditCard, Receipt } from "lucide-react";
import Link from "next/link";
import { shortDate } from "@/lib/dates";
import { NO_CATEGORY, transactionSource } from "@/lib/finance";
import type { Transaction } from "@/lib/types";
import { useData } from "./data-provider";
import { Money } from "./ui";

/**
 * Um lançamento. Tocar abre a edição (onde também dá para excluir).
 * Com `onToggle`, a linha vira uma caixa de seleção, usada na exclusão em lote.
 */
export function TransactionRow({
  t,
  showDate = false,
  boxed = false,
  selected,
  onToggle,
}: {
  t: Transaction;
  showDate?: boolean;
  /** cartão próprio, como na lista de Lançamentos */
  boxed?: boolean;
  selected?: boolean;
  onToggle?: (id: string) => void;
}) {
  const { categoryById, accountById, cardById } = useData();
  const category = t.category_id ? categoryById.get(t.category_id) : null;
  const card = t.card_id ? cardById.get(t.card_id) : null;
  const where = transactionSource(t, (id) => accountById.get(id)?.name, (id) => cardById.get(id)?.name);

  const sign: "income" | "expense" | "neutral" =
    t.kind === "income" ? "income" : t.kind === "expense" ? "expense" : "neutral";
  const color = category?.color ?? "var(--muted)";
  const Icon = t.kind === "transfer" ? ArrowLeftRight : t.kind === "card_payment" ? Receipt : card ? CreditCard : null;
  const initial = (category?.name ?? t.description).charAt(0).toUpperCase();
  const kindName = t.kind === "transfer" ? "Transferência" : t.kind === "card_payment" ? "Pagamento de fatura" : NO_CATEGORY;

  const selecting = onToggle !== undefined;
  const shell = `flex w-full items-center gap-3 text-left ${
    boxed ? "card px-3.5 py-3 hover:bg-surface-2" : "rounded-xl px-2 py-2.5 hover:bg-surface-2"
  } ${selected ? "ring-2 ring-brand" : ""}`;

  const body = (
    <>
      {selecting ? (
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-full border-2 ${
            selected ? "border-brand bg-brand text-on-brand" : "border-line"
          }`}
          aria-hidden
        >
          {selected ? <Check className="size-5" strokeWidth={3} /> : null}
        </span>
      ) : (
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold"
          style={{ background: `color-mix(in oklab, ${color} 18%, transparent)`, color }}
          aria-hidden
        >
          {Icon && !category ? <Icon className="size-5" /> : initial}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {t.description}
          {t.installment_total ? (
            <span className="ml-1 text-xs font-normal text-muted">
              {t.installment_number}/{t.installment_total}
            </span>
          ) : null}
        </span>
        <span className="flex items-center gap-1 truncate text-xs text-muted">
          {card && t.kind !== "card_payment" ? <CreditCard className="size-3 shrink-0" aria-label="Cartão" /> : null}
          {[showDate ? shortDate(t.date) : null, category?.name ?? kindName, where].filter(Boolean).join(" · ")}
        </span>
      </span>
      <Money value={t.amount} kind={sign} className="text-sm font-semibold" />
    </>
  );

  if (selecting) {
    return (
      <button type="button" role="checkbox" aria-checked={!!selected} onClick={() => onToggle(t.id)} className={shell}>
        {body}
      </button>
    );
  }
  return (
    <Link href={`/lancamentos/${t.id}`} className={shell}>
      {body}
    </Link>
  );
}
