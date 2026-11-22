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

export type InvestmentClass =
  | "renda_fixa"
  | "tesouro"
  | "acoes"
  | "fiis"
  | "etfs"
  | "fundos"
  | "previdencia"
  | "cripto"
  | "outros";

/** Classes em ordem fixa: a posição define a cor nos gráficos (--series-N). */
export const INVESTMENT_CLASSES: Array<{ value: InvestmentClass; label: string; color: string }> = [
  { value: "renda_fixa", label: "Renda fixa", color: "var(--series-1)" },
  { value: "tesouro", label: "Tesouro Direto", color: "var(--series-2)" },
  { value: "acoes", label: "Ações", color: "var(--series-3)" },
  { value: "fiis", label: "Fundos imobiliários", color: "var(--series-4)" },
  { value: "etfs", label: "ETFs e exterior", color: "var(--series-5)" },
  { value: "fundos", label: "Fundos de investimento", color: "var(--series-6)" },
  { value: "previdencia", label: "Previdência", color: "var(--series-7)" },
  { value: "cripto", label: "Criptomoedas", color: "var(--series-8)" },
  { value: "outros", label: "Outros", color: "var(--series-other)" },
];

export interface Investment {
  id: string;
  name: string;
  asset_class: InvestmentClass;
  institution: string | null;
  archived: boolean;
  created_at: string;
}

export type MovementKind = "aporte" | "resgate" | "saldo";

export interface InvestmentMovement {
  id: string;
  investment_id: string;
  kind: MovementKind;
  amount: number;
  /** YYYY-MM-DD */
  date: string;
  notes: string | null;
  created_at: string;
}
