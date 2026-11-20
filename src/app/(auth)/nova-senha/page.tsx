"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { AuthShell } from "@/components/auth-shell";
import { Button, ErrorBox, Field, Spinner } from "@/components/ui";
import { authErrorMessage, getSupabase } from "@/lib/supabase";

export default function NovaSenhaPage() {
  const { session, loading: authLoading } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("A senha precisa ter pelo menos 8 caracteres.");
    if (password !== confirm) return setError("As senhas não conferem.");
    setLoading(true);
    const { error } = await getSupabase().auth.updateUser({ password });
    setLoading(false);
    if (error) setError(authErrorMessage(error));
    else router.replace("/inicio");
  }

  return (
    <AuthShell title="Nova senha" redirectIfLoggedIn={false}>
      {authLoading ? (
        <Spinner />
      ) : !session ? (
        <div className="space-y-4">
          <p className="text-ink-2">O link é inválido ou expirou. Peça um novo.</p>
          <Link href="/recuperar-senha" className="font-semibold text-brand">
            Pedir novo link
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Nova senha" hint="Mínimo de 8 caracteres.">
            {(id) => (
              <input id={id} className="field" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            )}
          </Field>
          <Field label="Confirmar nova senha">
            {(id) => (
              <input id={id} className="field" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            )}
          </Field>
          <ErrorBox>{error}</ErrorBox>
          <Button type="submit" loading={loading} className="w-full">
            Salvar nova senha
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
