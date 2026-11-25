"use client";

import { ChevronRight, Landmark, LogOut, Smartphone, Tags, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useData } from "@/components/data-provider";
import { ThemePicker } from "@/components/theme-picker";
import { Button, ErrorBox, Field, PageHeader } from "@/components/ui";
import { updateProfileName } from "@/lib/api";
import { getSupabase } from "@/lib/supabase";

const LINKS = [
  { href: "/contas", label: "Contas", text: "Bancos, carteira e poupança", icon: Landmark },
  { href: "/categorias", label: "Categorias", text: "Organize receitas e despesas", icon: Tags },
  { href: "/importar", label: "Importar extrato", text: "Arquivos OFX, CSV ou XLS do banco", icon: Upload },
  { href: "/apple-pay", label: "Apple Pay", text: "Registrar compras por aproximação no iPhone", icon: Smartphone },
];

export default function MaisPage() {
  const { session } = useAuth();
  const { profile, reload } = useData();
  const router = useRouter();
  const [name, setName] = useState(profile?.full_name ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !name.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      await updateProfileName(session.user.id, name);
      await reload();
      setMsg("Nome atualizado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await getSupabase().auth.signOut();
    router.replace("/entrar");
  }

  return (
    <>
      <PageHeader title="Mais" back="/inicio" />
      <div className="card divide-y divide-line overflow-hidden">
        {LINKS.map(({ href, label, text, icon: Icon }) => (
          <Link key={href} href={href} className="flex items-center gap-3 p-4 hover:bg-surface-2">
            <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
              <Icon className="size-5" />
            </span>
            <span className="flex-1">
              <span className="block font-medium">{label}</span>
              <span className="text-xs text-muted">{text}</span>
            </span>
            <ChevronRight className="size-5 text-muted" />
          </Link>
        ))}
      </div>

      <section className="card mt-6 p-5">
        <h2 className="mb-1 font-bold">Aparência</h2>
        <p className="mb-4 text-sm text-muted">No automático, o app segue o modo claro ou escuro do aparelho.</p>
        <ThemePicker />
      </section>

      <section className="card mt-6 p-5">
        <h2 className="mb-1 font-bold">Seu perfil</h2>
        <p className="mb-4 text-sm text-muted">{session?.user.email}</p>
        <form onSubmit={saveName} className="space-y-3">
          <Field label="Nome">{(id) => <input id={id} className="field" value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          {msg ? <p className="text-sm text-income">{msg}</p> : null}
          <ErrorBox>{error}</ErrorBox>
          <Button type="submit" variant="secondary" loading={busy} className="w-full">
            Salvar nome
          </Button>
        </form>
      </section>

      <Button variant="ghost" className="mt-6 w-full" onClick={signOut}>
        <LogOut className="size-5" /> Sair
      </Button>
    </>
  );
}
