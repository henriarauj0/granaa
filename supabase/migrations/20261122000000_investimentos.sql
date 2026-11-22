-- Investimentos: ativos da carteira e suas movimentações.
--   aporte   dinheiro aplicado no ativo
--   resgate  dinheiro retirado do ativo
--   saldo    valor atualizado do ativo numa data (rendimento ou perda)
-- É um acompanhamento à parte: não movimenta as contas nem entra nas despesas.

create table public.investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  asset_class text not null default 'renda_fixa'
    check (asset_class in ('renda_fixa', 'tesouro', 'acoes', 'fiis', 'etfs', 'fundos', 'previdencia', 'cripto', 'outros')),
  institution text check (char_length(institution) <= 60),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.investment_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  investment_id uuid not null,
  kind text not null check (kind in ('aporte', 'resgate', 'saldo')),
  amount numeric(14, 2) not null check (amount >= 0),
  date date not null,
  notes text check (char_length(notes) <= 280),
  created_at timestamptz not null default now(),
  -- chave composta impede apontar para o ativo de outro usuário
  foreign key (investment_id, user_id) references public.investments (id, user_id) on delete cascade,
  constraint investment_movements_amount check (kind = 'saldo' or amount > 0)
);

create index investment_movements_user_date_idx on public.investment_movements (user_id, date desc);
create index investment_movements_investment_idx on public.investment_movements (investment_id, date);

alter table public.investments enable row level security;
alter table public.investment_movements enable row level security;

create policy "investimentos próprios" on public.investments
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "movimentações de investimento próprias" on public.investment_movements
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.investments, public.investment_movements to authenticated;
