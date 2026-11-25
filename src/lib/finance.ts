import { addMonths, monthKey, parts, today, withDay } from "./dates";
import { cents } from "./money";
import type { Account, Category, CreditCard, Transaction } from "./types";

// ---------------------------------------------------------------------------
// Cartão de crédito
// ---------------------------------------------------------------------------

/**
 * Mês da fatura (mês de vencimento, "YYYY-MM-01") em que cai uma compra.
 * Compras feitas a partir do dia de fechamento entram na fatura seguinte.
 * Se o vencimento é antes ou no dia do fechamento, a fatura vence no mês
 * seguinte ao fechamento.
 */
export function invoiceMonthFor(purchaseDate: string, closingDay: number, dueDay: number): string {
  const closingThisMonth = parts(withDay(purchaseDate, closingDay)).day;
  const { day } = parts(purchaseDate);
  let closingMonth = monthKey(purchaseDate);
  if (day >= closingThisMonth) closingMonth = addMonths(closingMonth, 1);
  return dueDay > closingDay ? closingMonth : addMonths(closingMonth, 1);
}

/** Data de fechamento de uma fatura (identificada pelo mês de vencimento). */
export function invoiceClosingDate(invoiceMonth: string, card: Pick<CreditCard, "closing_day" | "due_day">): string {
  const closingMonth = card.due_day > card.closing_day ? invoiceMonth : addMonths(invoiceMonth, -1);
  return withDay(closingMonth, card.closing_day);
}

export function invoiceDueDate(invoiceMonth: string, card: Pick<CreditCard, "due_day">): string {
  return withDay(invoiceMonth, card.due_day);
}

/** Fatura atualmente aberta (recebendo compras de hoje). */
export function currentInvoiceMonth(card: Pick<CreditCard, "closing_day" | "due_day">, ref = today()): string {
  return invoiceMonthFor(ref, card.closing_day, card.due_day);
}

export type InvoiceStatus = "aberta" | "fechada" | "paga" | "futura" | "vencida";

export interface InvoiceSummary {
  month: string;
  charges: number;
  credits: number;
  paid: number;
  total: number;
  remaining: number;
  closingDate: string;
  dueDate: string;
  status: InvoiceStatus;
  items: Transaction[];
}

export function invoiceSummary(
  card: CreditCard,
  month: string,
  transactions: Transaction[],
  ref = today(),
): InvoiceSummary {
  const items = transactions.filter((t) => t.card_id === card.id && t.invoice_month === month);
  let charges = 0;
  let credits = 0;
  let paid = 0;
  for (const t of items) {
    if (t.kind === "expense") charges += t.amount;
    else if (t.kind === "income") credits += t.amount;
    else if (t.kind === "card_payment") paid += t.amount;
  }
  const total = cents(charges - credits);
  const remaining = cents(Math.max(0, total - paid));
  const closingDate = invoiceClosingDate(month, card);
  const dueDate = invoiceDueDate(month, card);
  let status: InvoiceStatus;
  if (ref < closingDate) status = month === currentInvoiceMonth(card, ref) ? "aberta" : "futura";
  else if (remaining <= 0) status = "paga";
  else if (ref > dueDate) status = "vencida";
  else status = "fechada";
  return {
    month,
    charges: cents(charges),
    credits: cents(credits),
    paid: cents(paid),
    total,
    remaining,
    closingDate,
    dueDate,
    status,
    items: items.filter((t) => t.kind !== "card_payment"),
  };
}

/** Quanto do limite está comprometido (compras - créditos - pagamentos). */
export function cardUsedLimit(card: CreditCard, transactions: Transaction[]): number {
  let used = 0;
  for (const t of transactions) {
    if (t.card_id !== card.id) continue;
    if (t.kind === "expense") used += t.amount;
    else used -= t.amount; // crédito ou pagamento
  }
  return cents(Math.max(0, used));
}

/** Meses de fatura existentes para um cartão, incluindo a fatura atual. */
export function cardInvoiceMonths(card: CreditCard, transactions: Transaction[]): string[] {
  const set = new Set<string>([currentInvoiceMonth(card)]);
  for (const t of transactions) if (t.card_id === card.id && t.invoice_month) set.add(t.invoice_month);
  return [...set].sort();
}

// ---------------------------------------------------------------------------
// Contas
// ---------------------------------------------------------------------------

/** Efeito do lançamento sobre o saldo de uma conta. */
export function accountDelta(t: Transaction, accountId: string): number {
  if (t.kind === "transfer") {
    if (t.account_id === accountId) return -t.amount;
    if (t.to_account_id === accountId) return t.amount;
    return 0;
  }
  if (t.account_id !== accountId) return 0;
  return t.kind === "income" ? t.amount : -t.amount;
}

/**
 * Se o lançamento entra no saldo da conta. Depois de um acerto com o banco,
 * o que tem data anterior ao acerto já estava no saldo conferido; no próprio
 * dia do acerto, só conta o que foi registrado depois dele.
 */
export function countsInBalance(t: Transaction, account: Account, until = today()): boolean {
  if (t.date > until) return false;
  const day = account.balance_date;
  if (!day || t.date > day) return true;
  if (t.date < day) return false;
  const checked = account.balance_checked_at ? Date.parse(account.balance_checked_at) : NaN;
  return Number.isFinite(checked) && Date.parse(t.created_at) > checked;
}

export function accountBalance(account: Account, transactions: Transaction[], until = today()): number {
  let balance = account.initial_balance;
  for (const t of transactions) if (countsInBalance(t, account, until)) balance += accountDelta(t, account.id);
  return cents(balance);
}

// ---------------------------------------------------------------------------
// Resumo do mês
// ---------------------------------------------------------------------------

export interface MonthSummary {
  income: number;
  expense: number;
  balance: number;
}

/**
 * Receitas e despesas por data de lançamento.
 * Compras no cartão contam como despesa na data da compra (ou da parcela);
 * pagamentos de fatura e transferências não entram, para não contar em dobro.
 * Créditos/estornos no cartão abatem despesas.
 */
export function periodSummary(transactions: Transaction[]): MonthSummary {
  let income = 0;
  let expense = 0;
  for (const t of transactions) {
    if (t.kind === "income" && !t.card_id) income += t.amount;
    else expense += expenseWeight(t);
  }
  return { income: cents(income), expense: cents(expense), balance: cents(income - expense) };
}

export function monthSummary(transactions: Transaction[], month: string): MonthSummary {
  return periodSummary(transactions.filter((t) => monthKey(t.date) === month));
}

/**
 * Quanto o lançamento pesa nos gastos por categoria: despesas somam,
 * estornos no cartão abatem e o resto (receitas, transferências e
 * pagamentos de fatura) não entra.
 */
export function expenseWeight(t: Transaction): number {
  if (t.kind === "expense") return t.amount;
  if (t.kind === "income" && t.card_id) return -t.amount;
  return 0;
}

/** Chave da categoria nos agrupamentos: o id ou "none" para sem categoria. */
export const categoryKey = (t: Pick<Transaction, "category_id">) => t.category_id ?? "none";

export const NO_CATEGORY = "Sem categoria";
/** Cor de quem não tem categoria, nos gráficos e nas listas. */
export const NO_CATEGORY_COLOR = "var(--series-other)";

export const lancamentosLabel = (n: number) => (n === 1 ? "1 lançamento" : `${n} lançamentos`);

/**
 * De onde sai e para onde vai o lançamento: "Conta", "Cartão",
 * "Conta A → Conta B" (transferência) ou "Conta → Cartão" (pagamento de fatura).
 */
export function transactionSource(
  t: Transaction,
  accountName: (id: string) => string | undefined,
  cardName: (id: string) => string | undefined,
): string {
  const account = t.account_id ? accountName(t.account_id) : undefined;
  const card = t.card_id ? cardName(t.card_id) : undefined;
  if (t.kind === "transfer") return `${account ?? "?"} → ${(t.to_account_id && accountName(t.to_account_id)) || "?"}`;
  if (t.kind === "card_payment") return `${account ?? ""} → ${card ?? ""}`;
  return card ?? account ?? "";
}

export interface CategoryTotal {
  /** id da categoria ou "none" */
  key: string;
  category: Category | null;
  total: number;
  share: number;
  count: number;
}

export function categoryTotals(transactions: Transaction[], categories: Category[]): CategoryTotal[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map<string, { total: number; count: number }>();
  for (const t of transactions) {
    const value = expenseWeight(t);
    if (value === 0) continue;
    const key = categoryKey(t);
    const acc = totals.get(key) ?? { total: 0, count: 0 };
    acc.total += value;
    acc.count += 1;
    totals.set(key, acc);
  }
  const rows = [...totals.entries()]
    .map(([key, { total, count }]) => ({ key, category: byId.get(key) ?? null, total: cents(total), count }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
  const sum = rows.reduce((acc, r) => acc + r.total, 0);
  return rows.map((r) => ({ ...r, share: sum > 0 ? r.total / sum : 0 }));
}

export function expensesByCategory(
  transactions: Transaction[],
  categories: Category[],
  month: string,
): CategoryTotal[] {
  return categoryTotals(
    transactions.filter((t) => monthKey(t.date) === month),
    categories,
  );
}

/**
 * Lançamentos que formam o total de uma categoria no mês, do maior para o
 * menor valor. Inclui os estornos no cartão, que aparecem por último.
 */
export function categoryItems(transactions: Transaction[], month: string, key: string): Transaction[] {
  return transactions
    .filter((t) => monthKey(t.date) === month && categoryKey(t) === key && expenseWeight(t) !== 0)
    .sort((a, b) => expenseWeight(b) - expenseWeight(a) || b.date.localeCompare(a.date));
}

// ---------------------------------------------------------------------------
// Metas
// ---------------------------------------------------------------------------

export function goalProgress(saved: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(1, Math.max(0, saved / target));
}

/** Quanto guardar por mês para atingir a meta no prazo (null sem prazo). */
export function monthlyNeeded(saved: number, target: number, deadline: string | null, ref = today()): number | null {
  if (!deadline) return null;
  const remaining = target - saved;
  if (remaining <= 0) return 0;
  const { year: ry, month: rm } = parts(ref);
  const { year: dy, month: dm } = parts(deadline);
  const months = Math.max(1, (dy - ry) * 12 + (dm - rm) + 1);
  return cents(remaining / months);
}
