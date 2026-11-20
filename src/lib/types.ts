export type AccountType = "corrente" | "poupanca" | "carteira" | "investimento" | "outro";
export type CategoryKind = "income" | "expense";
export type TransactionKind = "income" | "expense" | "card_payment" | "transfer";

export interface Profile {
  id: string;
  full_name: string;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  initial_balance: number;
  color: string;
  archived: boolean;
  created_at: string;
}

export interface CreditCard {
  id: string;
  name: string;
  limit_amount: number;
  closing_day: number;
  due_day: number;
  color: string;
  archived: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  color: string;
}

export interface Transaction {
  id: string;
  kind: TransactionKind;
  description: string;
  amount: number;
  /** YYYY-MM-DD */
  date: string;
  category_id: string | null;
  account_id: string | null;
  card_id: string | null;
  to_account_id: string | null;
  /** YYYY-MM-01: mês de vencimento da fatura */
  invoice_month: string | null;
  installment_number: number | null;
  installment_total: number | null;
  installment_group: string | null;
  import_id: string | null;
  notes: string | null;
  created_at: string;
}

export type NewTransaction = Omit<Transaction, "id" | "created_at">;

export interface Goal {
  id: string;
  name: string;
  target_amount: number;
  saved_amount: number;
  deadline: string | null;
  color: string;
  created_at: string;
}

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  corrente: "Conta corrente",
  poupanca: "Poupança",
  carteira: "Carteira",
  investimento: "Investimento",
  outro: "Outro",
};
