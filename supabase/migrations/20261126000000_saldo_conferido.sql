-- Saldo conferido com o banco.
-- Quando o usuário informa o "saldo de hoje", a conta guarda a data e o
-- momento do acerto, e initial_balance passa a ser o saldo naquele momento.
-- Lançamentos com data anterior ao acerto já estavam no saldo do banco e
-- não mudam o saldo atual; só os posteriores somam ou subtraem.
-- Sem acerto (colunas vazias), vale a regra antiga: saldo inicial mais
-- todos os lançamentos.

alter table public.accounts add column if not exists balance_date date;
alter table public.accounts add column if not exists balance_checked_at timestamptz;
