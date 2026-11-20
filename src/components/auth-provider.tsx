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
      setState((s) => ({ ...s, session: data.session, loading: false }));
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setState((s) => ({
        session,
        loading: false,
        recovering: event === "PASSWORD_RECOVERY" ? true : event === "SIGNED_OUT" ? false : s.recovering,
      }));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return <AuthContext value={state}>{children}</AuthContext>;
}

export function useAuth() {
  return useContext(AuthContext);
}
