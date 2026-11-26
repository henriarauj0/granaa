"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { AuthShell } from "@/components/auth-shell";
import { CAPTCHA_MISSING, useCaptcha } from "@/components/captcha";
import { Button, ErrorBox, Field, Spinner } from "@/components/ui";
import { PASSWORD_HINT, passwordProblem } from "@/lib/password";
import { authErrorMessage, getSupabase } from "@/lib/supabase";

export default function NovaSenhaPage() {
  const { session, loading: authLoading, recovering } = useAuth();

  return (
    <AuthShell title="Nova senha" redirectIfLoggedIn={false}>
      {authLoading ? (
        <Spinner />
      ) : session && recovering ? (
        <NewPasswordForm />
      ) : session ? (
        <SendLinkToSelf email={session.user.email ?? ""} />
      ) : (
        <div className="space-y-4">
          <p className="text-ink-2">
            O link é inválido, expirou ou foi aberto num navegador diferente daquele em que você pediu. Peça um novo e abra o
            e-mail neste mesmo aparelho e navegador.
          </p>
          <Link href="/recuperar-senha" className="font-semibold text-brand">
            Pedir novo link
          </Link>
        </div>
      )}
    </AuthShell>
  );
}

function NewPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (password !== confirm) return setError("As senhas não conferem.");
    setLoading(true);
    const { error } = await getSupabase().auth.updateUser({ password });
    setLoading(false);
    if (error) setError(authErrorMessage(error));
    else router.replace("/inicio");
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Nova senha" hint={PASSWORD_HINT}>
        {(id) => (
          <input id={id} className="field" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        )}
      </Field>
      <Field label="Confirmar nova senha">
        {(id) => (
          <input id={id} className="field" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        )}
      </Field>
      <p className="text-sm text-muted">Trocar a senha desliga o atalho do Apple Pay. Depois, gere uma chave nova em Mais → Apple Pay.</p>
      <ErrorBox>{error}</ErrorBox>
      <Button type="submit" loading={loading} className="w-full">
        Salvar nova senha
      </Button>
    </form>
  );
}

/** Logado, mas sem ter vindo de um link de redefinição: confirma pelo e-mail antes de trocar. */
function SendLinkToSelf({ email }: { email: string }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const captcha = useCaptcha();

  async function send() {
    setError(null);
    if (captcha.missing) return setError(CAPTCHA_MISSING);
    setLoading(true);
    const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/nova-senha`,
      captchaToken: captcha.token,
    });
    setLoading(false);
    captcha.reset();
    if (error) setError(authErrorMessage(error));
    else setSent(true);
  }

  if (sent) {
    return (
      <p className="card p-5 text-ink-2">
        Enviamos um link para <strong className="text-ink">{email}</strong>. Abra o e-mail neste mesmo aparelho e navegador para
        criar a nova senha.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-ink-2">
        Para trocar a senha, confirme que o e-mail é seu. Vamos mandar um link para <strong className="text-ink">{email}</strong>.
      </p>
      {captcha.element}
      <ErrorBox>{error}</ErrorBox>
      <Button onClick={send} loading={loading} disabled={!email} className="w-full">
        Enviar link
      </Button>
      <Link href="/inicio" className="block text-center font-semibold text-brand">
        Voltar
      </Link>
    </div>
  );
}
