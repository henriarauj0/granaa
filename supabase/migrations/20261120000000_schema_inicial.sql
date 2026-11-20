-- Granaa: esquema inicial
-- Cada tabela pertence a um usuário (user_id) e é protegida por Row Level Security:
-- cada pessoa só enxerga e altera os próprios dados.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Perfis
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Contas (corrente, poupança, carteira...)
-- ---------------------------------------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  type text not null default 'corrente'
    check (type in ('corrente', 'poupanca', 'carteira', 'investimento', 'outro')),
  initial_balance numeric(14, 2) not null default 0,
  color text not null default '#0E7A4F',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

-- ---------------------------------------------------------------------------
-- Cartões de crédito
-- ---------------------------------------------------------------------------
create table public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  limit_amount numeric(14, 2) not null default 0 check (limit_amount >= 0),
  closing_day smallint not null check (closing_day between 1 and 31),
  due_day smallint not null check (due_day between 1 and 31),
  color text not null default '#14201A',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

-- ---------------------------------------------------------------------------
-- Categorias
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  kind text not null check (kind in ('income', 'expense')),
  color text not null default '#5B6B62',
  created_at timestamptz not null default now(),
  unique (user_id, kind, name),
  unique (id, user_id)
);

-- ---------------------------------------------------------------------------
-- Lançamentos
--   income       receita em conta, ou crédito/estorno no cartão
--   expense      despesa em conta ou compra no cartão
--   card_payment pagamento de fatura (sai da conta, abate a fatura)
--   transfer     transferência entre contas
-- ---------------------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('income', 'expense', 'card_payment', 'transfer')),
  description text not null check (char_length(description) between 1 and 140),
  amount numeric(14, 2) not null check (amount > 0),
  date date not null,
  category_id uuid,
  account_id uuid,
  card_id uuid,
  to_account_id uuid,
  invoice_month date,
  installment_number smallint,
  installment_total smallint,
  installment_group uuid,
  import_id text,
  notes text,
  created_at timestamptz not null default now(),

  -- chaves compostas impedem apontar para conta/cartão/categoria de outro usuário
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade,
  foreign key (to_account_id, user_id) references public.accounts (id, user_id) on delete cascade,
  foreign key (card_id, user_id) references public.credit_cards (id, user_id) on delete cascade,
  foreign key (category_id) references public.categories (id) on delete set null,

  unique (user_id, import_id),

  constraint transactions_shape check (
    case kind
      when 'income' then
        (account_id is not null) <> (card_id is not null)
        and to_account_id is null
      when 'expense' then
        (account_id is not null) <> (card_id is not null)
        and to_account_id is null
      when 'card_payment' then
        account_id is not null and card_id is not null
        and to_account_id is null and invoice_month is not null
      when 'transfer' then
        account_id is not null and to_account_id is not null
        and account_id <> to_account_id and card_id is null
    end
  ),
  constraint transactions_invoice check (card_id is null or invoice_month is not null),
  constraint transactions_installments check (
    (installment_number is null and installment_total is null)
    or (installment_number between 1 and installment_total and installment_total between 2 and 48)
  )
);

create index transactions_user_date_idx on public.transactions (user_id, date desc);
create index transactions_card_invoice_idx on public.transactions (card_id, invoice_month);
create index transactions_group_idx on public.transactions (installment_group);

-- Garante que a categoria usada pertence ao mesmo usuário
create function public.check_transaction_category()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.category_id is not null and not exists (
    select 1 from public.categories c
    where c.id = new.category_id and c.user_id = new.user_id
  ) then
    raise exception 'Categoria inválida';
  end if;
  return new;
end;
$$;

create trigger transactions_check_category
  before insert or update on public.transactions
  for each row execute function public.check_transaction_category();

-- ---------------------------------------------------------------------------
-- Metas de economia (valores-alvo)
-- ---------------------------------------------------------------------------
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  target_amount numeric(14, 2) not null check (target_amount > 0),
  saved_amount numeric(14, 2) not null default 0 check (saved_amount >= 0),
  deadline date,
  color text not null default '#0E7A4F',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.credit_cards enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.goals enable row level security;

create policy "perfil próprio: ler" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "perfil próprio: alterar" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "contas próprias" on public.accounts
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "cartões próprios" on public.credit_cards
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "categorias próprias" on public.categories
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "lançamentos próprios" on public.transactions
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "metas próprias" on public.goals
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on
  public.accounts, public.credit_cards, public.categories, public.transactions, public.goals
  to authenticated;

-- ---------------------------------------------------------------------------
-- Novo cadastro: cria o perfil, uma carteira e as categorias padrão
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)));

  insert into public.accounts (user_id, name, type, color)
  values (new.id, 'Carteira', 'carteira', '#0E7A4F');

  insert into public.categories (user_id, name, kind, color)
  select new.id, c.name, c.kind, c.color
  from (values
    ('Alimentação',       'expense', '#E07A2E'),
    ('Mercado',           'expense', '#C2412D'),
    ('Transporte',        'expense', '#2F6FB0'),
    ('Moradia',           'expense', '#7A4FB0'),
    ('Contas da casa',    'expense', '#3A8F8F'),
    ('Saúde',             'expense', '#D2486B'),
    ('Educação',          'expense', '#4B5BC8'),
    ('Lazer',             'expense', '#D9A21B'),
    ('Compras',           'expense', '#B0507A'),
    ('Assinaturas',       'expense', '#6B7D2A'),
    ('Viagem',            'expense', '#1F8A70'),
    ('Pets',              'expense', '#8A5A2B'),
    ('Presentes',         'expense', '#C45AB3'),
    ('Impostos e taxas',  'expense', '#6B6B6B'),
    ('Outros gastos',     'expense', '#8C9690'),
    ('Salário',           'income',  '#0E7A4F'),
    ('Renda extra',       'income',  '#3E9B5F'),
    ('Investimentos',     'income',  '#2F6FB0'),
    ('Reembolsos',        'income',  '#7A9A3A'),
    ('Outras receitas',   'income',  '#8C9690')
  ) as c (name, kind, color);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
