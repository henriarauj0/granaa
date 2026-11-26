-- Reforços da segunda auditoria (novembro de 2026).
--
-- 1. O papel anon (quem não fez login) perde todo acesso direto às tabelas.
--    A RLS já bloqueava; agora há uma segunda barreira, caso uma política seja
--    afrouxada por engano no futuro. anon continua podendo chamar só a função
--    registrar_compra, usada pelo atalho do Apple Pay.
-- 2. Cada chave do atalho aceita no máximo 30 chamadas por hora. Quem tiver uma
--    chave vazada não consegue encher a conta do dono de despesas falsas.

-- ---------------------------------------------------------------------------
-- 1. anon sem acesso às tabelas
-- ---------------------------------------------------------------------------
revoke all on
  public.profiles, public.accounts, public.credit_cards, public.categories,
  public.transactions, public.goals, public.investments, public.investment_movements,
  public.shortcut_keys
  from anon;

-- tabelas criadas daqui em diante também nascem fechadas para anon
alter default privileges in schema public revoke all on tables from anon;

-- ---------------------------------------------------------------------------
-- 2. Limite de chamadas por chave
-- ---------------------------------------------------------------------------
alter table public.shortcut_keys
  add column if not exists janela_inicio timestamptz,
  add column if not exists janela_chamadas int not null default 0;

-- Gerar (ou trocar) a chave zera a contagem.
create or replace function public.gerar_chave_atalho(conta_padrao uuid)
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
        last_used_at = null,
        janela_inicio = null,
        janela_chamadas = 0;

  return chave;
end;
$$;

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
  chamadas int;
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

  -- até 30 chamadas por hora para cada chave, contando os testes. Uma chamada que termina
  -- em erro desfaz a própria contagem, mas também não grava nada.
  -- O update trava a linha, então chamadas simultâneas contam uma de cada vez.
  update public.shortcut_keys
  set janela_inicio = case when janela_inicio is null or janela_inicio <= now() - interval '1 hour' then now() else janela_inicio end,
      janela_chamadas = case when janela_inicio is null or janela_inicio <= now() - interval '1 hour' then 1 else janela_chamadas + 1 end
  where user_id = k.user_id
  returning janela_chamadas into chamadas;
  if chamadas > 30 then
    raise exception 'Limite de 30 compras por hora atingido neste atalho. Tente de novo mais tarde.';
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

revoke all on function public.gerar_chave_atalho(uuid) from public, anon, authenticated;
revoke all on function public.registrar_compra(text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.gerar_chave_atalho(uuid) to authenticated;
grant execute on function public.registrar_compra(text, text, text, text, boolean) to anon, authenticated;
