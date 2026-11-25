"use client";

import { CreditCard as CardIcon, Plus } from "lucide-react";
import Link from "next/link";
import { createElement, useState } from "react";
import { CardForm } from "@/components/card-form";
import { useData } from "@/components/data-provider";
import { iconFor } from "@/components/icons";
import { Button, EmptyState, IconButton, PageHeader, ProgressBar, Sheet } from "@/components/ui";
import { fullDate } from "@/lib/dates";
import { cardUsedLimit, currentInvoiceMonth, invoiceSummary } from "@/lib/finance";
import { formatMoney } from "@/lib/money";

export default function CartoesPage() {
  const { cards, transactions } = useData();
  const [creating, setCreating] = useState(false);
  const active = cards.filter((c) => !c.archived);
  const archived = cards.filter((c) => c.archived);

  return (
    <>
      <PageHeader
        title="Cartões"
        action={
          <IconButton label="Adicionar cartão" onClick={() => setCreating(true)} className="bg-surface-2">
            <Plus className="size-5" />
          </IconButton>
        }
      />
      {active.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<CardIcon className="size-6" />}
            title="Nenhum cartão"
            text="Cadastre o cartão com os dias de fechamento e vencimento para acompanhar as faturas e o limite."
            action={<Button onClick={() => setCreating(true)}>Adicionar cartão</Button>}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {active.map((card) => {
            const inv = invoiceSummary(card, currentInvoiceMonth(card), transactions);
            const used = cardUsedLimit(card, transactions);
            const available = Math.max(0, card.limit_amount - used);
            return (
              <Link key={card.id} href={`/cartoes/${card.id}`} className="block overflow-hidden rounded-3xl shadow-md">
                <div className="p-5 text-white" style={{ background: `linear-gradient(135deg, ${card.color}, color-mix(in oklab, ${card.color} 70%, black))` }}>
                  <div className="flex items-start justify-between">
                    <p className="text-lg font-bold">{card.name}</p>
                    <CardGlyph icon={card.icon} />
                  </div>
                  <p className="mt-6 text-xs opacity-80">Fatura atual</p>
                  <p className="num text-3xl font-bold">{formatMoney(inv.total)}</p>
                  <p className="mt-1 text-xs opacity-80">
                    Fecha {fullDate(inv.closingDate)} · vence {fullDate(inv.dueDate)}
                  </p>
                </div>
                <div className="space-y-2 bg-surface p-4">
                  <ProgressBar value={card.limit_amount > 0 ? used / card.limit_amount : 0} color={card.color} label={`Limite usado do ${card.name}`} />
                  <div className="flex justify-between text-xs text-muted">
                    <span>
                      Usado <strong className="num text-ink">{formatMoney(used)}</strong>
                    </span>
                    <span>
                      Disponível <strong className="num text-ink">{formatMoney(available)}</strong>
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {archived.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-muted">Arquivados</h2>
          <div className="card divide-y divide-line">
            {archived.map((c) => (
              <Link key={c.id} href={`/cartoes/${c.id}`} className="block p-4 text-ink-2">
                {c.name}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <Sheet open={creating} onClose={() => setCreating(false)} title="Novo cartão">
        <CardForm onDone={() => setCreating(false)} />
      </Sheet>
    </>
  );
}

function CardGlyph({ icon }: { icon?: string | null }) {
  // ícones vêm de uma tabela fixa; createElement evita o aviso de componente criado na renderização
  return createElement(iconFor(icon) ?? CardIcon, { className: "size-6 opacity-80", "aria-hidden": true });
}
