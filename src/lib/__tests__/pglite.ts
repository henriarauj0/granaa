// Banco Postgres em memória (PGlite) com as migrações do projeto e uma simulação
// mínima do que o Supabase já traz: schema auth, auth.uid() e os papéis anon e
// authenticated, com os mesmos privilégios padrão do Supabase.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Linha devolvida pelo banco; o teste confere os campos que usa. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

const MIG = fileURLToPath(new URL("../../../supabase/migrations", import.meta.url));

export const U1 = "11111111-1111-1111-1111-111111111111";
export const U2 = "22222222-2222-2222-2222-222222222222";

export async function createDb() {
  const db = new PGlite();

  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text, encrypted_password text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    -- default privileges como no Supabase: tabelas e funções novas liberadas para anon/authenticated
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on functions to anon, authenticated;
  `);

  for (const f of readdirSync(MIG).sort()) {
    try {
      await db.exec(readFileSync(`${MIG}/${f}`, "utf8").replace(/create extension if not exists pgcrypto;/i, "-- pgcrypto: já vem no Supabase"));
    } catch (e) {
      console.error("falha na migração", f, e instanceof Error ? e.message : e);
      throw e;
    }
  }

  await db.exec(`insert into auth.users (id, email) values ('${U1}', 'maria@exemplo.com'), ('${U2}', 'joao@exemplo.com');`);

  /** Roda a consulta como o usuário informado (papel authenticated) ou como anon (null). */
  const as = async (user: string | null, sql: string, params?: unknown[]) => {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ""}', false);`);
    await db.exec(user ? "set role authenticated" : "set role anon");
    try {
      return await db.query<Row>(sql, params);
    } finally {
      await db.exec("reset role");
    }
  };

  /** Consulta como dono do banco (sem RLS), para preparar e conferir dados. */
  const one = async (sql: string, params?: unknown[]) => (await db.query<Row>(sql, params)).rows[0];

  return { db, as, one };
}
