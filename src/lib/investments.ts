import { addMonths, byDateAsc, currentMonth, monthKey, monthsBetween, today } from "./dates";
import { cents } from "./money";
import { INVESTMENT_CLASSES, type Investment, type InvestmentClass, type InvestmentMovement } from "./types";

export interface AssetStats {
  /** Quanto vale hoje. */
  value: number;
  /** Aportes menos resgates, sem rendimento. */
  net: number;
}

/**
 * Valor e total aplicado de cada ativo, numa passagem só pelas movimentações.
 * O valor parte do último "saldo" informado e soma os aportes e subtrai os
 * resgates feitos depois dele. Sem nenhum saldo informado, o valor é o total
 * aplicado (aportes menos resgates).
 */
export function assetStats(movements: InvestmentMovement[], until = today()): Map<string, AssetStats> {
  const stats = new Map<string, AssetStats>();
  for (const m of [...movements].sort(byDateAsc)) {
    const s = stats.get(m.investment_id) ?? { value: 0, net: 0 };
    stats.set(m.investment_id, s);
    if (m.kind === "aporte") s.net += m.amount;
    else if (m.kind === "resgate") s.net -= m.amount;
    if (m.date > until) continue;
    if (m.kind === "saldo") s.value = m.amount;
    else if (m.kind === "aporte") s.value += m.amount;
    else s.value -= m.amount;
  }
  for (const s of stats.values()) {
    s.value = cents(Math.max(0, s.value));
    s.net = cents(s.net);
  }
  return stats;
}

export interface Position {
  investment: Investment;
  value: number;
}

/** Todos os ativos com o valor de hoje, do maior para o menor (inclui os zerados). */
export function positions(investments: Investment[], stats: Map<string, AssetStats>): Position[] {
  return investments
    .map((investment) => ({ investment, value: stats.get(investment.id)?.value ?? 0 }))
    .sort((a, b) => b.value - a.value);
}

export interface ClassTotal {
  assetClass: InvestmentClass;
  label: string;
  color: string;
  value: number;
}

/** Soma por classe, mantendo a ordem fixa das classes (que define a cor). */
export function byClass(list: Position[]): ClassTotal[] {
  return INVESTMENT_CLASSES.map((c) => {
    const value = cents(list.filter((p) => p.investment.asset_class === c.value).reduce((s, p) => s + p.value, 0));
    return { assetClass: c.value, label: c.label, color: c.color, value };
  }).filter((c) => c.value > 0);
}

/**
 * Média mensal de aportes nos últimos 12 meses (contando o mês atual).
 * Se o primeiro aporte é mais recente, a média conta a partir dele.
 */
export function averageMonthlyContribution(movements: InvestmentMovement[], ref = today()): number {
  const end = monthKey(ref);
  const start = addMonths(end, -11);
  const aportes = movements.filter((m) => m.kind === "aporte" && m.date <= ref);
  if (aportes.length === 0) return 0;
  const first = aportes.reduce((min, m) => (m.date < min ? m.date : min), aportes[0].date);
  const from = monthKey(first) > start ? monthKey(first) : start;
  const months = monthsBetween(from, end) + 1;
  const sum = aportes.filter((m) => monthKey(m.date) >= from).reduce((s, m) => s + m.amount, 0);
  return cents(sum / months);
}

export interface MonthFlow {
  month: string;
  aportes: number;
  resgates: number;
}

/** Aportes e resgates dos últimos N meses, do mais antigo para o atual. */
export function monthlyFlows(movements: InvestmentMovement[], count = 6, ref = currentMonth()): MonthFlow[] {
  const end = monthKey(ref);
  return Array.from({ length: count }, (_, i) => {
    const month = addMonths(end, i - count + 1);
    let aportes = 0;
    let resgates = 0;
    for (const m of movements) {
      if (monthKey(m.date) !== month) continue;
      if (m.kind === "aporte") aportes += m.amount;
      else if (m.kind === "resgate") resgates += m.amount;
    }
    return { month, aportes: cents(aportes), resgates: cents(resgates) };
  });
}

/** Valor "redondo" acima do máximo, para o topo do eixo. */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(value));
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => s * exp >= value) ?? 10;
  return step * exp;
}
