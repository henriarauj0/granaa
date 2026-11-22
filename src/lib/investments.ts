import { addMonths, currentMonth, monthKey, monthsBetween, today } from "./dates";
import { cents } from "./money";
import { INVESTMENT_CLASSES, type Investment, type InvestmentClass, type InvestmentMovement } from "./types";

const byDate = (a: InvestmentMovement, b: InvestmentMovement) =>
  a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at);

/**
 * Valor de um ativo numa data: parte do último "saldo" informado e soma
 * os aportes e subtrai os resgates feitos depois dele. Sem nenhum saldo
 * informado, o valor é o total aplicado (aportes menos resgates).
 */
export function positionValue(investmentId: string, movements: InvestmentMovement[], until = today()): number {
  let value = 0;
  for (const m of movements.filter((m) => m.investment_id === investmentId && m.date <= until).sort(byDate)) {
    if (m.kind === "saldo") value = m.amount;
    else if (m.kind === "aporte") value += m.amount;
    else value -= m.amount;
  }
  return cents(Math.max(0, value));
}

/** Aportes menos resgates, sem considerar rendimento. */
export function netInvested(investmentId: string, movements: InvestmentMovement[]): number {
  let total = 0;
  for (const m of movements) {
    if (m.investment_id !== investmentId) continue;
    if (m.kind === "aporte") total += m.amount;
    else if (m.kind === "resgate") total -= m.amount;
  }
  return cents(total);
}

export interface Position {
  investment: Investment;
  value: number;
  share: number;
}

/** Ativos com valor, do maior para o menor. */
export function portfolio(investments: Investment[], movements: InvestmentMovement[], until = today()): Position[] {
  const rows = investments
    .map((investment) => ({ investment, value: positionValue(investment.id, movements, until) }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = rows.reduce((s, r) => s + r.value, 0);
  return rows.map((r) => ({ ...r, share: total > 0 ? r.value / total : 0 }));
}

export interface ClassTotal {
  assetClass: InvestmentClass;
  label: string;
  color: string;
  value: number;
  share: number;
}

/** Soma por classe, mantendo a ordem fixa das classes (que define a cor). */
export function byClass(positions: Position[]): ClassTotal[] {
  const total = positions.reduce((s, p) => s + p.value, 0);
  return INVESTMENT_CLASSES.map((c) => {
    const value = cents(positions.filter((p) => p.investment.asset_class === c.value).reduce((s, p) => s + p.value, 0));
    return { assetClass: c.value, label: c.label, color: c.color, value, share: total > 0 ? value / total : 0 };
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
