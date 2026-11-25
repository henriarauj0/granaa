<p align="center">
  <img src="public/icon-192.png" width="96" height="96" alt="Logotipo do Granaa">
</p>

<h1 align="center">Granaa</h1>

<p align="center">
  Controle financeiro pessoal, simples e feito para o celular.<br>
  Acompanhe cada centavo que entra e sai, organize os gastos do dia a dia, controle cartões de crédito e acompanhe suas metas de economia.
</p>

<p align="center">
  <img src="docs/telas/inicio.png" width="230" alt="Tela inicial com saldo, resumo do mês e faturas">
  <img src="docs/telas/cartao.png" width="230" alt="Fatura do cartão de crédito com compras parceladas">
  <img src="docs/telas/metas.png" width="230" alt="Metas de economia com progresso e valor mensal sugerido">
</p>

O Granaa é um aplicativo web que pode ser instalado na tela inicial do celular, no iPhone ou no Android, e funciona como um app comum. Ele roda nos planos gratuitos do [Supabase](https://supabase.com) e da [Vercel](https://vercel.com). Este README explica como ele funciona. Os termos de uso do código estão em [Licença](#licença).

## Funcionalidades

**Lançamentos.** Registre despesas, receitas e transferências entre contas em poucos toques, com categoria, data e observação. A lista mostra os lançamentos agrupados por dia, com busca e filtros por tipo, conta, cartão e categoria, e pode ser vista por mês ou por um dia específico (botão de calendário). Tocar num lançamento abre a edição, onde também dá para excluí-lo. Em **Selecionar**, você marca vários lançamentos (ou todos os da tela) para excluir de uma vez ou trocar a categoria.

**Contas.** Cadastre conta corrente, poupança, carteira e investimentos. O saldo de cada conta é calculado a partir do saldo inicial e dos lançamentos. Se ele não bater com o banco, por exemplo depois de importar um extrato, edite a conta e informe o **saldo de hoje**. O app guarda esse valor como saldo conferido naquela data: lançamentos com data anterior ao acerto ficam no histórico e nos relatórios, mas não mudam o saldo; os posteriores somam ou subtraem normalmente.

**Cartões de crédito.** Informe os dias de fechamento e de vencimento, e o Granaa coloca cada compra na fatura certa. Compras parceladas, em até 24 vezes, são distribuídas automaticamente pelas faturas seguintes. A fatura mostra a situação (aberta, fechada, vencida ou paga), permite registrar o pagamento e acompanha o limite disponível.

**Metas.** Defina um valor-alvo e, se quiser, um prazo. O app mostra o progresso e quanto acumular por mês para chegar lá. A meta é um parâmetro de acompanhamento: você informa o valor acumulado, que pode estar distribuído em várias contas e investimentos.

**Importação de extratos.** Importe arquivos OFX, CSV ou Excel 97-2003 (.xls) exportados pelo banco. Antes de salvar, o app mostra uma prévia em que você confere cada linha. Ele também:

- sugere a categoria com base no seu histórico, em palavras-chave e na categoria informada pelo próprio banco;
- reconhece linhas já importadas e não as duplica;
- identifica transferências entre as suas próprias contas (Pix para o seu nome, aplicações e resgates) e permite registrá-las como transferência, em vez de receita ou despesa;
- pareia estornos e cancelamentos com a compra original e deixa os dois de fora;
- deixa de fora, por padrão, os pagamentos de fatura, para o gasto do cartão não ser contado duas vezes.

O arquivo é lido no próprio aparelho. Só os lançamentos que você confirmar são enviados ao banco de dados.

**Painel inicial.** Saldo total, receitas e despesas do mês, faturas abertas, gastos por categoria, metas e últimos lançamentos. Ao tocar numa categoria, o painel lista os lançamentos que formam aquele total, do maior para o menor, e leva à tela de lançamentos já filtrada pela categoria e pelo mês.

**Investimentos.** Cadastre cada investimento com a classe (renda fixa, Tesouro Direto, ações, fundos imobiliários, ETFs e exterior, fundos, previdência, criptomoedas ou outros) e o valor de hoje, e registre aportes, resgates e atualizações de saldo. A tela mostra o patrimônio, a maior posição, o aporte médio mensal dos últimos 12 meses, a distribuição da carteira por ativo ou por classe e um gráfico de aportes e resgates dos últimos seis meses. O valor de cada investimento parte do último saldo informado, somando os aportes e subtraindo os resgates feitos depois dele. Os investimentos não movimentam as contas nem entram nas despesas.

**Exportação para planilha.** Na tela de lançamentos, o botão **Exportar planilha** gera um arquivo .xlsx com o que está na tela (mês e filtros aplicados) ou com todo o histórico. A planilha tem duas abas: a lista de lançamentos, com data, descrição, tipo, categoria, conta ou cartão, parcela, valor e observações, e um resumo com receitas, despesas, resultado e gastos por categoria. O arquivo é gerado no próprio aparelho e abre no Excel, no Google Planilhas e no Numbers.

**Aparência.** Em **Mais → Aparência**, escolha o tema claro, o escuro (fundo preto com destaques em verde) ou o automático, que segue a configuração do aparelho. A escolha fica salva no aparelho.

**Ícones.** Categorias, contas, cartões e metas podem ter um ícone escolhido numa galeria (casa, mercado, avião, remédio, cofrinho e outros). Sem escolha, o app sugere um ícone pelo nome. O ícone aparece no círculo de cada lançamento, no lugar da inicial da categoria.

**Gráficos.** Os gastos por categoria aparecem num gráfico de rosca no painel inicial e na tela de lançamentos. Tocar numa fatia abre a categoria no painel ou filtra a lista de lançamentos.

<p align="center">
  <img src="docs/telas/novo-lancamento.png" width="230" alt="Novo lançamento parcelado no cartão">
  <img src="docs/telas/lancamentos.png" width="230" alt="Lista de lançamentos agrupados por dia">
  <img src="docs/telas/inicio-escuro.png" width="230" alt="Tela inicial no modo escuro">
</p>

## Como as contas são feitas

- **Compras no cartão** contam como despesa na data da compra. Em compras parceladas, cada parcela conta no seu próprio mês.
- **Pagamento de fatura** apenas tira o dinheiro da conta e abate a fatura. Não conta como despesa de novo.
- **Transferências entre contas** não são receita nem despesa.
- **Saldo da conta** considera o saldo inicial e os lançamentos com data até hoje. Depois de um acerto com o banco, parte do saldo conferido e soma só os lançamentos posteriores ao acerto.
- **Fatura:** uma compra feita a partir do dia de fechamento entra na fatura seguinte.

## Privacidade e segurança

Cada pessoa tem a sua conta e enxerga apenas os próprios dados. Essa separação é garantida no banco de dados por Row Level Security do Postgres, e não só pelo app. Uma pessoa não consegue ler, alterar nem vincular lançamentos às contas, cartões ou categorias de outra. O app guarda apenas o que você digita ou importa e não se conecta às suas contas bancárias.

## Instalação no celular

Abra o endereço no navegador do celular. No iPhone, use **Compartilhar → Adicionar à Tela de Início**. No Android, use **⋮ → Instalar app**.

## Problemas comuns

| O que aparece | Causa provável e solução |
| --- | --- |
| "Index of /" com uma lista de arquivos | O projeto foi publicado como site estático. Confirme que o **Framework Preset** é **Next.js**, que o **Root Directory** está vazio e faça um novo deploy. O `vercel.json` do repositório já define o preset. |
| "Falta configurar o banco de dados" | As variáveis não estavam cadastradas no momento da compilação. Cadastre-as e faça um novo deploy. |
| O endereço definitivo não muda depois de um deploy | O deploy foi feito como *Preview*. Em **Settings → Environments → Production**, confira se a branch de produção é a branch principal do repositório. |
| O link de recuperação de senha abre o endereço errado | Ajuste **Site URL** e **Redirect URLs** no Supabase. |

## Desenvolvimento

Requisitos: Node.js 22 e Docker, para rodar o Supabase localmente.

```bash
npm install
```

```bash
npx supabase start
```

```bash
cp .env.example .env.local
```

Preencha o `.env.local` com a URL e a *publishable key* exibidas pelo `supabase start` e rode:

```bash
npm run dev
```

Verificações:

```bash
npm test
```

```bash
npm run typecheck && npm run lint && npm run build
```

### Tecnologias

[Next.js](https://nextjs.org) e React, [Tailwind CSS](https://tailwindcss.com), [Supabase](https://supabase.com) (Postgres, autenticação e Row Level Security), [Lucide](https://lucide.dev) para os ícones e [Vitest](https://vitest.dev) para os testes. A leitura de arquivos .xls e a geração de arquivos .xlsx são feitas por código próprio, sem dependências externas.

### Estrutura

| Caminho | Conteúdo |
| --- | --- |
| `supabase/migrations/` | Tabelas, regras de segurança e dados iniciais de cada novo usuário |
| `src/lib/finance.ts` | Faturas, saldos, resumo do mês e metas |
| `src/lib/import/` | Leitura de OFX, CSV e XLS, categorização e detecção de transferências e estornos |
| `src/lib/export/` | Geração da planilha .xlsx exportada |
| `src/lib/investments.ts` | Valor dos investimentos, distribuição, aporte médio e fluxo mensal |
| `src/lib/api.ts` | Gravação no banco de dados |
| `src/app/(auth)/` | Entrar, cadastro e recuperação de senha |
| `src/app/(app)/` | Telas do app (início, lançamentos, cartões, metas, contas, categorias, importação) |

## Limitações conhecidas

- Não há conexão automática com bancos (Open Finance). Os lançamentos são digitados ou importados de arquivos.
- Arquivos .xlsx ainda não são aceitos na importação (a exportação usa .xlsx). Salve o extrato como .xls ou CSV, ou exporte em OFX.
- Os formatos de CSV variam muito entre bancos. Quando as colunas não são reconhecidas, a tela de importação permite indicá-las manualmente.
- O app precisa de internet para funcionar.
- Cada conta é individual: não há, por enquanto, finanças compartilhadas entre duas pessoas.

## Licença

Este repositório ainda não tem uma licença definida. Até que uma seja publicada, todos os direitos sobre o código ficam reservados ao autor. O código pode ser consultado, mas não está autorizada a cópia, a modificação nem a redistribuição.
