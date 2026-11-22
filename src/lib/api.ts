import { addMonths } from "./dates";
import { invoiceMonthFor } from "./finance";
import { cents, splitInstallments } from "./money";
import { getSupabase } from "./supabase";
import type {
  Account,
  Category,
  CreditCard,
  Goal,
  Investment,
  InvestmentMovement,
  NewTransaction,
  Transaction,
  TransactionKind,
} from "./types";

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(translateDbError(res.error.message));
  return res.data;
}

function translateDbError(message: string): string {
  if (message.includes("transactions_shape")) return "Combinação inválida de conta/cartão para este tipo de lançamento.";
  if (message.includes("Categoria inválida")) return "Categoria inválida.";
  if (message.includes("categories_user_id_kind_name_key")) return "Já existe uma categoria com esse nome.";
  if (message.includes("Failed to fetch")) return "Sem conexão. Verifique sua internet.";
  return message;
}

// ---------------------------------------------------------------------------
// Lançamentos
// ---------------------------------------------------------------------------

export interface TransactionInput {
  kind: TransactionKind;
  description: string;
  amount: number;
  date: string;
  categoryId: string | null;
  accountId: string | null;
  cardId: string | null;
  toAccountId: string | null;
  installments: number;
  notes: string | null;
  invoiceMonth?: string | null;
}

/** Monta as linhas a inserir; compras parceladas viram uma linha por parcela. */
export function buildTransactionRows(input: TransactionInput, card: CreditCard | null): NewTransaction[] {
  const base: NewTransaction = {
    kind: input.kind,
    description: input.description.trim(),
    amount: cents(input.amount),
    date: input.date,
    category_id: input.kind === "income" || input.kind === "expense" ? input.categoryId : null,
    account_id: input.cardId && input.kind !== "card_payment" ? null : input.accountId,
    card_id: input.cardId,
    to_account_id: input.kind === "transfer" ? input.toAccountId : null,
    invoice_month: null,
    installment_number: null,
    installment_total: null,
    installment_group: null,
    import_id: null,
    notes: input.notes?.trim() || null,
  };
  if (!card) return [base];

  const firstInvoice = input.invoiceMonth ?? invoiceMonthFor(input.date, card.closing_day, card.due_day);
  const n = input.kind === "expense" ? Math.max(1, Math.min(48, Math.floor(input.installments))) : 1;
  if (n === 1) return [{ ...base, invoice_month: firstInvoice }];

  const group = crypto.randomUUID();
  return splitInstallments(input.amount, n).map((amount, i) => ({
    ...base,
    amount,
    date: addMonths(input.date, i),
    invoice_month: addMonths(firstInvoice, i),
    installment_number: i + 1,
    installment_total: n,
    installment_group: group,
  }));
}

export async function createTransaction(input: TransactionInput, card: CreditCard | null) {
  const rows = buildTransactionRows(input, card);
  check(await getSupabase().from("transactions").insert(rows));
}

/** Edita um único lançamento (inclusive uma parcela isolada). */
export async function updateTransaction(id: string, input: TransactionInput, card: CreditCard | null, original: Transaction) {
  const [row] = buildTransactionRows({ ...input, installments: 1 }, card);
  const patch: Partial<NewTransaction> = { ...row };
  // mantém os dados de parcelamento e importação do original
  delete patch.installment_number;
  delete patch.installment_total;
  delete patch.installment_group;
  delete patch.import_id;
  if (card && original.card_id === card.id && original.date === input.date && original.invoice_month) {
    patch.invoice_month = original.invoice_month;
  }
  check(await getSupabase().from("transactions").update(patch).eq("id", id));
}

export async function deleteTransaction(id: string) {
  check(await getSupabase().from("transactions").delete().eq("id", id));
}

export async function deleteInstallmentGroup(group: string) {
  check(await getSupabase().from("transactions").delete().eq("installment_group", group));
}

export async function insertImported(rows: NewTransaction[]): Promise<number> {
  if (rows.length === 0) return 0;
  const supabase = getSupabase();
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const data = check(
      await supabase
        .from("transactions")
        .upsert(chunk, { onConflict: "user_id,import_id", ignoreDuplicates: true })
        .select("id"),
    );
    inserted += data?.length ?? 0;
  }
  return inserted;
}

// ---------------------------------------------------------------------------
// Contas, cartões, categorias e metas
// ---------------------------------------------------------------------------

type AccountInput = Pick<Account, "name" | "type" | "initial_balance" | "color">;
export async function saveAccount(input: AccountInput, id?: string) {
  const supabase = getSupabase();
  if (id) check(await supabase.from("accounts").update(input).eq("id", id));
  else check(await supabase.from("accounts").insert(input));
}
export async function setAccountArchived(id: string, archived: boolean) {
  check(await getSupabase().from("accounts").update({ archived }).eq("id", id));
}
export async function deleteAccount(id: string) {
  check(await getSupabase().from("accounts").delete().eq("id", id));
}

type CardInput = Pick<CreditCard, "name" | "limit_amount" | "closing_day" | "due_day" | "color">;
export async function saveCard(input: CardInput, id?: string) {
  const supabase = getSupabase();
  if (id) check(await supabase.from("credit_cards").update(input).eq("id", id));
  else check(await supabase.from("credit_cards").insert(input));
}
export async function setCardArchived(id: string, archived: boolean) {
  check(await getSupabase().from("credit_cards").update({ archived }).eq("id", id));
}
export async function deleteCard(id: string) {
  check(await getSupabase().from("credit_cards").delete().eq("id", id));
}

type CategoryInput = Pick<Category, "name" | "kind" | "color">;
export async function saveCategory(input: CategoryInput, id?: string) {
  const supabase = getSupabase();
  if (id) check(await supabase.from("categories").update(input).eq("id", id));
  else check(await supabase.from("categories").insert(input));
}
export async function deleteCategory(id: string) {
  check(await getSupabase().from("categories").delete().eq("id", id));
}

type GoalInput = Pick<Goal, "name" | "target_amount" | "deadline" | "color"> & { saved_amount?: number };
export async function saveGoal(input: GoalInput, id?: string) {
  const supabase = getSupabase();
  if (id) check(await supabase.from("goals").update(input).eq("id", id));
  else check(await supabase.from("goals").insert(input));
}
export async function setGoalSaved(id: string, saved: number) {
  check(await getSupabase().from("goals").update({ saved_amount: cents(Math.max(0, saved)) }).eq("id", id));
}
export async function deleteGoal(id: string) {
  check(await getSupabase().from("goals").delete().eq("id", id));
}

// ---------------------------------------------------------------------------
// Investimentos
// ---------------------------------------------------------------------------

type InvestmentInput = Pick<Investment, "name" | "asset_class" | "institution">;
/** Cria ou altera o ativo; devolve o id. */
export async function saveInvestment(input: InvestmentInput, id?: string): Promise<string> {
  const supabase = getSupabase();
  if (id) {
    check(await supabase.from("investments").update(input).eq("id", id));
    return id;
  }
  const row = check(await supabase.from("investments").insert(input).select("id").single());
  return (row as { id: string }).id;
}
export async function deleteInvestment(id: string) {
  check(await getSupabase().from("investments").delete().eq("id", id));
}

type MovementInput = Pick<InvestmentMovement, "investment_id" | "kind" | "amount" | "date" | "notes">;
export async function saveMovement(input: MovementInput, id?: string) {
  const supabase = getSupabase();
  const row = { ...input, amount: cents(input.amount) };
  if (id) check(await supabase.from("investment_movements").update(row).eq("id", id));
  else check(await supabase.from("investment_movements").insert(row));
}
export async function deleteMovement(id: string) {
  check(await getSupabase().from("investment_movements").delete().eq("id", id));
}

export async function updateProfileName(userId: string, fullName: string) {
  check(await getSupabase().from("profiles").update({ full_name: fullName.trim() }).eq("id", userId));
}
