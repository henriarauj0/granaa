import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && key);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseConfigured) {
    throw new Error("Supabase não configurado: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  }
  if (!client) {
    client = createClient(url!, key!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}

/** Traduz mensagens de erro do Supabase Auth para português. */
export function authErrorMessage(error: { message?: string; code?: string } | null | undefined): string {
  if (!error) return "";
  const m = (error.message ?? "").toLowerCase();
  const code = error.code ?? "";
  if (code === "invalid_credentials" || m.includes("invalid login credentials"))
    return "E-mail ou senha incorretos.";
  if (code === "email_not_confirmed" || m.includes("email not confirmed"))
    return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
  if (code === "user_already_exists" || m.includes("already registered"))
    return "Já existe uma conta com este e-mail.";
  if (code === "weak_password" || m.includes("password should be"))
    return "Senha fraca. Use pelo menos 8 caracteres, com letras e números.";
  if (code === "signup_disabled" || m.includes("signups not allowed"))
    return "Novos cadastros estão desativados.";
  if (code === "over_email_send_rate_limit" || m.includes("rate limit"))
    return "Muitas tentativas em pouco tempo. Aguarde alguns minutos.";
  if (m.includes("invalid email") || code === "email_address_invalid") return "E-mail inválido.";
  if (code === "same_password") return "A nova senha precisa ser diferente da atual.";
  if (m.includes("failed to fetch") || m.includes("network")) return "Sem conexão. Verifique sua internet.";
  return error.message ?? "Algo deu errado. Tente novamente.";
}
