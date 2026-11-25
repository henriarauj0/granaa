-- Ícone escolhido para categorias, contas, cartões e metas.
-- Guarda a chave do ícone na galeria do app (ex.: 'aviao', 'mercado').
-- Vazio quer dizer automático: o app sugere um ícone pelo nome.

alter table public.categories add column if not exists icon text check (char_length(icon) <= 40);
alter table public.accounts add column if not exists icon text check (char_length(icon) <= 40);
alter table public.credit_cards add column if not exists icon text check (char_length(icon) <= 40);
alter table public.goals add column if not exists icon text check (char_length(icon) <= 40);
