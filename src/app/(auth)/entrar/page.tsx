"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { CAPTCHA_MISSING, useCaptcha } from "@/components/captcha";
import { FinancePhrase } from "@/components/finance-phrase";
import { GoogleButton, OrDivider } from "@/components/google-button";
import { Button, ErrorBox, Field } from "@/components/ui";
import { authErrorMessage, getSupabase } from "@/lib/supabase";

export default function EntrarPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const captcha = useCaptcha();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (captcha.missing) return setError(CAPTCHA_MISSING);
    setLoading(true);
    const { error } = await getSupabase().auth.signInWithPassword({
      email: email.trim(),
      password,
      options: { captchaToken: captcha.token },
    });
    setLoading(false);
    captcha.reset();
    if (error) setError(authErrorMessage(error));
    else router.replace("/inicio");
  }

  return (
    <AuthShell title={<FinancePhrase />} subtitle="Entre na sua conta.">
      <div className="mb-6 space-y-6">
        <GoogleButton />
        <OrDivider />
      </div>
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
        {captcha.element}
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
