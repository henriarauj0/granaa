import { Logo } from "./logo";

export function ConfigMissing() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-5">
      <Logo />
      <h1 className="text-2xl font-bold">Falta configurar o banco de dados</h1>
      <p className="text-ink-2">
        Defina as variáveis <code className="rounded bg-surface-2 px-1">NEXT_PUBLIC_SUPABASE_URL</code> e{" "}
        <code className="rounded bg-surface-2 px-1">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> na Vercel (ou no arquivo{" "}
        <code className="rounded bg-surface-2 px-1">.env.local</code>) e publique novamente. O passo a passo está no README do
        projeto.
      </p>
    </main>
  );
}
