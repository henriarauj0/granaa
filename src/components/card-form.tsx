"use client";

import { useState } from "react";
import { saveCard } from "@/lib/api";
import type { CreditCard } from "@/lib/types";
import { useData } from "./data-provider";
import { Button, ColorPicker, ErrorBox, Field, MoneyInput } from "./ui";

export function CardForm({ card, onDone }: { card?: CreditCard; onDone: () => void }) {
  const { reload } = useData();
  const [name, setName] = useState(card?.name ?? "");
  const [limit, setLimit] = useState<number | null>(card?.limit_amount ?? null);
  const [closing, setClosing] = useState(card?.closing_day ?? 1);
  const [due, setDue] = useState(card?.due_day ?? 10);
  const [color, setColor] = useState(card?.color ?? "#14201A");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Informe o nome do cartão.");
    setSaving(true);
    try {
      await saveCard({ name: name.trim(), limit_amount: limit ?? 0, closing_day: closing, due_day: due, color }, card?.id);
      await reload();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Nome">
        {(id) => <input id={id} className="field" placeholder="Ex.: Nubank" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />}
      </Field>
      <Field label="Limite total">
        {(id) => <MoneyInput id={id} value={limit} onChange={setLimit} />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Dia do fechamento" hint="Compras a partir deste dia vão para a próxima fatura.">
          {(id) => (
            <select id={id} className="field" value={closing} onChange={(e) => setClosing(Number(e.target.value))}>
              {days.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Dia do vencimento">
          {(id) => (
            <select id={id} className="field" value={due} onChange={(e) => setDue(Number(e.target.value))}>
              {days.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <Field label="Cor">{() => <ColorPicker value={color} onChange={setColor} />}</Field>
      <ErrorBox>{error}</ErrorBox>
      <Button type="submit" loading={saving} className="w-full">
        {card ? "Salvar cartão" : "Adicionar cartão"}
      </Button>
    </form>
  );
}
