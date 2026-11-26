// Política de segurança de conteúdo (CSP) do app.
//
// O que ela garante: a página só carrega scripts, fontes e imagens do próprio app,
// só conversa com o Supabase do projeto e com o Turnstile, e não pode ser aberta
// dentro de outro site. Assim, mesmo que um dia entre um script indevido na
// página, ele não consegue mandar os dados para outro servidor (connect-src).
//
// O que ela não garante: scripts inline continuam liberados ('unsafe-inline'),
// porque o Next.js usa scripts inline para hidratar as páginas pré-renderizadas.
// Bloqueá-los exigiria um nonce por requisição, que obriga renderizar tudo no
// servidor a cada acesso e é incompatível com a pré-renderização parcial que o
// app usa (ver node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).

const TURNSTILE = "https://challenges.cloudflare.com";

function origin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function contentSecurityPolicy({ supabaseUrl, dev }: { supabaseUrl?: string; dev: boolean }): string {
  const supabase = origin(supabaseUrl);
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // em desenvolvimento o React usa eval para mostrar erros do servidor
    "script-src": ["'self'", "'unsafe-inline'", TURNSTILE, ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...(supabase ? [supabase] : []), TURNSTILE, ...(dev ? ["ws:"] : [])],
    "frame-src": [TURNSTILE],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}
