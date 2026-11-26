"use client";

import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { CAPTCHA_MISSING, useCaptcha } from "@/components/captcha";
import { Button, ErrorBox, Field } from "@/components/ui";
import { PASSWORD_HINT, passwordProblem } from "@/lib/password";
import { authErrorMessage, getSupabase } from "@/lib/supabase";

export default function CadastroPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const captcha = useCaptcha();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError("Informe seu nome.");
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (password !== confirm) return setError("As senhas não conferem.");
    if (captcha.missing) return setError(CAPTCHA_MISSING);
    setLoading(true);
    const { data, error } = await getSupabase().auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: name.trim() },
        emailRedirectTo: `${window.location.origin}/inicio`,
        captchaToken: captcha.token,
      },
    });
    setLoading(false);
    captcha.reset();
    if (error) return setError(authErrorMessage(error));
    // Supabase não informa e-mail já cadastrado quando a confirmação está ativa:
    // devolve um usuário sem identidades.
    if (data.user && data.user.identities?.length === 0) return setError("Já existe uma conta com este e-mail.");
    if (data.session) router.replace("/inicio");
    else setSentTo(email.trim());
  }

  if (sentTo) {
    return (
      <AuthShell title="Confirme seu e-mail" redirectIfLoggedIn>
        <div className="card flex flex-col items-center p-6 text-center">
          <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand">
            <MailCheck className="size-7" />
          </div>
          <p className="text-ink-2">
            Enviamos um link de confirmação para <strong className="text-ink">{sentTo}</strong>. Abra o e-mail e toque no link para
            ativar sua conta.
          </p>
        </div>
        <Link href="/entrar" className="mt-6 block text-center font-semibold text-brand">
          Voltar para entrar
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Criar conta" subtitle="Leva menos de um minuto.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Nome">
          {(id) => <input id={id} className="field" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="E-mail">
          {(id) => (
            <input id={id} className="field" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          )}
        </Field>
        <Field label="Senha" hint={PASSWORD_HINT}>
          {(id) => (
            <input id={id} className="field" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
        </Field>
        <Field label="Confirmar senha">
          {(id) => (
            <input id={id} className="field" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          )}
        </Field>
        {captcha.element}
        <ErrorBox>{error}</ErrorBox>
        <Button type="submit" loading={loading} className="w-full">
          Criar conta
        </Button>
      </form>
      <p className="mt-8 text-center text-ink-2">
        Já tem conta?{" "}
        <Link href="/entrar" className="font-semibold text-brand">
          Entrar
        </Link>
      </p>
    </AuthShell>
  );
}
