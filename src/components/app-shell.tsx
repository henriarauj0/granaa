"use client";

import { ChartNoAxesColumn, CreditCard, Home, ListOrdered, Plus, Target } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { supabaseConfigured } from "@/lib/supabase";
import { useAuth } from "./auth-provider";
import { ConfigMissing } from "./config-missing";
import { DataProvider, useData } from "./data-provider";
import { LogoMark } from "./logo";
import { Button, ErrorBox } from "./ui";

const NAV = [
  { href: "/inicio", label: "Início", icon: Home },
  { href: "/lancamentos", label: "Lançamentos", icon: ListOrdered },
  { href: "/cartoes", label: "Cartões", icon: CreditCard },
  { href: "/investimentos", label: "Investir", icon: ChartNoAxesColumn },
  { href: "/metas", label: "Metas", icon: Target },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (supabaseConfigured && !loading && !session) router.replace("/entrar");
  }, [loading, session, router]);

  if (!supabaseConfigured) return <ConfigMissing />;
  if (loading || !session) return <Splash />;

  return (
    <DataProvider>
      <div className="mx-auto min-h-dvh w-full max-w-2xl px-4 pb-32 pt-6 sm:px-6">
        <DataGate>{children}</DataGate>
      </div>
      <BottomNav />
    </DataProvider>
  );
}

function Splash() {
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <LogoMark className="size-14 animate-pulse" />
    </main>
  );
}

function DataGate({ children }: { children: ReactNode }) {
  const { loading, error, reload } = useData();
  if (loading) return <Splash />;
  if (error)
    return (
      <div className="space-y-4 py-10">
        <ErrorBox>Não foi possível carregar seus dados: {error}</ErrorBox>
        <Button onClick={() => reload()}>Tentar de novo</Button>
      </div>
    );
  return <>{children}</>;
}

function BottomNav() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const left = NAV.slice(0, 2);
  const right = NAV.slice(2);
  // cada item parte da largura do próprio rótulo e divide o que sobrar
  const item = ({ href, label, icon: Icon }: (typeof NAV)[number]) => (
    <Link
      key={href}
      href={href}
      aria-current={isActive(href) ? "page" : undefined}
      className="flex min-w-0 flex-auto flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted aria-[current=page]:text-brand"
    >
      <Icon className="size-6" strokeWidth={isActive(href) ? 2.4 : 1.8} />
      <span className="max-w-full truncate">{label}</span>
    </Link>
  );
  return (
    <nav aria-label="Navegação principal" className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center px-0.5">
        {left.map(item)}
        <div className="flex w-16 flex-none justify-center">
          <Link
            href="/lancamentos/novo"
            aria-label="Novo lançamento"
            className="-mt-6 flex size-14 items-center justify-center rounded-2xl bg-brand text-on-brand shadow-lg ring-4 ring-bg"
          >
            <Plus className="size-7" strokeWidth={2.5} />
          </Link>
        </div>
        {right.map(item)}
      </div>
    </nav>
  );
}
