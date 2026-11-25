"use client";

import { Check, Copy, DatabaseZap, KeyRound, Smartphone, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useData } from "@/components/data-provider";
import { Button, EmptyState, ErrorBox, Field, PageHeader } from "@/components/ui";
import { deleteShortcutKey, generateShortcutKey, getShortcutStatus, setShortcutAccount, type ShortcutStatus } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { supabasePublic } from "@/lib/supabase";

const ENDPOINT = `${supabasePublic.url}/rest/v1/rpc/registrar_compra`;

function when(iso: string | null): string {
  if (!iso) return "nunca";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function ApplePayPage() {
  const { accounts } = useData();
  const active = accounts.filter((a) => !a.archived);
  const [status, setStatus] = useState<ShortcutStatus | null>(null);
  const [account, setAccount] = useState("");
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await getShortcutStatus();
      setStatus(s);
      setAccount((prev) => prev || s.defaultAccountId || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar o atalho.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial da página
    load();
  }, [load]);

  const chosen = account || active[0]?.id || "";

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setTest(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo deu errado.");
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    if (status?.active && !window.confirm("Gerar uma chave nova desliga a anterior. O atalho do iPhone vai precisar da chave nova. Continuar?")) return;
    await run(async () => setKey(await generateShortcutKey(chosen)));
  }

  async function testConnection() {
    if (!key) return;
    setBusy(true);
    setTest(null);
    setError(null);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { apikey: supabasePublic.key, "Content-Type": "application/json" },
        body: JSON.stringify({ chave: key, valor: "R$ 1,00", estabelecimento: "Teste do atalho", cartao: "", teste: true }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message ?? `Erro ${res.status}`);
      setTest(`Funcionou. Uma compra de ${formatMoney(body.valor)} iria para ${body.onde}. Nada foi gravado.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "O teste falhou.");
    } finally {
      setBusy(false);
    }
  }

  if (status && !status.ready) {
    return (
      <>
        <PageHeader title="Apple Pay" back="/mais" />
        <div className="card">
          <EmptyState
            icon={<DatabaseZap className="size-6" />}
            title="Falta preparar o banco de dados"
            text="Rode no SQL Editor do Supabase o arquivo supabase/migrations/20261127000000_atalho_apple_pay.sql e abra esta tela de novo."
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Apple Pay" back="/mais" subtitle="Registra sozinho cada compra por aproximação no iPhone" />

      <div className="space-y-5">
        <section className="card space-y-4 p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
              <Smartphone className="size-5" />
            </span>
            <div className="text-sm text-ink-2">
              {status?.active ? (
                <>
                  <p className="font-semibold text-ink">Atalho ligado</p>
                  <p>Última compra recebida: {when(status.lastUsedAt)}</p>
                </>
              ) : (
                <p>
                  O app Atalhos do iPhone avisa o Granaa a cada pagamento com Apple Pay, e a compra entra como despesa: no
                  cartão de crédito com o mesmo nome do cartão da Carteira, numa conta com o mesmo nome ou, se nenhum
                  bater, na conta padrão abaixo.
                </p>
              )}
            </div>
          </div>

          <Field label="Conta padrão" hint="Usada quando o cartão do Apple Pay não tem um cartão ou conta com o mesmo nome no Granaa.">
            {(id) => (
              <select
                id={id}
                className="field"
                value={chosen}
                disabled={busy}
                onChange={(e) => {
                  const value = e.target.value;
                  setAccount(value);
                  if (status?.active) run(() => setShortcutAccount(value));
                }}
              >
                {active.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <ErrorBox>{error}</ErrorBox>

          {key ? (
            <div className="space-y-2 rounded-2xl border border-brand p-4">
              <p className="text-sm font-semibold">Sua chave (aparece só agora)</p>
              <CopyValue value={key} />
              <p className="text-xs text-muted">
                Cole no atalho do iPhone, no campo <strong>chave</strong>. Ela só registra despesas na sua conta. Se perder,
                gere outra; a anterior deixa de funcionar.
              </p>
              <Button variant="secondary" className="w-full" loading={busy} onClick={testConnection}>
                Testar conexão
              </Button>
              {test ? (
                <p className="flex items-start gap-2 text-sm text-income">
                  <Check className="mt-0.5 size-4 shrink-0" /> {test}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-2">
            <Button onClick={generate} loading={busy} disabled={!chosen}>
              <KeyRound className="size-4" /> {status?.active ? "Gerar chave nova" : "Gerar chave do atalho"}
            </Button>
            {status?.active ? (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  if (window.confirm("Desligar o atalho? As próximas compras deixam de ser registradas.")) {
                    run(async () => {
                      await deleteShortcutKey();
                      setKey(null);
                    });
                  }
                }}
              >
                <Trash2 className="size-4" /> Desligar atalho
              </Button>
            ) : null}
          </div>
        </section>

        <section className="card space-y-3 p-5">
          <h2 className="font-semibold">Dados para o atalho</h2>
          <p className="text-sm text-muted">Copie cada valor no passo indicado abaixo.</p>
          <div className="space-y-1">
            <p className="text-xs font-medium text-ink-2">Endereço (URL)</p>
            <CopyValue value={ENDPOINT} />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-ink-2">Cabeçalho apikey (chave pública do app)</p>
            <CopyValue value={supabasePublic.key} />
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Como montar no iPhone (iOS 17 ou mais novo)</h2>
          <ol className="list-decimal space-y-3 pl-5 text-sm text-ink-2 marker:font-semibold marker:text-ink">
            <li>
              Abra o app <strong>Atalhos</strong>, vá na aba <strong>Automação</strong> e toque em <strong>+</strong>.
            </li>
            <li>
              Escolha <strong>Transação</strong> (no iOS 26 o nome é <strong>Carteira</strong>). Deixe marcados os cartões
              que você usa e todas as categorias, marque <strong>Executar Imediatamente</strong> e toque em{" "}
              <strong>Seguinte</strong> → <strong>Nova Automação em Branco</strong>.
            </li>
            <li>
              Adicione a ação <strong>Obter Conteúdo do URL</strong> e cole o <strong>Endereço (URL)</strong>.
            </li>
            <li>
              Toque na seta da ação para ver mais opções. Em <strong>Método</strong>, escolha <strong>POST</strong>.
            </li>
            <li>
              Em <strong>Cabeçalhos</strong>, adicione dois: <code>apikey</code> com a chave pública copiada acima, e{" "}
              <code>Content-Type</code> com <code>application/json</code>.
            </li>
            <li>
              Em <strong>Corpo da Solicitação</strong>, escolha <strong>JSON</strong> e adicione quatro campos de texto:
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  <code>chave</code>: a sua chave pessoal;
                </li>
                <li>
                  <code>valor</code>: toque em <strong>Entrada do Atalho</strong> e escolha <strong>Quantia</strong>;
                </li>
                <li>
                  <code>estabelecimento</code>: <strong>Entrada do Atalho</strong> → <strong>Comerciante</strong>;
                </li>
                <li>
                  <code>cartao</code>: <strong>Entrada do Atalho</strong> → <strong>Cartão ou Passe</strong>.
                </li>
              </ul>
            </li>
            <li>
              Toque em <strong>OK</strong>. Na próxima compra por aproximação, ela aparece em Lançamentos.
            </li>
          </ol>
          <p className="mt-4 text-xs text-muted">
            Os nomes das opções podem variar um pouco entre versões do iOS. Para o cartão cair no lugar certo, dê ao cartão
            ou conta no Granaa um nome que apareça no nome do cartão da Carteira (por exemplo, &quot;Nubank&quot;). Compras
            parceladas entram como à vista; ajuste no app se precisar. Se a automação falhar, confira se a Carteira pode usar
            dados móveis em Ajustes.
          </p>
        </section>
      </div>
    </>
  );
}

function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-xl bg-surface-2 p-2 pl-3">
      <code className="min-w-0 flex-1 break-all text-xs">{value}</code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            // sem permissão de área de transferência: o texto continua visível para copiar à mão
          }
        }}
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-2"
        aria-label="Copiar"
        title="Copiar"
      >
        {copied ? <Check className="size-4 text-income" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}
