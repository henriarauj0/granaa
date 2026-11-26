// Isolamento entre usuários no banco: a Maria não lê, não altera e não apaga nada
// do João, nem pelo ID, e quem não fez login (anon) não acessa tabela nenhuma.
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { U1, U2, createDb } from "./pglite";

const TABELAS = [
  "profiles",
  "accounts",
  "credit_cards",
  "categories",
  "transactions",
  "goals",
  "investments",
  "investment_movements",
  "shortcut_keys",
] as const;

describe("banco: isolamento entre usuários (RLS)", () => {
  it("cada usuário só enxerga e altera o que é seu", async () => {
    const { as, one } = await createDb();

    // dados do João (U2), criados como dono do banco
    const conta = await one(`select id from public.accounts where user_id = $1 limit 1`, [U2]);
    const categoria = await one(`select id from public.categories where user_id = $1 limit 1`, [U2]);
    const cartao = await one(
      `insert into public.credit_cards (user_id, name, closing_day, due_day) values ($1, 'Cartão do João', 5, 12) returning id`,
      [U2],
    );
    const lanc = await one(
      `insert into public.transactions (user_id, kind, description, amount, date, category_id, account_id) values ($1, 'expense', 'Mercado do João', 50, '2026-11-20', $2, $3) returning id`,
      [U2, categoria.id, conta.id],
    );
    const meta = await one(`insert into public.goals (user_id, name, target_amount) values ($1, 'Viagem', 1000) returning id`, [U2]);
    const inv = await one(
      `insert into public.investments (user_id, name, asset_class) values ($1, 'CDB', 'renda_fixa') returning id`,
      [U2],
    );
    const mov = await one(
      `insert into public.investment_movements (user_id, investment_id, kind, amount, date) values ($1, $2, 'aporte', 100, '2026-11-20') returning id`,
      [U2, inv.id],
    );
    await as(U2, `select public.gerar_chave_atalho($1)`, [conta.id]);

    const ids: Record<string, { col: string; id: string }> = {
      profiles: { col: "id", id: U2 },
      accounts: { col: "id", id: conta.id },
      credit_cards: { col: "id", id: cartao.id },
      categories: { col: "id", id: categoria.id },
      transactions: { col: "id", id: lanc.id },
      goals: { col: "id", id: meta.id },
      investments: { col: "id", id: inv.id },
      investment_movements: { col: "id", id: mov.id },
      shortcut_keys: { col: "user_id", id: U2 },
    };

    for (const t of TABELAS) {
      const { col, id } = ids[t];

      // a Maria (U1) não vê a linha do João nem pedindo pelo ID
      const lidas = await as(U1, `select * from public.${t} where ${col} = $1`, [id]);
      assert.equal(lidas.rows.length, 0, `${t}: leitura pelo ID de outro usuário`);

      // nem apaga
      if (t !== "profiles") {
        await as(U1, `delete from public.${t} where ${col} = $1`, [id]).catch(() => undefined);
      }

      // quem não fez login não acessa a tabela
      await assert.rejects(as(null, `select * from public.${t} limit 1`), /permission denied/, `${t}: anon não lê`);
    }

    // alterações pelo ID não pegam nada do João
    const alteracoes = [
      `update public.accounts set name = 'invadida' where id = $1`,
      `update public.credit_cards set name = 'invadido' where id = $1`,
      `update public.categories set name = 'invadida' where id = $1`,
      `update public.transactions set amount = 1 where id = $1`,
      `update public.goals set saved_amount = 999 where id = $1`,
      `update public.investments set name = 'invadido' where id = $1`,
      `update public.investment_movements set amount = 1 where id = $1`,
    ];
    const alvos = [conta.id, cartao.id, categoria.id, lanc.id, meta.id, inv.id, mov.id];
    for (let i = 0; i < alteracoes.length; i++) {
      const r = await as(U1, alteracoes[i], [alvos[i]]);
      assert.equal(r.affectedRows ?? 0, 0, `alteração de outro usuário: ${alteracoes[i]}`);
    }
    await as(U1, `update public.profiles set full_name = 'invadido' where id = $1`, [U2]);

    // tudo do João continua igual e no lugar
    assert.equal((await one(`select name from public.accounts where id = $1`, [conta.id])).name !== "invadida", true);
    assert.equal(Number((await one(`select amount from public.transactions where id = $1`, [lanc.id])).amount), 50);
    assert.notEqual((await one(`select full_name from public.profiles where id = $1`, [U2])).full_name, "invadido");
    for (const t of TABELAS) {
      const { col, id } = ids[t];
      assert.ok(await one(`select 1 as ok from public.${t} where ${col} = $1`, [id]), `${t}: a linha do João continua lá`);
    }

    // a Maria não cria nada em nome do João
    await assert.rejects(
      as(U1, `insert into public.accounts (user_id, name) values ($1, 'conta falsa')`, [U2]),
      /row-level security/,
      "inserir com o user_id de outro usuário",
    );

    // nem aponta um lançamento seu para a conta, o cartão ou a categoria do João
    const minhaConta = await one(`select id from public.accounts where user_id = $1 limit 1`, [U1]);
    await assert.rejects(
      as(U1, `insert into public.transactions (kind, description, amount, date, account_id) values ('expense', 'x', 1, '2026-11-20', $1)`, [conta.id]),
      /foreign key|violates/,
      "lançamento na conta de outro usuário",
    );
    await assert.rejects(
      as(
        U1,
        `insert into public.transactions (kind, description, amount, date, card_id, invoice_month) values ('expense', 'x', 1, '2026-11-20', $1, '2026-12-01')`,
        [cartao.id],
      ),
      /foreign key|violates/,
      "lançamento no cartão de outro usuário",
    );
    await assert.rejects(
      as(
        U1,
        `insert into public.transactions (kind, description, amount, date, account_id, category_id) values ('expense', 'x', 1, '2026-11-20', $1, $2)`,
        [minhaConta.id, categoria.id],
      ),
      /categoria inválida|foreign key|violates/i,
      "lançamento com a categoria de outro usuário",
    );

    // anon continua podendo usar só o atalho
    await assert.rejects(as(null, `select public.registrar_compra('chave-errada', '1')`), /Chave do atalho inválida/);
    await assert.rejects(as(null, `select public.gerar_chave_atalho($1)`, [conta.id]), /permission denied/);
  }, 60_000);
});
