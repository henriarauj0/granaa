"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth-provider";
import { ConfigMissing } from "@/components/config-missing";
import { LogoMark } from "@/components/logo";
import { supabaseConfigured } from "@/lib/supabase";

export default function Home() {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && supabaseConfigured) router.replace(session ? "/inicio" : "/entrar");
  }, [loading, session, router]);

  if (!supabaseConfigured) return <ConfigMissing />;
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <LogoMark className="size-14 animate-pulse" />
    </main>
  );
}
