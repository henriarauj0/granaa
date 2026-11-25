-- Correções da auditoria de segurança (novembro de 2026).
--
-- 1. registrar_compra não devolve mais o nome do cartão ou da conta de destino.
--    Quem tivesse a chave do atalho conseguia, no modo teste e sem deixar rastro,
--    descobrir os nomes dos cartões e contas do dono letra por letra.
-- 2. A conta padrão do atalho precisa estar ativa (não arquivada).
-- 3. Duas chamadas iguais ao mesmo tempo não duplicam a despesa.
-- 4. valor_do_texto recusa valores negativos e textos como "1e9", e entende "1,234.56".
-- 5. Trocar a senha desliga o atalho do Apple Pay (a chave antiga deixa de valer).
-- 6. Cores só no formato #RRGGBB, perfil só com o nome editável e categoria do
--    lançamento amarrada ao dono por chave estrangeira.

-- ---------------------------------------------------------------------------
-- 4. Valor em texto para número
-- ---------------------------------------------------------------------------
create or replace function public.valor_do_texto(t text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  -- espaços especiais (sem quebra) viram espaço comum
  bruto text := translate(btrim(coalesce(t, '')), chr(160) || chr(8239), '  ');
  s text;
begin
  -- sinal negativo (estorno) ou letras e símbolos entre os dígitos ("1e9"): recusa
  if bruto ~ '[-−]' or bruto ~ '[0-9][^0-9., ]+[0-9]' then
    return null;
  end if;

  s := regexp_replace(bruto, '[^0-9,.]', '', 'g');
  if s = '' then
    return null;
  end if;

  if position(',' in s) > 0 and position('.' in s) > 0 then
    -- os dois separadores: o último é o decimal ("1.234,56" ou "1,234.56")
    if length(s) - position(',' in reverse(s)) > length(s) - position('.' in reverse(s)) then
      s := replace(replace(s, '.', ''), ',', '.');
    else
      s := replace(s, ',', '');
    end if;
  elsif s ~ '^[0-9]{1,3}(,[0-9]{3}){2,}$' then
    -- "1,234,567" só pode ser milhar
    s := replace(s, ',', '');
  elsif position(',' in s) > 0 then
    -- formato brasileiro: vírgula é decimal
    s := replace(s, ',', '.');
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
-- 1, 2 e 3. Registrar uma compra feita com Apple Pay
-- A resposta traz só a confirmação, a descrição e o valor; nada sobre os
-- cartões ou contas do dono.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_compra(
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

  if c.id is null then
    -- 2) conta com nome parecido; 3) conta padrão escolhida pelo usuário, se ainda ativa
    if nome_cartao <> '' then
      select a.id into conta
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
      select a.id into conta
      from public.accounts a
      where a.id = k.default_account_id and a.user_id = k.user_id and not a.archived;
    end if;
    if conta is null then
      raise exception 'Escolha a conta padrão em Mais → Apple Pay.';
    end if;
  end if;

  if teste then
    return json_build_object('ok', true, 'teste', true, 'descricao', descricao, 'valor', quantia);
  end if;

  -- uma chamada por vez para o mesmo usuário, para a checagem de duplicata valer
  perform pg_advisory_xact_lock(hashtextextended('registrar_compra:' || k.user_id::text, 0));

  -- categoria da última despesa com a mesma descrição
  select t.category_id into categoria
  from public.transactions t
  where t.user_id = k.user_id
    and t.kind = 'expense'
    and t.category_id is not null
    and lower(t.description) = lower(descricao)
  order by t.date desc, t.created_at desc
  limit 1;

  -- mesma compra enviada duas vezes em poucos minutos: não duplica
  select t.id into novo
  from public.transactions t
  where t.user_id = k.user_id
    and t.kind = 'expense'
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

  return json_build_object('ok', true, 'id', novo, 'descricao', descricao, 'valor', quantia);
end;
$$;

revoke all on function public.registrar_compra(text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.valor_do_texto(text) from public, anon, authenticated;
grant execute on function public.registrar_compra(text, text, text, text, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Trocar a senha desliga o atalho
-- Quem perdeu o controle da conta e trocou a senha não deve continuar com uma
-- chave que outra pessoa possa ter gerado.
-- ---------------------------------------------------------------------------
create function public.desligar_atalho_na_troca_de_senha()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.shortcut_keys where user_id = new.id;
  return new;
end;
$$;

revoke all on function public.desligar_atalho_na_troca_de_senha() from public, anon, authenticated;

create trigger desligar_atalho_na_troca_de_senha
  after update of encrypted_password on auth.users
  for each row
  when (old.encrypted_password is distinct from new.encrypted_password)
  execute function public.desligar_atalho_na_troca_de_senha();

-- ---------------------------------------------------------------------------
-- 6. Reforços nas tabelas
-- ---------------------------------------------------------------------------

-- cores entram em estilos da tela; só #RRGGBB é aceito
update public.accounts set color = '#0E7A4F' where color !~ '^#[0-9A-Fa-f]{6}$';
update public.credit_cards set color = '#14201A' where color !~ '^#[0-9A-Fa-f]{6}$';
update public.categories set color = '#5B6B62' where color !~ '^#[0-9A-Fa-f]{6}$';
update public.goals set color = '#0E7A4F' where color !~ '^#[0-9A-Fa-f]{6}$';

alter table public.accounts add constraint accounts_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.credit_cards add constraint credit_cards_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.categories add constraint categories_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.goals add constraint goals_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$');

-- no perfil, o usuário só altera o próprio nome
revoke update on public.profiles from anon, authenticated;
grant update (full_name) on public.profiles to authenticated;

-- a categoria do lançamento precisa ser do mesmo dono (antes só o gatilho garantia)
alter table public.transactions drop constraint if exists transactions_category_id_fkey;
alter table public.transactions
  add constraint transactions_category_owner_fkey
  foreign key (category_id, user_id) references public.categories (id, user_id)
  on delete set null (category_id);
