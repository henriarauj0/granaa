-- Categorias extras vistas em extratos reais (cuidados pessoais, financiamentos,
-- saques e doações). Valem para novos cadastros e são adicionadas a quem já tem conta.

create or replace function public.handle_new_user()
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
    ('Alimentação',                  'expense', '#E07A2E'),
    ('Mercado',                      'expense', '#C2412D'),
    ('Transporte',                   'expense', '#2F6FB0'),
    ('Moradia',                      'expense', '#7A4FB0'),
    ('Contas da casa',               'expense', '#3A8F8F'),
    ('Saúde',                        'expense', '#D2486B'),
    ('Cuidados pessoais',            'expense', '#B05A8A'),
    ('Educação',                     'expense', '#4B5BC8'),
    ('Lazer',                        'expense', '#D9A21B'),
    ('Compras',                      'expense', '#B0507A'),
    ('Assinaturas',                  'expense', '#6B7D2A'),
    ('Viagem',                       'expense', '#1F8A70'),
    ('Pets',                         'expense', '#8A5A2B'),
    ('Presentes',                    'expense', '#C45AB3'),
    ('Doações',                      'expense', '#5A8AB0'),
    ('Empréstimos e financiamentos', 'expense', '#9A4A3A'),
    ('Impostos e taxas',             'expense', '#6B6B6B'),
    ('Saques',                       'expense', '#7A7A5A'),
    ('Outros gastos',                'expense', '#8C9690'),
    ('Salário',                      'income',  '#0E7A4F'),
    ('Renda extra',                  'income',  '#3E9B5F'),
    ('Investimentos',                'income',  '#2F6FB0'),
    ('Reembolsos',                   'income',  '#7A9A3A'),
    ('Outras receitas',              'income',  '#8C9690')
  ) as c (name, kind, color);

  return new;
end;
$$;

insert into public.categories (user_id, name, kind, color)
select u.id, c.name, 'expense', c.color
from auth.users u
cross join (values
  ('Cuidados pessoais',            '#B05A8A'),
  ('Doações',                      '#5A8AB0'),
  ('Empréstimos e financiamentos', '#9A4A3A'),
  ('Saques',                       '#7A7A5A')
) as c (name, color)
on conflict (user_id, kind, name) do nothing;
