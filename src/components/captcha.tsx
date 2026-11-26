"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Verificação anti-robô (Cloudflare Turnstile) nas telas de entrar, criar conta e
// recuperar senha. Só aparece quando NEXT_PUBLIC_TURNSTILE_SITE_KEY está definida;
// sem ela, as telas funcionam como antes. A chave secreta fica no painel do
// Supabase (Authentication → Bot and Abuse Protection), nunca no app.

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
export const captchaEnabled = SITE_KEY !== "";

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render(
    container: HTMLElement,
    params: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
      language: string;
      theme: "light" | "dark";
      size: "flexible";
    },
  ): string | null | undefined;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile")));
    script.onerror = () => {
      loading = null;
      reject(new Error("turnstile"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * Devolve o quadro da verificação para pôr no formulário e o token a mandar ao
 * Supabase. O token vale para uma única tentativa: chame reset() depois de cada envio.
 */
export function useCaptcha() {
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!captchaEnabled || !el) return;
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled) return;
        widget.current =
          turnstile.render(el, {
            sitekey: SITE_KEY,
            callback: (t) => {
              setToken(t);
              setFailed(false);
            },
            "expired-callback": () => setToken(null),
            "error-callback": () => {
              setToken(null);
              setFailed(true);
            },
            language: "pt-br",
            theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
            size: "flexible",
          }) ?? null;
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, []);

  const reset = useCallback(() => {
    if (!captchaEnabled) return;
    setToken(null);
    if (widget.current) window.turnstile?.reset(widget.current);
  }, []);

  const element = captchaEnabled ? (
    <div className="space-y-2">
      <div ref={box} className="min-h-16" />
      {failed ? (
        <p className="text-sm text-expense">Não foi possível carregar a verificação de segurança. Recarregue a página.</p>
      ) : null}
    </div>
  ) : null;

  return {
    element,
    /** token para options.captchaToken (undefined quando a verificação está desligada) */
    token: token ?? undefined,
    /** verificação ligada e ainda não concluída */
    missing: captchaEnabled && !token,
    reset,
  };
}

export const CAPTCHA_MISSING = "Conclua a verificação de segurança antes de continuar.";
