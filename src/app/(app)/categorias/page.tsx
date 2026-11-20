"use client";

import { Plus, Tags, Trash2 } from "lucide-react";
import { useState } from "react";
import { useData } from "@/components/data-provider";
import { Button, ColorPicker, EmptyState, ErrorBox, Field, IconButton, PageHeader, Segmented, Sheet } from "@/components/ui";
import { deleteCategory, saveCategory } from "@/lib/api";
import type { Category, CategoryKind } from "@/lib/types";

export default function CategoriasPage() {
  const { categories, transactions } = useData();
  const [kind, setKind] = useState<CategoryKind>("expense");
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const list = categories.filter((c) => c.kind === kind);
  const usage = (id: string) => transactions.filter((t) => t.category_id === id).length;

  return (
    <>
      <PageHeader
        title="Categorias"
        back="/mais"
        action={
          <IconButton label="Nova categoria" onClick={() => setEditing("new")} className="bg-surface-2">
            <Plus className="size-5" />
          </IconButton>
        }
      />
      <Segmented<CategoryKind>
        label="Tipo de categoria"
        value={kind}
        onChange={setKind}
        options={[
          { value: "expense", label: "Despesas" },
          { value: "income", label: "Receitas" },
        ]}
      />
      <div className="card mt-4 divide-y divide-line overflow-hidden">
        {list.length === 0 ? (
          <EmptyState icon={<Tags className="size-6" />} title="Nenhuma categoria" />
        ) : (
          list.map((c) => (
            <button key={c.id} onClick={() => setEditing(c)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-surface-2">
              <span className="size-3 rounded-full" style={{ background: c.color }} aria-hidden />
              <span className="flex-1 font-medium">{c.name}</span>
              <span className="text-xs text-muted">{usage(c.id)} lanç.</span>
            </button>
          ))
        )}
      </div>
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Nova categoria" : "Editar categoria"}>
        {editing !== null ? (
          <CategoryForm category={editing === "new" ? undefined : editing} kind={kind} usage={editing === "new" ? 0 : usage(editing.id)} onDone={() => setEditing(null)} />
        ) : null}
      </Sheet>
    </>
  );
}

function CategoryForm({ category, kind, usage, onDone }: { category?: Category; kind: CategoryKind; usage: number; onDone: () => void }) {
  const { reload } = useData();
  const [name, setName] = useState(category?.name ?? "");
  const [color, setColor] = useState(category?.color ?? "#2F6FB0");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro.");
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return setError("Informe o nome.");
        run(() => saveCategory({ name: name.trim(), kind: category?.kind ?? kind, color }, category?.id));
      }}
      className="space-y-4"
    >
      <Field label="Nome">{(id) => <input id={id} className="field" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
      <Field label="Cor">{() => <ColorPicker value={color} onChange={setColor} />}</Field>
      <ErrorBox>{error}</ErrorBox>
      <Button type="submit" loading={busy} className="w-full">
        Salvar
      </Button>
      {category ? (
        <Button
          type="button"
          variant="danger"
          className="w-full"
          disabled={busy}
          onClick={() => {
            const msg = usage
              ? `Excluir "${category.name}"? ${usage} lançamentos ficarão sem categoria.`
              : `Excluir "${category.name}"?`;
            if (window.confirm(msg)) run(() => deleteCategory(category.id));
          }}
        >
          <Trash2 className="size-4" /> Excluir categoria
        </Button>
      ) : null}
    </form>
  );
}
