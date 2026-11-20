"use client";

import { SearchX } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useData } from "@/components/data-provider";
import { TransactionForm } from "@/components/transaction-form";
import { EmptyState, PageHeader } from "@/components/ui";

export default function EditarLancamentoPage() {
  const { id } = useParams<{ id: string }>();
  const { bfcacheId } = useRouter();
  const { transactions } = useData();
  const original = transactions.find((t) => t.id === id);

  return (
    <>
      <PageHeader title="Editar lançamento" back="/lancamentos" />
      {original ? (
        <TransactionForm key={`${original.id}:${bfcacheId}`} original={original} />
      ) : (
        <EmptyState
          icon={<SearchX className="size-6" />}
          title="Lançamento não encontrado"
          text="Ele pode ter sido excluído."
          action={<Link href="/lancamentos" className="font-semibold text-brand">Ver lançamentos</Link>}
        />
      )}
    </>
  );
}
