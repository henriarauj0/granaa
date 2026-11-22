"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { fullDate, today } from "@/lib/dates";
import { exportTransactions, XLSX_MIME } from "@/lib/export/transactions";
import type { Transaction } from "@/lib/types";
import { useData } from "./data-provider";
import { Button, ErrorBox, Segmented, Sheet } from "./ui";

type Scope = "visible" | "all";

function download(bytes: Uint8Array, filename: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: XLSX_MIME }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // o Safari precisa da URL viva por um instante depois do clique
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const plural = (n: number) => (n === 1 ? "1 lançamento" : `${n} lançamentos`);

export function ExportSheet({
  open,
  onClose,
  visible,
  visibleLabel,
  filters,
  month,
}: {
  open: boolean;
  onClose: () => void;
  /** Lançamentos que estão na tela (mês e filtros). */
  visible: Transaction[];
  /** Ex.: "Novembro de 2026" */
  visibleLabel: string;
  filters: string;
  /** YYYY-MM-01 */
  month: string;
}) {
  const { transactions, accounts, cards, categories } = useData();
  const [scope, setScope] = useState<Scope>("visible");
  const [error, setError] = useState<string | null>(null);

  const list = scope === "visible" ? visible : transactions;
  const oldest = transactions.reduce<string | null>((min, t) => (min == null || t.date < min ? t.date : min), null);
  const newest = transactions.reduce<string | null>((max, t) => (max == null || t.date > max ? t.date : max), null);

  const description =
    scope === "visible"
      ? `${plural(visible.length)} de ${visibleLabel.toLowerCase()}${filters ? `, filtrados por: ${filters}` : ""}.`
      : oldest && newest
        ? `${plural(transactions.length)}, de ${fullDate(oldest)} a ${fullDate(newest)}.`
        : "Nenhum lançamento registrado.";

  function save() {
    setError(null);
    try {
      const bytes = exportTransactions(
        list,
        { accounts, cards, categories },
        scope === "visible"
          ? { period: visibleLabel, filters: filters || undefined }
          : { period: "Todo o histórico" },
      );
      const name =
        scope === "visible" ? `granaa-${month.slice(0, 7)}${filters ? "-filtrado" : ""}.xlsx` : `granaa-completo-${today()}.xlsx`;
      download(bytes, name);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível gerar a planilha.");
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Exportar planilha">
      <div className="space-y-4">
        <Segmented<Scope>
          label="O que exportar"
          value={scope}
          onChange={setScope}
          options={[
            { value: "visible", label: "O que está na tela" },
            { value: "all", label: "Tudo" },
          ]}
        />
        <p className="text-sm text-ink-2">{description}</p>
        <p className="text-xs text-muted">
          Arquivo .xlsx com duas abas: os lançamentos, um por linha, e um resumo com receitas, despesas e gastos por
          categoria. Abre no Excel, no Google Planilhas e no Numbers.
        </p>
        <ErrorBox>{error}</ErrorBox>
        <Button className="w-full" onClick={save} disabled={list.length === 0}>
          <Download className="size-5" /> Baixar planilha
        </Button>
      </div>
    </Sheet>
  );
}
