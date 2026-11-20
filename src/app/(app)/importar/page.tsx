"use client";

import { CheckCircle2, FileUp, Info } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useData } from "@/components/data-provider";
import { Badge, Button, ErrorBox, Field, PageHeader, Segmented } from "@/components/ui";
import { insertImported } from "@/lib/api";
import { addMonths, fullDate, monthLabel } from "@/lib/dates";
import { currentInvoiceMonth, invoiceMonthFor } from "@/lib/finance";
import {
  bankCategoryToId,
  buildCategorizer,
  findReversalPairs,
  importKey,
  isSelfTransfer,
  looksLikeCardPayment,
  normalizeDescription,
} from "@/lib/import/categorize";
import { parseStatementFile, rowsFromCsv, type CsvMapping, type ParseResult, type StatementRow } from "@/lib/import/parse";
import { formatMoney } from "@/lib/money";
import type { NewTransaction, Transaction } from "@/lib/types";

/** "expense" | "income" | "skip" | "transfer:<id da outra conta>" */
type Action = string;
type Sign = "negative" | "positive";
type Flag = "duplicate" | "payment" | "self" | "reversal" | "transferExists";

interface PreviewRow extends StatementRow {
  key: string;
  natural: "expense" | "income";
  action: Action;
  flags: Flag[];
  categoryId: string;
}

const FLAG_LABEL: Record<Flag, string> = {
  duplicate: "já importado",
  payment: "parece pagamento de fatura",
  self: "entre suas contas",
  reversal: "estornado",
  transferExists: "transferência já registrada",
};

const party = (r: StatementRow) => normalizeDescription(r.counterparty ?? r.description);

export default function ImportarPage() {
  const { accounts, cards, categories, transactions, reload, cardById, profile } = useData();
  const activeAccounts = accounts.filter((a) => !a.archived);
  const activeCards = cards.filter((c) => !c.archived);
  const fileInput = useRef<HTMLInputElement>(null);

  const [target, setTarget] = useState(activeAccounts[0] ? `a:${activeAccounts[0].id}` : "");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [mapping, setMapping] = useState<CsvMapping | null>(null);
  const [source, setSource] = useState<StatementRow[]>([]);
  const [sign, setSign] = useState<Sign>("negative");
  const [selfAction, setSelfAction] = useState<Action>("skip");
  const [invoice, setInvoice] = useState("auto");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ inserted: number; skipped: number } | null>(null);

  const card = target.startsWith("c:") ? cardById.get(target.slice(2)) ?? null : null;
  const targetId = target.slice(2);
  const otherAccounts = activeAccounts.filter((a) => a.id !== targetId);

  const existingKeys = useMemo(() => new Set(transactions.map((t) => t.import_id).filter(Boolean) as string[]), [transactions]);
  const categorize = useMemo(() => buildCategorizer(categories, transactions), [categories, transactions]);

  function suggestCategory(r: StatementRow, kind: "expense" | "income") {
    return categorize(r.description, kind) ?? bankCategoryToId(r.bankCategory, kind, categories) ?? "";
  }

  /** Transferência já lançada a partir do extrato da outra conta. */
  function transferAlreadyExists(r: StatementRow, accountId: string, all: Transaction[]) {
    const amount = Math.abs(r.amount);
    const day = Date.parse(r.date);
    return all.some(
      (t) =>
        t.kind === "transfer" &&
        Math.abs(t.amount - amount) < 0.005 &&
        Math.abs(Date.parse(t.date) - day) <= 86400000 &&
        (r.amount < 0 ? t.account_id === accountId : t.to_account_id === accountId) &&
        !(t.import_id ?? "").startsWith(`${accountId}:`),
    );
  }

  function buildPreview(list: StatementRow[], s: Sign, tgt: string, selfDefault: Action): PreviewRow[] {
    const tid = tgt.slice(2);
    const isCard = tgt.startsWith("c:");
    const seen = new Map<string, number>();
    const reversals = findReversalPairs(list);
    return list.map<PreviewRow>((r, i) => {
      const base = `${r.date}|${r.amount}|${normalizeDescription(r.description)}`;
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      const key = importKey(tid, r, n);
      const natural = (s === "negative" ? r.amount < 0 : r.amount > 0) ? "expense" : "income";
      const flags: Flag[] = [];
      if (existingKeys.has(key)) flags.push("duplicate");
      if (looksLikeCardPayment(r.description) && (isCard || natural === "expense")) flags.push("payment");
      if (reversals.has(i)) flags.push("reversal");
      const self = !isCard && isSelfTransfer(r, profile?.full_name);
      if (self) flags.push("self");
      if (self && transferAlreadyExists(r, tid, transactions)) flags.push("transferExists");

      let action: Action = natural;
      if (flags.includes("duplicate") || flags.includes("payment") || flags.includes("reversal") || flags.includes("transferExists")) {
        action = "skip";
      } else if (self) action = selfDefault;
      return { ...r, key, natural, action, flags, categoryId: suggestCategory(r, natural) };
    });
  }

  function refresh(list: StatementRow[], s: Sign, tgt: string, selfDefault: Action) {
    setRows(buildPreview(list, s, tgt, selfDefault));
  }

  function defaultSelfAction(tgt: string): Action {
    // por padrão, aponta para uma conta de investimento, se existir
    const others = activeAccounts.filter((a) => a.id !== tgt.slice(2));
    const inv = others.find((a) => a.type === "investimento");
    return inv ? `transfer:${inv.id}` : "skip";
  }

  function applyParsed(result: ParseResult, map: CsvMapping | null, tgt: string) {
    let list = result.rows;
    if (result.csv && map) list = rowsFromCsv(result.csv, map).rows;
    // cartões costumam exportar gastos como positivos; contas, como negativos
    const positives = list.filter((r) => r.amount > 0).length;
    const s: Sign = tgt.startsWith("c:") && result.format !== "ofx" && positives > list.length / 2 ? "positive" : "negative";
    const selfDefault = defaultSelfAction(tgt);
    setSource(list);
    setSign(s);
    setSelfAction(selfDefault);
    refresh(list, s, tgt, selfDefault);
  }

  async function onFile(file: File) {
    setError(null);
    setDone(null);
    setFileName(file.name);
    setRows([]);
    setParsed(null);
    if (file.size > 10 * 1024 * 1024) return setError("Arquivo muito grande (máximo 10 MB).");
    try {
      const result = parseStatementFile(await file.arrayBuffer());
      setParsed(result);
      setMapping(result.mapping ?? null);
      applyParsed(result, result.mapping ?? null, target);
      if (result.rows.length === 0 && !result.csv) setError("Não encontrei lançamentos neste arquivo.");
    } catch (e) {
      setError(e instanceof Error && e.message.length < 200 ? e.message : "Não consegui ler este arquivo. Use um extrato em OFX, CSV ou XLS.");
    }
  }

  function changeTarget(next: string) {
    setTarget(next);
    setInvoice("auto");
    if (parsed) applyParsed(parsed, mapping, next);
  }

  function changeMapping(next: CsvMapping) {
    setMapping(next);
    if (parsed) applyParsed(parsed, next, target);
  }

  function changeSign(next: Sign) {
    setSign(next);
    refresh(source, next, target, selfAction);
  }

  function changeSelfAction(next: Action) {
    setSelfAction(next);
    setRows((prev) => prev.map((r) => (r.flags.includes("self") && !r.flags.includes("transferExists") && !r.flags.includes("duplicate") ? { ...r, action: next } : r)));
  }

  function setRowAction(i: number, action: Action) {
    setRows((prev) =>
      prev.map((r, j) => {
        if (j !== i) return r;
        const kind = action === "income" || action === "expense" ? action : null;
        // ao trocar despesa ↔ receita, a categoria sugerida muda de tipo
        const categoryId = kind && kind !== r.action ? suggestCategory(r, kind) : r.categoryId;
        return { ...r, action, categoryId };
      }),
    );
  }

  /** Escolher a categoria de uma linha aplica o mesmo às linhas iguais ainda sem categoria. */
  function setRowCategory(i: number, categoryId: string) {
    setRows((prev) => {
      const ref = prev[i];
      const p = party(ref);
      return prev.map((r, j) =>
        j === i || (categoryId && r.categoryId === "" && r.action === ref.action && party(r) === p) ? { ...r, categoryId } : r,
      );
    });
  }

  const included = rows.filter((r) => r.action !== "skip");
  const totals = included.reduce(
    (acc, r) => {
      if (r.action === "expense") acc.out += Math.abs(r.amount);
      else if (r.action === "income") acc.in += Math.abs(r.amount);
      else acc.transfers += 1;
      return acc;
    },
    { in: 0, out: 0, transfers: 0 },
  );
  const selfCount = rows.filter((r) => r.flags.includes("self")).length;
  const uncategorized = included.filter((r) => (r.action === "expense" || r.action === "income") && !r.categoryId).length;

  async function runImport() {
    if (!target) return setError("Escolha a conta ou o cartão de destino.");
    setBusy(true);
    setError(null);
    try {
      const toInsert: NewTransaction[] = included.map((r) => {
        const common = {
          description: r.description,
          amount: Math.abs(r.amount),
          date: r.date,
          installment_number: null,
          installment_total: null,
          installment_group: null,
          import_id: r.key,
          notes: r.operation && !r.description.startsWith(r.operation) ? r.operation : null,
        };
        if (r.action.startsWith("transfer:")) {
          const other = r.action.slice("transfer:".length);
          return {
            ...common,
            kind: "transfer" as const,
            category_id: null,
            account_id: r.amount < 0 ? targetId : other,
            to_account_id: r.amount < 0 ? other : targetId,
            card_id: null,
            invoice_month: null,
          };
        }
        return {
          ...common,
          kind: r.action as "expense" | "income",
          category_id: r.categoryId || null,
          account_id: card ? null : targetId,
          card_id: card ? card.id : null,
          to_account_id: null,
          invoice_month: card ? (invoice === "auto" ? invoiceMonthFor(r.date, card.closing_day, card.due_day) : invoice) : null,
        };
      });
      const inserted = await insertImported(toInsert);
      await reload();
      setDone({ inserted, skipped: toInsert.length - inserted });
      setRows([]);
      setSource([]);
      setParsed(null);
      setFileName("");
      if (fileInput.current) fileInput.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao importar.");
    } finally {
      setBusy(false);
    }
  }

  const invoiceOptions = card ? Array.from({ length: 6 }, (_, i) => addMonths(currentInvoiceMonth(card), i - 4)) : [];
  const kindCats = (kind: string) => categories.filter((c) => c.kind === kind);

  return (
    <>
      <PageHeader title="Importar extrato" back="/lancamentos" />

      {done ? (
        <div className="card mb-5 flex items-start gap-3 p-4">
          <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-income" />
          <div>
            <p className="font-semibold">
              {done.inserted} {done.inserted === 1 ? "lançamento importado" : "lançamentos importados"}
            </p>
            {done.skipped > 0 ? <p className="text-sm text-muted">{done.skipped} já existiam e foram ignorados.</p> : null}
            <Link href="/lancamentos" className="mt-1 inline-block text-sm font-semibold text-brand">
              Ver lançamentos
            </Link>
          </div>
        </div>
      ) : null}

      <div className="space-y-4">
        <Field label="Importar para">
          {(id) => (
            <select id={id} className="field" value={target} onChange={(e) => changeTarget(e.target.value)}>
              <option value="">Escolha…</option>
              {activeAccounts.length ? (
                <optgroup label="Contas">
                  {activeAccounts.map((a) => (
                    <option key={a.id} value={`a:${a.id}`}>
                      {a.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {activeCards.length ? (
                <optgroup label="Cartões de crédito">
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

        <label className="card flex cursor-pointer flex-col items-center gap-2 border-dashed p-6 text-center hover:bg-surface-2">
          <FileUp className="size-8 text-brand" />
          <span className="font-semibold">{fileName || "Escolher arquivo OFX, CSV ou XLS"}</span>
          <span className="text-xs text-muted">O arquivo é lido no seu aparelho; só os lançamentos escolhidos são salvos.</span>
          <input
            ref={fileInput}
            type="file"
            accept=".ofx,.csv,.txt,.xls,text/csv,application/x-ofx,application/vnd.ms-excel"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
        </label>

        <details className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-ink-2">
          <summary className="flex cursor-pointer items-center gap-2 font-medium text-ink">
            <Info className="size-4" /> Onde baixo o extrato?
          </summary>
          <p className="mt-2">
            No app ou site do banco, procure por “Extrato” e a opção de exportar. OFX (também chamado de “Money” ou “Quicken”) é o formato mais
            seguro contra duplicidade. CSV e Excel 97-2003 (.xls) também funcionam. Para cartões, exporte a fatura em CSV.
          </p>
        </details>

        <ErrorBox>{error}</ErrorBox>

        {parsed?.csv ? (
          <details className="card p-4" open={!parsed.mapping}>
            <summary className="cursor-pointer font-semibold">
              Colunas do arquivo{parsed.mapping ? <span className="ml-2 text-xs font-normal text-muted">identificadas automaticamente</span> : null}
            </summary>
            <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <ColumnSelect label="Data" headers={parsed.csv.headers} value={mapping?.date ?? -1} onChange={(v) => changeMapping({ ...(mapping ?? emptyMap), date: v })} />
              <ColumnSelect
                label="Descrição"
                headers={parsed.csv.headers}
                value={mapping?.description ?? -1}
                onChange={(v) => changeMapping({ ...(mapping ?? emptyMap), description: v })}
              />
              <ColumnSelect
                label="Valor"
                headers={parsed.csv.headers}
                value={mapping?.amount ?? -1}
                onChange={(v) => changeMapping({ ...(mapping ?? emptyMap), amount: v < 0 ? null : v, credit: null, debit: null })}
              />
              <ColumnSelect
                label="Tipo (opcional)"
                headers={parsed.csv.headers}
                value={mapping?.type ?? -1}
                onChange={(v) => changeMapping({ ...(mapping ?? emptyMap), type: v < 0 ? null : v })}
              />
            </div>
            {mapping?.amount == null && mapping?.credit != null ? (
              <p className="text-xs text-muted">Usando colunas separadas de crédito e débito.</p>
            ) : null}
            </div>
          </details>
        ) : null}

        {rows.length > 0 ? (
          <>
            <Field label="Neste arquivo, os gastos aparecem como">
              {() => (
                <Segmented<Sign>
                  label="Sinal dos gastos"
                  value={sign}
                  onChange={changeSign}
                  options={[
                    { value: "negative", label: "Valores negativos" },
                    { value: "positive", label: "Valores positivos" },
                  ]}
                />
              )}
            </Field>

            {card ? (
              <Field label="Fatura" hint="Se o arquivo é de uma fatura específica, escolha-a para todas as compras irem para ela.">
                {(id) => (
                  <select id={id} className="field" value={invoice} onChange={(e) => setInvoice(e.target.value)}>
                    <option value="auto">Calcular pela data de cada compra</option>
                    {invoiceOptions.map((m) => (
                      <option key={m} value={m}>
                        Fatura de {monthLabel(m)}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            ) : null}

            {selfCount > 0 ? (
              <section className="card space-y-2 p-4">
                <h2 className="font-semibold">Movimentações entre suas contas ({selfCount})</h2>
                <p className="text-sm text-ink-2">
                  Pix para o seu próprio nome, aplicações e resgates não são receita nem despesa. Para o saldo desta conta bater com o do banco,
                  registre-os como transferência para outra conta sua (por exemplo, uma conta “Investimentos” ou a do outro banco).
                </p>
                <select className="field" aria-label="O que fazer com as movimentações entre suas contas" value={selfAction} onChange={(e) => changeSelfAction(e.target.value)}>
                  <option value="skip">Não importar</option>
                  {otherAccounts.map((a) => (
                    <option key={a.id} value={`transfer:${a.id}`}>
                      Transferência ↔ {a.name}
                    </option>
                  ))}
                </select>
                {otherAccounts.length === 0 ? (
                  <p className="text-xs text-muted">
                    Você ainda não tem outra conta cadastrada. <Link href="/contas" className="font-semibold text-brand">Criar conta</Link>
                  </p>
                ) : null}
              </section>
            ) : null}

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-semibold">
                  {included.length} de {rows.length} serão importados
                </h2>
                <div className="flex gap-3 text-sm font-semibold text-brand">
                  <button onClick={() => refresh(source, sign, target, selfAction)}>Restaurar</button>
                  <button onClick={() => setRows((p) => p.map((r) => ({ ...r, action: "skip" })))}>Nenhum</button>
                </div>
              </div>
              <ul className="card divide-y divide-line overflow-hidden">
                {rows.map((r, i) => {
                  const skip = r.action === "skip";
                  const isTransfer = r.action.startsWith("transfer:");
                  const tone = isTransfer ? "" : r.action === "expense" ? "text-expense" : r.action === "income" ? "text-income" : "";
                  return (
                    <li key={r.key} className={`space-y-1.5 p-3 ${skip ? "opacity-55" : ""}`}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 break-words text-sm font-medium">{r.description}</p>
                        <span className={`num shrink-0 text-sm font-semibold ${tone}`}>
                          {r.amount < 0 ? "− " : "+ "}
                          {formatMoney(Math.abs(r.amount))}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                        <span>{fullDate(r.date)}</span>
                        {r.flags.map((f) => (
                          <Badge key={f} tone={f === "self" ? "neutral" : "warning"}>
                            {FLAG_LABEL[f]}
                          </Badge>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          aria-label={`Ação para ${r.description}`}
                          className="field min-h-10"
                          value={r.action}
                          onChange={(e) => setRowAction(i, e.target.value)}
                        >
                          <option value="expense">Despesa</option>
                          <option value="income">Receita</option>
                          {!card
                            ? otherAccounts.map((a) => (
                                <option key={a.id} value={`transfer:${a.id}`}>
                                  Transf. ↔ {a.name}
                                </option>
                              ))
                            : null}
                          <option value="skip">Não importar</option>
                        </select>
                        {r.action === "expense" || r.action === "income" ? (
                          <select
                            aria-label={`Categoria de ${r.description}`}
                            className="field min-h-10"
                            value={r.categoryId}
                            onChange={(e) => setRowCategory(i, e.target.value)}
                          >
                            <option value="">Sem categoria</option>
                            {kindCats(r.action).map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 px-1 text-xs text-muted">
                Ao escolher a categoria de uma linha, as outras da mesma origem ainda sem categoria recebem a mesma. Estornos e pagamentos de fatura
                vêm como “Não importar” para não contar o mesmo gasto duas vezes.
              </p>
            </section>

            {parsed?.warnings.length ? (
              <details className="text-xs text-muted">
                <summary>{parsed.warnings.length} linha(s) não reconhecida(s)</summary>
                <ul className="mt-1 list-disc pl-5">
                  {parsed.warnings.slice(0, 20).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </details>
            ) : null}

            <div className="sticky bottom-24 z-10 rounded-2xl border border-line bg-surface p-2.5 shadow-lg">
              <div className="num mb-2 flex flex-wrap justify-between gap-x-3 px-1 text-xs font-medium">
                <span className="text-income">+ {formatMoney(totals.in)}</span>
                <span className="text-expense">− {formatMoney(totals.out)}</span>
                {totals.transfers ? <span className="text-ink-2">{totals.transfers} transf.</span> : null}
                {uncategorized > 0 ? <span className="text-muted">{uncategorized} sem categoria</span> : null}
              </div>
              <Button className="min-h-11 w-full" onClick={runImport} loading={busy} disabled={included.length === 0 || !target}>
                Importar {included.length} {included.length === 1 ? "lançamento" : "lançamentos"}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}

const emptyMap: CsvMapping = { date: -1, description: -1, amount: null, credit: null, debit: null, type: null, category: null };

function ColumnSelect({ label, headers, value, onChange }: { label: string; headers: string[]; value: number; onChange: (v: number) => void }) {
  return (
    <Field label={label}>
      {(id) => (
        <select id={id} className="field" value={value} onChange={(e) => onChange(Number(e.target.value))}>
          <option value={-1}>—</option>
          {headers.map((h, i) => (h ? <option key={i} value={i}>{h}</option> : null))}
        </select>
      )}
    </Field>
  );
}
