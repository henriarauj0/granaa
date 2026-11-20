"use client";

import { CheckCircle2, FileUp, Info } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useData } from "@/components/data-provider";
import { Badge, Button, ErrorBox, Field, PageHeader, Segmented } from "@/components/ui";
import { insertImported } from "@/lib/api";
import { addMonths, fullDate, monthLabel } from "@/lib/dates";
import { currentInvoiceMonth, invoiceMonthFor } from "@/lib/finance";
import { buildCategorizer, importKey, looksLikeCardPayment, normalizeDescription } from "@/lib/import/categorize";
import { decodeFile, parseStatement, rowsFromCsv, type CsvMapping, type ParseResult, type StatementRow } from "@/lib/import/parse";
import { formatMoney } from "@/lib/money";
import type { NewTransaction } from "@/lib/types";

interface PreviewRow extends StatementRow {
  key: string;
  include: boolean;
  duplicate: boolean;
  payment: boolean;
  isExpense: boolean;
  categoryId: string;
}

type Sign = "negative" | "positive";

export default function ImportarPage() {
  const { accounts, cards, categories, transactions, reload, cardById } = useData();
  const activeAccounts = accounts.filter((a) => !a.archived);
  const activeCards = cards.filter((c) => !c.archived);
  const fileInput = useRef<HTMLInputElement>(null);

  const [target, setTarget] = useState(activeAccounts[0] ? `a:${activeAccounts[0].id}` : "");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [mapping, setMapping] = useState<CsvMapping | null>(null);
  const [sign, setSign] = useState<Sign>("negative");
  const [invoice, setInvoice] = useState("auto");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ inserted: number; skipped: number } | null>(null);

  const card = target.startsWith("c:") ? cardById.get(target.slice(2)) ?? null : null;
  const targetId = target.slice(2);

  const existingKeys = useMemo(() => new Set(transactions.map((t) => t.import_id).filter(Boolean) as string[]), [transactions]);
  const categorize = useMemo(() => buildCategorizer(categories, transactions), [categories, transactions]);

  function buildPreview(source: StatementRow[], s: Sign, tgt: string) {
    const tid = tgt.slice(2);
    const isCard = tgt.startsWith("c:");
    const seen = new Map<string, number>();
    return source.map<PreviewRow>((r) => {
      const base = `${r.date}|${r.amount}|${normalizeDescription(r.description)}`;
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      const key = importKey(tid, r, n);
      const isExpense = s === "negative" ? r.amount < 0 : r.amount > 0;
      const duplicate = existingKeys.has(key);
      const payment = looksLikeCardPayment(r.description) && (isCard || isExpense);
      return {
        ...r,
        key,
        isExpense,
        duplicate,
        payment,
        include: !duplicate && !payment,
        categoryId: categorize(r.description, isExpense ? "expense" : "income") ?? "",
      };
    });
  }

  function applyParsed(result: ParseResult, map: CsvMapping | null, tgt: string) {
    let source = result.rows;
    if (result.format === "csv" && result.csv && map) source = rowsFromCsv(result.csv, map).rows;
    // cartões costumam exportar gastos como positivos; contas, como negativos
    const positives = source.filter((r) => r.amount > 0).length;
    const s: Sign = tgt.startsWith("c:") && result.format === "csv" && positives > source.length / 2 ? "positive" : "negative";
    setSign(s);
    setRows(buildPreview(source, s, tgt));
  }

  async function onFile(file: File) {
    setError(null);
    setDone(null);
    setFileName(file.name);
    if (file.size > 5 * 1024 * 1024) return setError("Arquivo muito grande (máximo 5 MB).");
    try {
      const text = decodeFile(await file.arrayBuffer());
      const result = parseStatement(text);
      setParsed(result);
      setMapping(result.mapping ?? null);
      applyParsed(result, result.mapping ?? null, target);
      if (result.format === "ofx" && result.rows.length === 0) setError("Não encontrei lançamentos neste arquivo.");
    } catch {
      setError("Não consegui ler este arquivo. Use um extrato em OFX ou CSV.");
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
    setRows((prev) => buildPreview(prev, next, target));
  }

  const selected = rows.filter((r) => r.include);
  const totals = selected.reduce(
    (acc, r) => (r.isExpense ? { ...acc, out: acc.out + Math.abs(r.amount) } : { ...acc, in: acc.in + Math.abs(r.amount) }),
    { in: 0, out: 0 },
  );

  async function runImport() {
    if (!target) return setError("Escolha a conta ou o cartão de destino.");
    setBusy(true);
    setError(null);
    try {
      const toInsert: NewTransaction[] = selected.map((r) => ({
        kind: r.isExpense ? "expense" : "income",
        description: r.description,
        amount: Math.abs(r.amount),
        date: r.date,
        category_id: r.categoryId || null,
        account_id: card ? null : targetId,
        card_id: card ? card.id : null,
        to_account_id: null,
        invoice_month: card ? (invoice === "auto" ? invoiceMonthFor(r.date, card.closing_day, card.due_day) : invoice) : null,
        installment_number: null,
        installment_total: null,
        installment_group: null,
        import_id: r.key,
        notes: null,
      }));
      const inserted = await insertImported(toInsert);
      await reload();
      setDone({ inserted, skipped: toInsert.length - inserted });
      setRows([]);
      setParsed(null);
      setFileName("");
      if (fileInput.current) fileInput.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao importar.");
    } finally {
      setBusy(false);
    }
  }

  const invoiceOptions = card
    ? Array.from({ length: 6 }, (_, i) => addMonths(currentInvoiceMonth(card), i - 4))
    : [];
  const kindCats = (expense: boolean) => categories.filter((c) => c.kind === (expense ? "expense" : "income"));

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
          <span className="font-semibold">{fileName || "Escolher arquivo OFX ou CSV"}</span>
          <span className="text-xs text-muted">O arquivo é lido no seu aparelho; só os lançamentos escolhidos são salvos.</span>
          <input
            ref={fileInput}
            type="file"
            accept=".ofx,.csv,.txt,text/csv,application/x-ofx"
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
            No app ou site do banco, procure por “Extrato” e a opção de exportar ou compartilhar. Prefira o formato OFX (também chamado de
            “Money” ou “Quicken”), que traz um identificador para cada lançamento e evita duplicidade. CSV também funciona. Para cartões, exporte a
            fatura em CSV.
          </p>
        </details>

        <ErrorBox>{error}</ErrorBox>

        {parsed?.format === "csv" && parsed.csv ? (
          <section className="card space-y-3 p-4">
            <h2 className="font-semibold">Colunas do arquivo</h2>
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
            </div>
            {mapping?.amount == null && mapping?.credit != null ? (
              <p className="text-xs text-muted">Usando colunas separadas de crédito e débito.</p>
            ) : null}
          </section>
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

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-semibold">
                  {selected.length} de {rows.length} selecionados
                </h2>
                <div className="flex gap-3 text-sm font-semibold text-brand">
                  <button onClick={() => setRows((p) => p.map((r) => ({ ...r, include: !r.duplicate })))}>Todos</button>
                  <button onClick={() => setRows((p) => p.map((r) => ({ ...r, include: false })))}>Nenhum</button>
                </div>
              </div>
              <ul className="card divide-y divide-line overflow-hidden">
                {rows.map((r, i) => (
                  <li key={r.key} className={`flex gap-3 p-3 ${r.include ? "" : "opacity-55"}`}>
                    <input
                      type="checkbox"
                      className="mt-1 size-5 shrink-0 accent-[var(--brand)]"
                      aria-label={`Importar ${r.description}`}
                      checked={r.include}
                      onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))}
                    />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 break-words text-sm font-medium">{r.description}</p>
                        <span className={`num shrink-0 text-sm font-semibold ${r.isExpense ? "text-expense" : "text-income"}`}>
                          {r.isExpense ? "− " : "+ "}
                          {formatMoney(Math.abs(r.amount))}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                        <span>{fullDate(r.date)}</span>
                        {r.duplicate ? <Badge tone="warning">já importado</Badge> : null}
                        {r.payment ? <Badge tone="warning">parece pagamento de fatura</Badge> : null}
                      </div>
                      <select
                        aria-label={`Categoria de ${r.description}`}
                        className="field min-h-10 text-sm"
                        value={r.categoryId}
                        onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, categoryId: e.target.value } : x)))}
                      >
                        <option value="">Sem categoria</option>
                        {kindCats(r.isExpense).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </li>
                ))}
              </ul>
              {rows.some((r) => r.payment) ? (
                <p className="mt-2 px-1 text-xs text-muted">
                  Pagamentos de fatura vêm desmarcados: as compras do cartão já contam como gasto. Registre o pagamento pela tela do cartão.
                </p>
              ) : null}
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

            <div className="safe-bottom sticky bottom-24 z-10 rounded-2xl border border-line bg-surface p-3 shadow-lg">
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-income">Entradas {formatMoney(totals.in)}</span>
                <span className="text-expense">Saídas {formatMoney(totals.out)}</span>
              </div>
              <Button className="w-full" onClick={runImport} loading={busy} disabled={selected.length === 0 || !target}>
                Importar {selected.length} {selected.length === 1 ? "lançamento" : "lançamentos"}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}

const emptyMap: CsvMapping = { date: -1, description: -1, amount: null, credit: null, debit: null };

function ColumnSelect({ label, headers, value, onChange }: { label: string; headers: string[]; value: number; onChange: (v: number) => void }) {
  return (
    <Field label={label}>
      {(id) => (
        <select id={id} className="field text-sm" value={value} onChange={(e) => onChange(Number(e.target.value))}>
          <option value={-1}>—</option>
          {headers.map((h, i) => (
            <option key={i} value={i}>
              {h || `Coluna ${i + 1}`}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}
