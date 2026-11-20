"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { addMonths, monthLabel } from "@/lib/dates";
import { formatAmount, formatMoney, parseMoney } from "@/lib/money";

// ---------------------------------------------------------------------------
// Botões
// ---------------------------------------------------------------------------

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-on-brand hover:bg-brand-strong",
  secondary: "bg-surface-2 text-ink hover:bg-line",
  ghost: "text-ink-2 hover:bg-surface-2",
  danger: "bg-danger-soft text-expense hover:brightness-95",
};

export function Button({
  variant = "primary",
  className = "",
  loading,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 font-semibold transition-colors disabled:opacity-50 ${variants[variant]} ${className}`}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
    />
  );
}

export function IconButton({
  label,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      {...props}
      className={`inline-flex size-11 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2 ${className}`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Campos
// ---------------------------------------------------------------------------

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-ink-2">
        {label}
      </label>
      {children(id)}
      {error ? <p className="text-sm text-expense">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/** Campo de valor em reais. Guarda o texto digitado e devolve o número. */
export function MoneyInput({
  id,
  value,
  onChange,
  autoFocus,
  allowNegative,
  placeholder = "0,00",
  large,
}: {
  id?: string;
  value: number | null;
  onChange: (v: number | null) => void;
  autoFocus?: boolean;
  allowNegative?: boolean;
  placeholder?: string;
  large?: boolean;
}) {
  const [text, setText] = useState(value == null ? "" : formatAmount(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    // valor alterado por fora (ex.: ao abrir edição)
    setLastValue(value);
    if (value !== parseMoney(text)) setText(value == null ? "" : formatAmount(value));
  }
  return (
    <div className="relative">
      <span className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted ${large ? "text-xl" : ""}`}>
        R$
      </span>
      <input
        id={id}
        className={`field num pl-11 ${large ? "min-h-16 text-2xl font-semibold" : ""}`}
        inputMode="decimal"
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          const raw = e.target.value.replace(allowNegative ? /[^\d.,-]/g : /[^\d.,]/g, "");
          setText(raw);
          const parsed = parseMoney(raw);
          setLastValue(parsed);
          onChange(parsed);
        }}
        onBlur={() => {
          const parsed = parseMoney(text);
          if (parsed != null) setText(formatAmount(parsed));
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Estrutura de página
// ---------------------------------------------------------------------------

export function PageHeader({
  title,
  back,
  action,
  subtitle,
}: {
  title: string;
  back?: string;
  action?: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <header className="mb-5 flex items-center gap-2">
      {back ? (
        <Link href={back} aria-label="Voltar" className="-ml-2 inline-flex size-11 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2">
          <ChevronLeft className="size-6" />
        </Link>
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function MonthSwitcher({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  return (
    <div className="flex items-center justify-between rounded-full bg-surface-2 p-1">
      <IconButton label="Mês anterior" onClick={() => onChange(addMonths(month, -1))} className="size-9">
        <ChevronLeft className="size-5" />
      </IconButton>
      <span className="text-sm font-semibold">{monthLabel(month)}</span>
      <IconButton label="Próximo mês" onClick={() => onChange(addMonths(month, 1))} className="size-9">
        <ChevronRight className="size-5" />
      </IconButton>
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand">{icon}</div>
      <p className="font-semibold">{title}</p>
      {text ? <p className="mt-1 max-w-xs text-sm text-muted">{text}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Money({ value, kind, className = "" }: { value: number; kind?: "income" | "expense" | "neutral"; className?: string }) {
  const color = kind === "income" ? "text-income" : kind === "expense" ? "text-expense" : "";
  const sign = kind === "income" ? "+ " : kind === "expense" ? "− " : "";
  return <span className={`num whitespace-nowrap ${color} ${className}`}>{sign}{formatMoney(kind && kind !== "neutral" ? Math.abs(value) : value)}</span>;
}

export function ProgressBar({ value, color = "var(--brand)", label }: { value: number; color?: string; label: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
      <div className="h-full rounded-full transition-[width]" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warning" | "danger" }) {
  const tones = {
    neutral: "bg-surface-2 text-ink-2",
    good: "bg-brand-soft text-brand",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-expense",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export function ErrorBox({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-expense">
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Painel inferior (modal)
// ---------------------------------------------------------------------------

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Fechar" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="sheet-in safe-bottom relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <IconButton label="Fechar" onClick={onClose} className="-mr-2">
            <X className="size-5" />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}

export const SWATCHES = ["#0B6B45", "#2F6FB0", "#7A4FB0", "#C2412D", "#E07A2E", "#D9A21B", "#3A8F8F", "#D2486B", "#14201A", "#8C9690"];

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cor">
      {SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value.toLowerCase() === c.toLowerCase()}
          aria-label={`Cor ${c}`}
          onClick={() => onChange(c)}
          className="size-9 rounded-full ring-offset-2 ring-offset-surface aria-checked:ring-2 aria-checked:ring-ink"
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className="min-h-10 rounded-lg px-3 text-sm font-semibold text-ink-2 aria-checked:bg-surface aria-checked:text-ink aria-checked:shadow-sm"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
