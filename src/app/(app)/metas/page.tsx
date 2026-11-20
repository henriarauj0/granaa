"use client";

import { Minus, Pencil, PartyPopper, Plus, Target, Trash2 } from "lucide-react";
import { useState } from "react";
import { useData } from "@/components/data-provider";
import { Button, ColorPicker, EmptyState, ErrorBox, Field, IconButton, MoneyInput, PageHeader, ProgressBar, Sheet } from "@/components/ui";
import { deleteGoal, saveGoal, setGoalSaved } from "@/lib/api";
import { fullDate, isValidISODate } from "@/lib/dates";
import { goalProgress, monthlyNeeded } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import type { Goal } from "@/lib/types";

export default function MetasPage() {
  const { goals } = useData();
  const [editing, setEditing] = useState<Goal | "new" | null>(null);
  const [moving, setMoving] = useState<{ goal: Goal; mode: "add" | "remove" } | null>(null);

  const totalSaved = goals.reduce((s, g) => s + g.saved_amount, 0);
  const totalTarget = goals.reduce((s, g) => s + g.target_amount, 0);

  return (
    <>
      <PageHeader
        title="Metas"
        subtitle={goals.length ? `${formatMoney(totalSaved)} acumulados de ${formatMoney(totalTarget)}` : undefined}
        action={
          <IconButton label="Nova meta" onClick={() => setEditing("new")} className="bg-surface-2">
            <Plus className="size-5" />
          </IconButton>
        }
      />

      {goals.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Target className="size-6" />}
            title="Crie sua primeira meta"
            text="Reserva de emergência, viagem, um carro novo... defina o valor-alvo e acompanhe quanto já acumulou, esteja o dinheiro em qualquer conta ou investimento."
            action={<Button onClick={() => setEditing("new")}>Nova meta</Button>}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {goals.map((g) => {
            const p = goalProgress(g.saved_amount, g.target_amount);
            const done = p >= 1;
            const perMonth = monthlyNeeded(g.saved_amount, g.target_amount, g.deadline);
            return (
              <article key={g.id} className="card p-5">
                <div className="flex items-start gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl" style={{ background: `color-mix(in oklab, ${g.color} 16%, transparent)`, color: g.color }}>
                    {done ? <PartyPopper className="size-5" /> : <Target className="size-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-bold">{g.name}</h2>
                    <p className="text-sm text-muted">
                      {g.deadline ? `Até ${fullDate(g.deadline)}` : "Sem prazo"}
                    </p>
                  </div>
                  <IconButton label={`Editar meta ${g.name}`} onClick={() => setEditing(g)} className="-mr-2 -mt-2">
                    <Pencil className="size-4" />
                  </IconButton>
                </div>

                <div className="mt-4 flex items-end justify-between">
                  <p className="num text-2xl font-bold">{formatMoney(g.saved_amount)}</p>
                  <p className="num text-sm text-muted">de {formatMoney(g.target_amount)}</p>
                </div>
                <div className="mt-2">
                  <ProgressBar value={p} color={g.color} label={`Progresso da meta ${g.name}`} />
                </div>
                <p className="mt-2 text-sm text-ink-2">
                  {done
                    ? "Meta atingida! 🎉"
                    : `${Math.floor(p * 100)}% · faltam ${formatMoney(g.target_amount - g.saved_amount)}${
                        perMonth ? ` · acumule ${formatMoney(perMonth)}/mês para chegar no prazo` : ""
                      }`}
                </p>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button variant="secondary" onClick={() => setMoving({ goal: g, mode: "remove" })} disabled={g.saved_amount <= 0}>
                    <Minus className="size-4" /> Diminuir
                  </Button>
                  <Button onClick={() => setMoving({ goal: g, mode: "add" })}>
                    <Plus className="size-4" /> Adicionar
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Nova meta" : "Editar meta"}>
        {editing !== null ? <GoalForm goal={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} /> : null}
      </Sheet>
      <Sheet open={moving !== null} onClose={() => setMoving(null)} title={moving?.mode === "add" ? "Adicionar ao acumulado" : "Diminuir do acumulado"}>
        {moving ? <MoveForm goal={moving.goal} mode={moving.mode} onDone={() => setMoving(null)} /> : null}
      </Sheet>
    </>
  );
}

function GoalForm({ goal, onDone }: { goal?: Goal; onDone: () => void }) {
  const { reload } = useData();
  const [name, setName] = useState(goal?.name ?? "");
  const [target, setTarget] = useState<number | null>(goal?.target_amount ?? null);
  const [saved, setSaved] = useState<number | null>(goal?.saved_amount ?? 0);
  const [deadline, setDeadline] = useState(goal?.deadline ?? "");
  const [color, setColor] = useState(goal?.color ?? "#0B6B45");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Dê um nome para a meta.");
    if (!target || target <= 0) return setError("Informe o valor-alvo.");
    if (deadline && !isValidISODate(deadline)) return setError("Prazo inválido.");
    setBusy(true);
    try {
      await saveGoal({ name: name.trim(), target_amount: target, saved_amount: Math.max(0, saved ?? 0), deadline: deadline || null, color }, goal?.id);
      await reload();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!goal || !window.confirm(`Excluir a meta "${goal.name}"?`)) return;
    setBusy(true);
    try {
      await deleteGoal(goal.id);
      await reload();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Nome da meta">
        {(id) => <input id={id} className="field" maxLength={60} placeholder="Ex.: Reserva de emergência" value={name} onChange={(e) => setName(e.target.value)} />}
      </Field>
      <Field label="Valor-alvo">{(id) => <MoneyInput id={id} value={target} onChange={setTarget} />}</Field>
      <Field label="Valor já acumulado" hint="Some o que já existe para esta meta, em qualquer conta ou investimento.">{(id) => <MoneyInput id={id} value={saved} onChange={setSaved} />}</Field>
      <Field label="Prazo (opcional)" hint="Com prazo, mostramos quanto acumular por mês.">
        {(id) => <input id={id} type="date" className="field" value={deadline} onChange={(e) => setDeadline(e.target.value)} />}
      </Field>
      <Field label="Cor">{() => <ColorPicker value={color} onChange={setColor} />}</Field>
      <ErrorBox>{error}</ErrorBox>
      <Button type="submit" loading={busy} className="w-full">
        {goal ? "Salvar meta" : "Criar meta"}
      </Button>
      {goal ? (
        <Button type="button" variant="danger" className="w-full" onClick={remove} disabled={busy}>
          <Trash2 className="size-4" /> Excluir meta
        </Button>
      ) : null}
    </form>
  );
}

function MoveForm({ goal, mode, onDone }: { goal: Goal; mode: "add" | "remove"; onDone: () => void }) {
  const { reload } = useData();
  const [amount, setAmount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || amount <= 0) return setError("Informe um valor.");
    if (mode === "remove" && amount > goal.saved_amount) return setError(`O acumulado desta meta é ${formatMoney(goal.saved_amount)}.`);
    setBusy(true);
    try {
      await setGoalSaved(goal.id, goal.saved_amount + (mode === "add" ? amount : -amount));
      await reload();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-ink-2">
        {goal.name}: {formatMoney(goal.saved_amount)} de {formatMoney(goal.target_amount)}.
      </p>
      <Field label={mode === "add" ? "Quanto acumulou a mais?" : "Quanto diminuiu?"}>
        {(id) => <MoneyInput id={id} value={amount} onChange={setAmount} autoFocus large />}
      </Field>
      <ErrorBox>{error}</ErrorBox>
      <Button type="submit" loading={busy} className="w-full">
        {mode === "add" ? "Adicionar" : "Diminuir"}
      </Button>
    </form>
  );
}
