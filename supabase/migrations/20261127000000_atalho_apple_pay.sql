-- Atalho do Apple Pay: o app Atalhos do iPhone avisa o Granaa a cada compra por
-- aproximação e a função public.registrar_compra cria a despesa.
--
-- Segurança:
--   * cada usuário tem no máximo uma chave; o banco guarda só o hash SHA-256
--   * a chave só permite registrar despesas na conta do próprio dono, nada mais
--   * gerar, trocar e apagar a chave exige estar logado no app

create table public.shortcut_keys (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  key_hash text not null unique,
  -- conta usada quando o cartão do Apple Pay não corresponde a nenhum cartão ou conta do Granaa
  default_account_id uuid references public.accounts (id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.shortcut_keys enable row level security;

create policy "chave do atalho própria: ler" on public.shortcut_keys
  for select to authenticated using (user_id = (select auth.uid()));
create policy "chave do atalho própria: apagar" on public.shortcut_keys
  for delete to authenticated using (user_id = (select auth.uid()));

-- o Supabase dá acesso a tabelas novas para anon e authenticated por padrão; aqui fica só o necessário
revoke all on public.shortcut_keys from anon, authenticated;
grant select, delete on public.shortcut_keys to authenticated;

-- ---------------------------------------------------------------------------
-- Gerar (ou trocar) a chave. Devolve a chave uma única vez; o banco guarda só o hash.
-- ---------------------------------------------------------------------------
create function public.gerar_chave_atalho(conta_padrao uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  chave text;
begin
  if uid is null then
    raise exception 'Entre no app para gerar a chave.';
  end if;
  if conta_padrao is null or not exists (
    select 1 from public.accounts a where a.id = conta_padrao and a.user_id = uid
  ) then
    raise exception 'Conta padrão inválida.';
  end if;

  -- 64 caracteres hexadecimais vindos de dois UUID aleatórios (cerca de 244 bits)
  chave := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  insert into public.shortcut_keys (user_id, key_hash, default_account_id)
  values (uid, encode(sha256(convert_to(chave, 'UTF8')), 'hex'), conta_padrao)
  on conflict (user_id) do update
    set key_hash = excluded.key_hash,
        default_account_id = excluded.default_account_id,
        created_at = now(),
        last_used_at = null;

  return chave;
end;
$$;

-- Troca só a conta padrão, sem mudar a chave.
create function public.definir_conta_atalho(conta_padrao uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not exists (
    select 1 from public.accounts a where a.id = conta_padrao and a.user_id = uid
  ) then
    raise exception 'Conta padrão inválida.';
  end if;
  update public.shortcut_keys set default_account_id = conta_padrao where user_id = uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Texto sem acentos e em minúsculas, para comparar nomes de cartão
-- ---------------------------------------------------------------------------
create function public.normalizar_nome(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(regexp_replace(
    translate(lower(coalesce(t, '')), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
    '[^a-z0-9]+', ' ', 'g'
  ));
$$;

-- ---------------------------------------------------------------------------
-- Valor em texto ("R$ 1.234,56", "42,9", "42.90") para número
-- ---------------------------------------------------------------------------
create function public.valor_do_texto(t text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  s text := regexp_replace(coalesce(t, ''), '[^0-9,.]', '', 'g');
begin
  if s = '' then
    return null;
  end if;
  if position(',' in s) > 0 then
    -- formato brasileiro: ponto é milhar, vírgula é decimal
    s := replace(replace(s, '.', ''), ',', '.');
  elsif s ~ '^[0-9]{1,3}(\.[0-9]{3})+$' then
    -- "1.234" é milhar
    s := replace(s, '.', '');
  end if;
  if s !~ '^[0-9]+(\.[0-9]+)?$' then
    return null;
  end if;
  return round(s::numeric, 2);
end;
$$;

-- ---------------------------------------------------------------------------
-- Registrar uma compra feita com Apple Pay.
-- Chamada pelo app Atalhos com a chave do usuário (papel anon).
-- Com teste = true, só confere a chave e devolve o que seria registrado.
-- ---------------------------------------------------------------------------
create function public.registrar_compra(
  chave text,
  valor text,
  estabelecimento text default null,
  cartao text default null,
  teste boolean default false
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.shortcut_keys%rowtype;
  quantia numeric;
  descricao text;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  nome_cartao text := public.normalizar_nome(cartao);
  c public.credit_cards%rowtype;
  conta uuid;
  onde text;
  categoria uuid;
  fechamento int;
  mes_fechamento date;
  fatura date;
  novo uuid;
begin
  select * into k
  from public.shortcut_keys
  where key_hash = encode(sha256(convert_to(coalesce(chave, ''), 'UTF8')), 'hex');
  if not found then
    raise exception 'Chave do atalho inválida. Gere uma nova em Mais → Apple Pay.' using errcode = '28000';
  end if;

  quantia := public.valor_do_texto(valor);
  if quantia is null or quantia <= 0 then
    raise exception 'Valor da compra inválido: %', coalesce(valor, '(vazio)');
  end if;

  descricao := left(coalesce(nullif(trim(estabelecimento), ''), 'Compra com Apple Pay'), 140);

  -- 1) cartão de crédito com nome parecido com o cartão da Carteira
  if nome_cartao <> '' then
    select * into c
    from public.credit_cards cc
    where cc.user_id = k.user_id
      and not cc.archived
      and public.normalizar_nome(cc.name) <> ''
      and (position(public.normalizar_nome(cc.name) in nome_cartao) > 0
           or position(nome_cartao in public.normalizar_nome(cc.name)) > 0)
    order by length(cc.name) desc
    limit 1;
  end if;

  if c.id is not null then
    onde := c.name;
  else
    -- 2) conta com nome parecido; 3) conta padrão escolhida pelo usuário
    if nome_cartao <> '' then
      select a.id, a.name into conta, onde
      from public.accounts a
      where a.user_id = k.user_id
        and not a.archived
        and public.normalizar_nome(a.name) <> ''
        and (position(public.normalizar_nome(a.name) in nome_cartao) > 0
             or position(nome_cartao in public.normalizar_nome(a.name)) > 0)
      order by length(a.name) desc
      limit 1;
    end if;
    if conta is null then
      select a.id, a.name into conta, onde
      from public.accounts a
      where a.id = k.default_account_id and a.user_id = k.user_id;
    end if;
    if conta is null then
      raise exception 'Escolha a conta padrão em Mais → Apple Pay.';
    end if;
  end if;

  -- categoria da última despesa com a mesma descrição
  select t.category_id into categoria
  from public.transactions t
  where t.user_id = k.user_id
    and t.kind = 'expense'
    and t.category_id is not null
    and lower(t.description) = lower(descricao)
  order by t.date desc, t.created_at desc
  limit 1;

  if teste then
    return json_build_object('ok', true, 'teste', true, 'descricao', descricao, 'valor', quantia, 'onde', onde);
  end if;

  -- mesma compra enviada duas vezes em poucos minutos: não duplica
  select t.id into novo
  from public.transactions t
  where t.user_id = k.user_id
    and t.description = descricao
    and t.amount = quantia
    and t.date = hoje
    and t.created_at > now() - interval '3 minutes'
  limit 1;

  if novo is null then
    if c.id is not null then
      -- mesma regra do app: a partir do dia de fechamento, a compra vai para a fatura seguinte
      fechamento := least(c.closing_day, extract(day from (date_trunc('month', hoje) + interval '1 month - 1 day'))::int);
      mes_fechamento := date_trunc('month', hoje)::date;
      if extract(day from hoje)::int >= fechamento then
        mes_fechamento := (mes_fechamento + interval '1 month')::date;
      end if;
      fatura := case when c.due_day > c.closing_day then mes_fechamento else (mes_fechamento + interval '1 month')::date end;

      insert into public.transactions (user_id, kind, description, amount, date, category_id, card_id, invoice_month, notes)
      values (k.user_id, 'expense', descricao, quantia, hoje, categoria, c.id, fatura, 'Registrado pelo atalho do Apple Pay')
      returning id into novo;
    else
      insert into public.transactions (user_id, kind, description, amount, date, category_id, account_id, notes)
      values (k.user_id, 'expense', descricao, quantia, hoje, categoria, conta, 'Registrado pelo atalho do Apple Pay')
      returning id into novo;
    end if;
  end if;

  update public.shortcut_keys set last_used_at = now() where user_id = k.user_id;

  return json_build_object('ok', true, 'id', novo, 'descricao', descricao, 'valor', quantia, 'onde', onde);
end;
$$;

-- só o necessário para cada papel (o Supabase concede execução a anon e
-- authenticated por padrão em funções novas, então a revogação é explícita)
revoke all on function public.gerar_chave_atalho(uuid) from public, anon, authenticated;
revoke all on function public.definir_conta_atalho(uuid) from public, anon, authenticated;
revoke all on function public.registrar_compra(text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.normalizar_nome(text) from public, anon, authenticated;
revoke all on function public.valor_do_texto(text) from public, anon, authenticated;

grant execute on function public.gerar_chave_atalho(uuid) to authenticated;
grant execute on function public.definir_conta_atalho(uuid) to authenticated;
grant execute on function public.registrar_compra(text, text, text, text, boolean) to anon, authenticated;
