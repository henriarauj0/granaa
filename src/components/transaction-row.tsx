"use client";

import { ArrowLeftRight, CreditCard, Receipt } from "lucide-react";
import Link from "next/link";
import { shortDate } from "@/lib/dates";
import type { Transaction } from "@/lib/types";
import { useData } from "./data-provider";
import { Money } from "./ui";

export function TransactionRow({ t, showDate = false }: { t: Transaction; showDate?: boolean }) {
  const { categoryById, accountById, cardById } = useData();
  const category = t.category_id ? categoryById.get(t.category_id) : null;
  const card = t.card_id ? cardById.get(t.card_id) : null;
  const account = t.account_id ? accountById.get(t.account_id) : null;

  let where = card ? card.name : account?.name ?? "";
  if (t.kind === "transfer") where = `${account?.name ?? "?"} → ${t.to_account_id ? accountById.get(t.to_account_id)?.name ?? "?" : "?"}`;
  if (t.kind === "card_payment") where = `${account?.name ?? ""} → ${card?.name ?? ""}`;

  const sign: "income" | "expense" | "neutral" =
    t.kind === "income" ? "income" : t.kind === "expense" ? "expense" : "neutral";
  const color = category?.color ?? "var(--muted)";
  const Icon = t.kind === "transfer" ? ArrowLeftRight : t.kind === "card_payment" ? Receipt : card ? CreditCard : null;
  const initial = (category?.name ?? t.description).charAt(0).toUpperCase();

  return (
    <Link href={`/lancamentos/${t.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-surface-2">
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold"
        style={{ background: `color-mix(in oklab, ${color} 16%, transparent)`, color }}
        aria-hidden
      >
        {Icon && !category ? <Icon className="size-5" /> : initial}
      </span>
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
          {[showDate ? shortDate(t.date) : null, category?.name ?? (t.kind === "transfer" ? "Transferência" : t.kind === "card_payment" ? "Pagamento de fatura" : "Sem categoria"), where]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
      <Money value={t.amount} kind={sign} className="text-sm font-semibold" />
    </Link>
  );
}
