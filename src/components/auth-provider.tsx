"use client";

import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getSupabase, supabaseConfigured } from "@/lib/supabase";

interface AuthState {
  session: Session | null;
  /** true enquanto a sessão salva ainda está sendo lida */
  loading: boolean;
  /** true quando o usuário chegou por um link de redefinição de senha */
  recovering: boolean;
}

const AuthContext = createContext<AuthState>({ session: null, loading: true, recovering: false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    loading: supabaseConfigured,
    recovering: false,
  });

  useEffect(() => {
    if (!supabaseConfigured) return;
    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data }) => {
      // O aviso de PASSWORD_RECOVERY sai numa tarefa à parte logo depois de a sessão
      // ser lida; esperar uma volta evita mostrar por um instante a tela errada.
      setTimeout(() => setState((s) => ({ ...s, session: data.session, loading: false })), 0);
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setState((s) => ({
        ...s,
        session,
        // só um link de redefinição pedido por este navegador libera a troca de senha
        recovering:
          event === "PASSWORD_RECOVERY" ? true : event === "SIGNED_OUT" || event === "USER_UPDATED" ? false : s.recovering,
      }));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return <AuthContext value={state}>{children}</AuthContext>;
}

export function useAuth() {
  return useContext(AuthContext);
}
