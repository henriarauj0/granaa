"use client";

import { useRouter } from "next/navigation";
import { TransactionForm } from "@/components/transaction-form";
import { PageHeader } from "@/components/ui";

export default function NovoLancamentoPage() {
  // cada visita (push) começa com o formulário vazio
  const { bfcacheId } = useRouter();
  return (
    <>
      <PageHeader title="Novo lançamento" back="/lancamentos" />
      <TransactionForm key={bfcacheId} />
    </>
  );
}
