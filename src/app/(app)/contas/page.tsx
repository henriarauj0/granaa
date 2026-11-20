"use client";

import { Archive, ArchiveRestore, Landmark, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useData } from "@/components/data-provider";
import { Button, ColorPicker, EmptyState, ErrorBox, Field, IconButton, MoneyInput, PageHeader, Sheet } from "@/components/ui";
import { deleteAccount, saveAccount, setAccountArchived } from "@/lib/api";
import { accountBalance } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { ACCOUNT_TYPE_LABEL, type Account, type AccountType } from "@/lib/types";

export default function ContasPage() {
  const { accounts, transactions } = useData();
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);
  const total = active.reduce((s, a) => s + accountBalance(a, transactions), 0);

  const row = (a: Account) => (
    <button key={a.id} onClick={() => setEditing(a)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-surface-2">
      <span className="flex size-10 items-center justify-center rounded-xl" style={{ background: `color-mix(in oklab, ${a.color} 16%, transparent)`, color: a.color }}>
        <Landmark className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{a.name}</span>
        <span className="text-xs text-muted">{ACCOUNT_TYPE_LABEL[a.type]}</span>
      </span>
      <span className="num font-semibold">{formatMoney(accountBalance(a, transactions))}</span>
    </button>
  );

  return (
    <>
      <PageHeader
        title="Contas"
        back="/mais"
        subtitle={`Saldo total: ${formatMoney(total)}`}
        action={
          <IconButton label="Nova conta" onClick={() => setEditing("new")} className="bg-surface-2">
            <Plus className="size-5" />
          </IconButton>
        }
      />
      {active.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Landmark className="size-6" />} title="Nenhuma conta" action={<Button onClick={() => setEditing("new")}>Nova conta</Button>} />
        </div>
      ) : (
        <div className="card divide-y divide-line overflow-hidden">{active.map(row)}</div>
      )}
      {archived.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-muted">Arquivadas</h2>
          <div className="card divide-y divide-line overflow-hidden opacity-70">{archived.map(row)}</div>
        </section>
      ) : null}
      <p className="mt-4 px-1 text-xs text-muted">O saldo considera o saldo inicial e os lançamentos com data até hoje.</p>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Nova conta" : "Editar conta"}>
        {editing !== null ? <AccountForm account={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} /> : null}
      </Sheet>
    </>
  );
}

function AccountForm({ account, onDone }: { account?: Account; onDone: () => void }) {
  const { reload, transactions } = useData();
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<AccountType>(account?.type ?? "corrente");
  const [initial, setInitial] = useState<number | null>(account?.initial_balance ?? 0);
  const [color, setColor] = useState(account?.color ?? "#2F6FB0");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro.");
      setBusy(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Informe o nome da conta.");
    run(() => saveAccount({ name: name.trim(), type, initial_balance: initial ?? 0, color }, account?.id));
  }

  function remove() {
    if (!account) return;
    const count = transactions.filter((t) => t.account_id === account.id || t.to_account_id === account.id).length;
    const msg = count
      ? `Excluir "${account.name}" e seus ${count} lançamentos? Isso não pode ser desfeito. Para só esconder, use Arquivar.`
      : `Excluir "${account.name}"?`;
    if (window.confirm(msg)) run(() => deleteAccount(account.id));
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Nome">
        {(id) => <input id={id} className="field" maxLength={60} placeholder="Ex.: Banco do Brasil" value={name} onChange={(e) => setName(e.target.value)} />}
      </Field>
      <Field label="Tipo">
        {(id) => (
          <select id={id} className="field" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {Object.entries(ACCOUNT_TYPE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Saldo inicial" hint="Quanto havia na conta antes do primeiro lançamento registrado. Pode ser negativo.">
        {(id) => <MoneyInput id={id} value={initial} onChange={setInitial} allowNegative />}
      </Field>
      <Field label="Cor">{() => <ColorPicker value={color} onChange={setColor} />}</Field>
      <ErrorBox>{error}</ErrorBox>
      <Button type="submit" loading={busy} className="w-full">
        {account ? "Salvar conta" : "Criar conta"}
      </Button>
      {account ? (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={() => run(() => setAccountArchived(account.id, !account.archived))}>
            {account.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
            {account.archived ? "Desarquivar" : "Arquivar"}
          </Button>
          <Button type="button" variant="danger" disabled={busy} onClick={remove}>
            <Trash2 className="size-4" /> Excluir
          </Button>
        </div>
      ) : null}
    </form>
  );
}
