"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { Button, ErrorBox, Field } from "@/components/ui";
import { authErrorMessage, getSupabase } from "@/lib/supabase";

export default function RecuperarSenhaPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/nova-senha`,
    });
    setLoading(false);
    if (error) setError(authErrorMessage(error));
    else setSent(true);
  }

  return (
    <AuthShell title="Recuperar senha" subtitle="Enviaremos um link para você criar uma nova senha.">
      {sent ? (
        <p className="card p-5 text-ink-2">
          Se existir uma conta com <strong className="text-ink">{email}</strong>, o link chegará em instantes. Confira também a caixa de spam.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="E-mail">
            {(id) => (
              <input id={id} className="field" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            )}
          </Field>
          <ErrorBox>{error}</ErrorBox>
          <Button type="submit" loading={loading} className="w-full">
            Enviar link
          </Button>
        </form>
      )}
      <Link href="/entrar" className="mt-8 block text-center font-semibold text-brand">
        Voltar para entrar
      </Link>
    </AuthShell>
  );
}
