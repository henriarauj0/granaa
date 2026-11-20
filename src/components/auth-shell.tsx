"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { supabaseConfigured } from "@/lib/supabase";
import { useAuth } from "./auth-provider";
import { Logo } from "./logo";
import { ConfigMissing } from "./config-missing";

/** Moldura das telas de entrada. Quem já está logado vai direto para o início. */
export function AuthShell({
  title,
  subtitle,
  children,
  redirectIfLoggedIn = true,
}: {
  title: ReactNode;
  subtitle?: string;
  children: ReactNode;
  redirectIfLoggedIn?: boolean;
}) {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (redirectIfLoggedIn && !loading && session) router.replace("/inicio");
  }, [redirectIfLoggedIn, loading, session, router]);

  if (!supabaseConfigured) return <ConfigMissing />;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-10">
      <div className="mb-10">
        <Logo />
      </div>
      <h1 className="text-3xl leading-tight font-bold tracking-tight text-balance">{title}</h1>
      {subtitle ? <p className="mt-2 text-ink-2">{subtitle}</p> : null}
      <div className="mt-8">{children}</div>
    </main>
  );
}
