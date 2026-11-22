import { byDateAsc, dateRangeLabel } from "../dates";
import { NO_CATEGORY, categoryTotals, periodSummary, transactionSource } from "../finance";
import type { Account, Category, CreditCard, Transaction } from "../types";
import { bold, buildXlsx, date, money, moneyBold, percent, type Cell, type Sheet } from "./xlsx";

export interface ExportLookups {
  accounts: Account[];
  cards: CreditCard[];
  categories: Category[];
}

export interface ExportOptions {
  /** Texto do período, ex.: "Novembro de 2026". */
  period: string;
  /** Filtros aplicados na tela, se houver. */
  filters?: string;
}

export function kindLabel(t: Transaction): string {
  switch (t.kind) {
    case "expense":
      return "Despesa";
    case "income":
      return t.card_id ? "Estorno no cartão" : "Receita";
    case "transfer":
      return "Transferência";
    case "card_payment":
      return "Pagamento de fatura";
  }
}

/**
 * Valor com sinal: receitas e estornos positivos, despesas negativas.
 * Transferências e pagamentos de fatura vão sem sinal; a coluna Tipo
 * diz o que são, e eles ficam fora dos totais do resumo.
 */
export function signedAmount(t: Transaction): number {
  return t.kind === "expense" ? -t.amount : t.amount;
}

export function transactionsSheets(transactions: Transaction[], lookups: ExportLookups, options: ExportOptions): Sheet[] {
  const accountName = new Map(lookups.accounts.map((a) => [a.id, a.name]));
  const cardName = new Map(lookups.cards.map((c) => [c.id, c.name]));
  const categoryName = new Map(lookups.categories.map((c) => [c.id, c.name]));

  const where = (t: Transaction) => transactionSource(t, (id) => accountName.get(id), (id) => cardName.get(id));
  const sorted = [...transactions].sort(byDateAsc);

  const list: Cell[][] = [
    ["Data", "Descrição", "Tipo", "Categoria", "Conta ou cartão", "Parcela", "Valor (R$)", "Observações"],
    ...sorted.map((t): Cell[] => [
      date(t.date),
      t.description,
      kindLabel(t),
      t.category_id ? categoryName.get(t.category_id) ?? "" : "",
      where(t),
      t.installment_total ? `${t.installment_number}/${t.installment_total}` : "",
      money(signedAmount(t)),
      t.notes ?? "",
    ]),
  ];

  const summary = periodSummary(transactions);
  const byCategory = categoryTotals(transactions, lookups.categories);
  const first = sorted[0]?.date;
  const last = sorted[sorted.length - 1]?.date;

  const resumo: Cell[][] = [
    [bold("Período"), options.period],
    ...(first && last ? [[bold("Datas"), dateRangeLabel(first, last)]] : []),
    ...(options.filters ? [[bold("Filtros"), options.filters]] : []),
    [bold("Lançamentos"), transactions.length],
    [],
    [bold("Receitas"), money(summary.income)],
    [bold("Despesas"), money(summary.expense)],
    [bold("Resultado"), moneyBold(summary.balance)],
    [],
    [bold("Gastos por categoria"), bold("Total (R$)"), bold("Participação"), bold("Lançamentos")],
    ...byCategory.map((r): Cell[] => [r.category?.name ?? NO_CATEGORY, money(r.total), percent(r.share), r.count]),
    [],
    ["Transferências entre contas e pagamentos de fatura não entram nas receitas nem nas despesas."],
    ["Estornos no cartão abatem as despesas."],
  ];

  return [
    { name: "Lançamentos", widths: [12, 40, 20, 22, 28, 9, 14, 40], rows: list, header: true },
    { name: "Resumo", widths: [24, 22, 14, 13], rows: resumo },
  ];
}

export function exportTransactions(transactions: Transaction[], lookups: ExportLookups, options: ExportOptions): Uint8Array {
  return buildXlsx(transactionsSheets(transactions, lookups, options));
}
