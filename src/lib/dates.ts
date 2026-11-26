// Datas são manipuladas como texto "YYYY-MM-DD" para não sofrer com fuso horário.

const MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

const pad = (n: number) => String(n).padStart(2, "0");

export function toISODate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function today(): string {
  const d = new Date();
  return toISODate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export function parts(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return { year, month, day };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Primeiro dia do mês: "2026-11-01" */
export function monthKey(iso: string): string {
  return iso.slice(0, 7) + "-01";
}

export function currentMonth(): string {
  return monthKey(today());
}

/** Soma meses mantendo o dia (limitado ao último dia do mês de destino). */
export function addMonths(iso: string, n: number): string {
  const { year, month, day } = parts(iso);
  const index = year * 12 + (month - 1) + n;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return toISODate(y, m, Math.min(day, daysInMonth(y, m)));
}

/** Data com o dia informado dentro do mês de `iso` (limitado ao fim do mês). */
export function withDay(iso: string, day: number): string {
  const { year, month } = parts(iso);
  return toISODate(year, month, Math.min(day, daysInMonth(year, month)));
}

export function isValidISODate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const { year, month, day } = parts(iso);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month) && year > 1900;
}

export function monthLabel(iso: string, withYear = true): string {
  const { year, month } = parts(iso);
  const name = MONTHS[month - 1];
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  return withYear ? `${cap} de ${year}` : cap;
}

export function shortDate(iso: string): string {
  const { day, month } = parts(iso);
  return `${pad(day)} ${MONTHS_SHORT[month - 1]}`;
}

export function fullDate(iso: string): string {
  const { day, month, year } = parts(iso);
  return `${pad(day)}/${pad(month)}/${year}`;
}

export function dayHeading(iso: string): string {
  const t = today();
  if (iso === t) return "Hoje";
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (iso === toISODate(y.getFullYear(), y.getMonth() + 1, y.getDate())) return "Ontem";
  const { year, month, day } = parts(iso);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)}, ${day} de ${MONTHS[month - 1]}`;
}

/** Soma dias a uma data "YYYY-MM-DD". */
export function addDays(iso: string, n: number): string {
  const { year, month, day } = parts(iso);
  const d = new Date(Date.UTC(year, month - 1, day + n));
  return toISODate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** "Quarta, 25 de novembro de 2026" (ou "Hoje"/"Ontem" com a data). */
export function dayLabel(iso: string): string {
  const heading = dayHeading(iso);
  return heading.includes(" de ") ? `${heading} de ${parts(iso).year}` : `${heading}, ${fullDate(iso)}`;
}

/** Mês abreviado com inicial maiúscula: "Nov". */
export function shortMonth(iso: string): string {
  const name = MONTHS_SHORT[parts(iso).month - 1];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** "05/11/2026" ou "05/11/2026 a 20/11/2026". */
export function dateRangeLabel(first: string, last: string): string {
  return first === last ? fullDate(first) : `${fullDate(first)} a ${fullDate(last)}`;
}

/** Ordem cronológica; no mesmo dia, pela ordem de cadastro. */
export const byDateAsc = (a: { date: string; created_at: string }, b: { date: string; created_at: string }) =>
  a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at);

/** Diferença em meses inteiros entre dois meses (b - a). */
export function monthsBetween(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  return (pb.year - pa.year) * 12 + (pb.month - pa.month);
}

/** Segunda-feira da semana de `iso` (semana de segunda a domingo). */
export function weekStart(iso: string): string {
  const { year, month, day } = parts(iso);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = domingo
  return addDays(iso, -((weekday + 6) % 7));
}

/** "23 a 29 de novembro de 2026", "30 nov a 6 dez de 2026" ou, na virada do ano, "28/12/2026 a 03/01/2027". */
export function weekLabel(start: string): string {
  const end = addDays(start, 6);
  const a = parts(start);
  const b = parts(end);
  if (a.year !== b.year) return `${fullDate(start)} a ${fullDate(end)}`;
  if (a.month !== b.month) return `${a.day} ${MONTHS_SHORT[a.month - 1]} a ${b.day} ${MONTHS_SHORT[b.month - 1]} de ${b.year}`;
  return `${a.day} a ${b.day} de ${MONTHS[b.month - 1]} de ${b.year}`;
}
