const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const plain = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatMoney(value: number): string {
  // evita "-R$ 0,00"
  return brl.format(Math.abs(value) < 0.005 ? 0 : value);
}

export function formatAmount(value: number): string {
  return plain.format(value);
}

/** Arredonda para centavos, evitando erros de ponto flutuante. */
export function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Interpreta valores no formato brasileiro ou internacional:
 * "1.234,56", "1234,56", "-R$ 12,30", "1,234.56", "1234.56", "(45,00)".
 * Retorna null quando o texto não é um número.
 */
export function parseMoney(input: string): number | null {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s) return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/R\$|BRL|\s| /gi, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    // o separador que aparece por último é o decimal
    normalized =
      lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const parts = s.split(",");
    normalized =
      parts.length > 2 ? parts.join("") : s.replace(",", ".");
  } else if (lastDot >= 0) {
    // "1.234" ou "1.234.567" = milhar; "12.5" ou "1234.56" = decimal
    normalized = /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s;
    if ((normalized.match(/\./g) ?? []).length > 1) return null;
  } else {
    normalized = s;
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return cents(negative ? -n : n);
}

/** Divide um total em N parcelas; a diferença de centavos fica na primeira. */
export function splitInstallments(total: number, count: number): number[] {
  const totalCents = Math.round(total * 100);
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }, (_, i) => (base + (i === 0 ? remainder : 0)) / 100);
}
