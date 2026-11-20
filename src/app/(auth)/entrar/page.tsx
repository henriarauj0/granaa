"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { Button, ErrorBox, Field } from "@/components/ui";
import { authErrorMessage, getSupabase } from "@/lib/supabase";

export default function EntrarPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) setError(authErrorMessage(error));
    else router.replace("/inicio");
  }

  return (
    <AuthShell title="Entrar" subtitle="Que bom te ver de novo.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="E-mail">
          {(id) => (
            <input id={id} className="field" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          )}
        </Field>
        <Field label="Senha">
          {(id) => (
            <input id={id} className="field" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
        </Field>
        <div className="text-right">
          <Link href="/recuperar-senha" className="text-sm font-medium text-brand">
            Esqueci minha senha
          </Link>
        </div>
        <ErrorBox>{error}</ErrorBox>
        <Button type="submit" loading={loading} className="w-full">
          Entrar
        </Button>
      </form>
      <p className="mt-8 text-center text-ink-2">
        Ainda não tem conta?{" "}
        <Link href="/cadastro" className="font-semibold text-brand">
          Criar conta
        </Link>
      </p>
    </AuthShell>
  );
}
