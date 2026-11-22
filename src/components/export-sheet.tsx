"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { dateRangeLabel, monthLabel, today } from "@/lib/dates";
import { exportTransactions } from "@/lib/export/transactions";
import { XLSX_MIME } from "@/lib/export/xlsx";
import { lancamentosLabel } from "@/lib/finance";
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

/** Montado só enquanto aberto: o estado volta ao padrão a cada abertura. */
export function ExportSheet({
  onClose,
  visible,
  filters,
  month,
}: {
  onClose: () => void;
  /** Lançamentos que estão na tela (mês e filtros). */
  visible: Transaction[];
  filters: string;
  /** YYYY-MM-01 */
  month: string;
}) {
  const { transactions, accounts, cards, categories } = useData();
  const [scope, setScope] = useState<Scope>("visible");
  const [error, setError] = useState<string | null>(null);

  const visibleLabel = monthLabel(month);
  const list = scope === "visible" ? visible : transactions;
  // os lançamentos chegam do banco do mais recente para o mais antigo
  const newest = transactions[0]?.date;
  const oldest = transactions.at(-1)?.date;

  const description =
    scope === "visible"
      ? `${lancamentosLabel(visible.length)} de ${visibleLabel.toLowerCase()}${filters ? `, filtrados por: ${filters}` : ""}.`
      : oldest && newest
        ? `${lancamentosLabel(transactions.length)}, de ${dateRangeLabel(oldest, newest)}.`
        : "Nenhum lançamento registrado.";

  function save() {
    setError(null);
    try {
      const bytes = exportTransactions(
        list,
        { accounts, cards, categories },
        scope === "visible"
          ? { period: visibleLabel, filters }
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
    <Sheet open onClose={onClose} title="Exportar planilha">
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
