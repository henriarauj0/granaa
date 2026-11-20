# Granaa

Com o Granaa você acompanha cada centavo que entra e sai da sua conta em segundos. Organize gastos diários, gerencie cartões de crédito, crie metas de economia e conquiste sua tranquilidade financeira na palma da mão.

Aplicativo web pensado para o celular (pode ser instalado na tela inicial), feito em Next.js e hospedado na Vercel. Cadastro, login e banco de dados ficam no Supabase. Cada usuário enxerga apenas os próprios dados, garantido no banco por Row Level Security.

## O que já funciona

- Cadastro com nome, e-mail e senha; login; recuperação e troca de senha.
- Contas (corrente, poupança, carteira, investimento) com saldo inicial e saldo atual calculado.
- Lançamentos manuais de despesa, receita e transferência entre contas, com categoria, data e observação.
- Cartões de crédito com dia de fechamento e de vencimento, compras parceladas em até 24 vezes, fatura por mês (aberta, fechada, vencida, paga), pagamento de fatura e limite disponível.
- Metas com valor-alvo, prazo opcional e cálculo de quanto acumular por mês. A meta é um parâmetro de acompanhamento: o valor acumulado é informado pelo usuário e não movimenta nenhuma conta, pois o dinheiro pode estar distribuído em várias contas e investimentos.
- Importação de extrato em OFX ou CSV, com prévia, sugestão automática de categoria, bloqueio de duplicados e aviso de linhas que parecem pagamento de fatura.
- Painel inicial com saldo, receitas e despesas do mês, faturas, gastos por categoria e metas.
- Modo claro e escuro automáticos.

Regras de contabilização: compras no cartão contam como despesa na data da compra (cada parcela no seu mês). O pagamento da fatura só tira o dinheiro da conta e não conta como despesa de novo. Transferências entre contas também não são receita nem despesa.

## Como publicar

### 1. Criar o banco no Supabase

1. Crie uma conta gratuita em https://supabase.com e clique em **New project**. Escolha a região **South America (São Paulo)**.
2. No projeto, abra **SQL Editor**, cole todo o conteúdo do arquivo `supabase/migrations/20261120000000_schema_inicial.sql` e clique em **Run**.
3. Abra **Project Settings → API Keys** e copie a **Project URL** e a **Publishable key** (`sb_publishable_...`). A chave `anon` antiga também funciona.

### 2. Publicar na Vercel

1. Em https://vercel.com, clique em **Add New → Project** e importe o repositório `granaa` do GitHub.
2. Em **Environment Variables**, cadastre:
   - `NEXT_PUBLIC_SUPABASE_URL` = a Project URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = a Publishable key
3. Clique em **Deploy** e anote o endereço gerado (por exemplo, `https://granaa.vercel.app`).

### 3. Ligar o Supabase ao endereço da Vercel

1. No Supabase, abra **Authentication → URL Configuration**.
2. Em **Site URL**, coloque o endereço da Vercel.
3. Em **Redirect URLs**, adicione `https://SEU-ENDERECO.vercel.app/**`. Sem isso, os links de confirmação de e-mail e de recuperação de senha não funcionam.

### 4. E-mail de confirmação (escolha uma opção)

Com o envio de e-mails embutido, o Supabase manda apenas cerca de 2 e-mails por hora em todo o projeto.

- **Opção simples (para uso só do casal):** em **Authentication → Sign In / Providers → Email**, desligue **Confirm email**. O cadastro entra direto no app, sem e-mail.
- **Opção completa:** mantenha a confirmação ligada e configure um SMTP próprio (Brevo, Resend etc.) em **Authentication → Emails → SMTP Settings**.

### 5. Fechar o cadastro depois que os dois tiverem conta

O endereço da Vercel é público, então qualquer pessoa conseguiria se cadastrar. Os dados continuam isolados, mas é mais seguro fechar a porta. Depois que vocês dois criarem as contas, em **Authentication → Sign In / Providers**, desligue **Allow new users to sign up**. A tela de cadastro passa a mostrar "Novos cadastros estão desativados".

### 6. Instalar no celular

Abra o endereço no navegador do celular. No iPhone, use **Compartilhar → Adicionar à Tela de Início**; no Android, use **⋮ → Instalar app**.

## Desenvolvimento local

```bash
npm install
npx supabase start        # requer Docker; aplica a migração automaticamente
cp .env.example .env.local  # use a URL e a PUBLISHABLE_KEY exibidas pelo comando acima
npm run dev
```

Verificações:

```bash
npm test          # testes da lógica (valores, datas, faturas, importação)
npm run typecheck
npm run lint
npm run build
```

## Estrutura

- `supabase/migrations/` — tabelas, regras de segurança (RLS) e dados iniciais de cada novo usuário (carteira e categorias padrão).
- `src/lib/finance.ts` — cálculo de faturas, saldos, resumo do mês e metas.
- `src/lib/import/` — leitura de OFX e CSV e sugestão de categorias.
- `src/lib/api.ts` — gravação no banco.
- `src/app/(auth)/` — telas de entrar, cadastro e senha.
- `src/app/(app)/` — telas internas (início, lançamentos, cartões, metas, contas, categorias, importar, mais).
