import type { Category, CategoryKind, Transaction } from "../types";

export function normalizeDescription(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\d+\/\d+/g, " ") // parcelas "3/10"
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Palavras-chave → nome da categoria padrão. */
const RULES: Array<{ kind: CategoryKind; category: string; pattern: RegExp }> = [
  { kind: "expense", category: "Transporte", pattern: /\b(uber|99 ?(app|pop|taxi)?|cabify|posto|combustivel|shell|ipiranga|petrobras|br mania|estacionamento|sem parar|conectcar|pedagio|onibus|metro)\b/ },
  { kind: "expense", category: "Alimentação", pattern: /\b(ifood|rappi|restaurante|lanchonete|padaria|pizzaria|burger|mc ?donalds|bk|subway|cafe|cafeteria|churrascaria|acai|sorveteria|delivery|ze delivery)\b/ },
  { kind: "expense", category: "Mercado", pattern: /\b(mercado|supermercado|atacadao|assai|carrefour|pao de acucar|hortifruti|sacolao|atacarejo|mateus)\b/ },
  { kind: "expense", category: "Saúde", pattern: /\b(farmacia|drogaria|droga|raia|drogasil|pague menos|pacheco|hospital|clinica|laboratorio|unimed|hapvida|amil|odonto|medic)\w*/ },
  { kind: "expense", category: "Assinaturas", pattern: /\b(netflix|spotify|amazon prime|prime video|disney|hbo max|globoplay|youtube|apple com bill|icloud|google one|deezer|paramount|chatgpt|openai|claude)\b/ },
  { kind: "expense", category: "Contas da casa", pattern: /\b(energia|eletroacre|energisa|enel|cemig|copel|agua|saneamento|depasa|sabesp|internet|vivo|claro|telefone|conta de luz)\b/ },
  { kind: "expense", category: "Moradia", pattern: /\b(aluguel|condominio|iptu|imobiliaria)\b/ },
  { kind: "expense", category: "Educação", pattern: /\b(escola|faculdade|universidade|curso|udemy|alura|livraria|mensalidade)\b/ },
  { kind: "expense", category: "Compras", pattern: /\b(amazon|mercado ?livre|mercadopago|shopee|magalu|magazine|americanas|shein|aliexpress|renner|riachuelo|zara)\b/ },
  { kind: "expense", category: "Lazer", pattern: /\b(cinema|cinemark|ingresso|sympla|show|teatro|steam|playstation|xbox|nintendo)\b/ },
  { kind: "expense", category: "Viagem", pattern: /\b(hotel|airbnb|booking|latam|decolar|passagem|smiles)\b/ },
  { kind: "expense", category: "Pets", pattern: /\b(pet|petz|cobasi|veterinari)\w*/ },
  { kind: "expense", category: "Impostos e taxas", pattern: /\b(iof|tarifa|anuidade|imposto|darf|ipva|licenciamento|detran|juros|multa)\b/ },
  { kind: "income", category: "Salário", pattern: /\b(salario|folha|pagamento de salario|proventos|pro labore)\b/ },
  { kind: "income", category: "Investimentos", pattern: /\b(rendimento|dividendo|resgate|juros sobre capital|cdb|tesouro)\b/ },
  { kind: "income", category: "Reembolsos", pattern: /\b(estorno|reembolso|devolucao|cashback)\b/ },
];

/** Descrições que costumam ser pagamento de fatura (para não duplicar gastos). */
export function looksLikeCardPayment(description: string): boolean {
  const d = normalizeDescription(description);
  return /\b(pagamento (de )?fatura|pagamento recebido|pgto fatura|pag fatura|fatura cartao|pagto cartao)\b/.test(d);
}

/**
 * Sugere a categoria: primeiro pelo histórico do próprio usuário
 * (mesma descrição já categorizada antes), depois por palavras-chave.
 */
export function buildCategorizer(categories: Category[], history: Transaction[]) {
  const learned = new Map<string, string>();
  // histórico mais recente prevalece
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  for (const t of sorted) {
    if (!t.category_id) continue;
    const key = `${t.kind === "income" ? "income" : "expense"}:${normalizeDescription(t.description)}`;
    learned.set(key, t.category_id);
  }
  const byName = new Map(categories.map((c) => [`${c.kind}:${c.name.toLowerCase()}`, c.id]));
  const validIds = new Set(categories.map((c) => c.id));

  return (description: string, kind: CategoryKind): string | null => {
    const n = normalizeDescription(description);
    const fromHistory = learned.get(`${kind}:${n}`);
    if (fromHistory && validIds.has(fromHistory)) return fromHistory;
    for (const rule of RULES) {
      if (rule.kind !== kind) continue;
      if (rule.pattern.test(n)) {
        const id = byName.get(`${kind}:${rule.category.toLowerCase()}`);
        if (id) return id;
      }
    }
    return null;
  };
}

/** Chave de deduplicação: evita importar o mesmo lançamento duas vezes. */
export function importKey(
  targetId: string,
  row: { date: string; amount: number; description: string; externalId?: string },
  occurrence: number,
): string {
  if (row.externalId) return `${targetId}:fit:${row.externalId}`;
  return `${targetId}:${row.date}:${row.amount.toFixed(2)}:${normalizeDescription(row.description).slice(0, 60)}:${occurrence}`;
}
