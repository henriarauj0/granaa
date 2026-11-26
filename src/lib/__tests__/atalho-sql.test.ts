// Testa as migrações do banco num Postgres em memória (PGlite), com uma
// simulação mínima do que o Supabase já traz (schema auth, papéis anon e
// authenticated). Foco no atalho do Apple Pay, que aceita chamadas sem login.
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { U1, U2, createDb } from "./pglite";

describe("banco: atalho do Apple Pay", () => {
  it("gera a chave, registra compras e respeita as permissões", async () => {
    const { db, as, one } = await createDb();

    // dados da Maria: cartão "Nubank Ultravioleta" (fecha 3, vence 10) e conta "Inter"
    const carteira = await one(`select id from public.accounts where user_id = $1 and name = 'Carteira'`, [U1]);
    assert.ok(carteira, "cadastro cria a Carteira");
    const inter = await one(`insert into public.accounts (user_id, name) values ($1, 'Inter') returning id`, [U1]);
    const nubank = await one(
      `insert into public.credit_cards (user_id, name, closing_day, due_day) values ($1, 'Nubank', 3, 10) returning id`,
      [U1],
    );
    const farmacia = await one(`select id from public.categories where user_id = $1 and name = 'Saúde'`, [U1]);
    await db.query(
      `insert into public.transactions (user_id, kind, description, amount, date, category_id, account_id) values ($1, 'expense', 'Drogasil', 10, '2026-10-01', $2, $3)`,
      [U1, farmacia.id, inter.id],
    );
    const contaJoao = await one(`select id from public.accounts where user_id = $1`, [U2]);

    // --- gerar chave -------------------------------------------------------------
    await assert.rejects(as(null, `select public.gerar_chave_atalho($1)`, [carteira.id]), /permission denied/, "anon não gera chave");
    await assert.rejects(as(U1, `select public.gerar_chave_atalho($1)`, [contaJoao.id]), /Conta padrão inválida/, "conta de outro usuário");
    const chave = (await as(U1, `select public.gerar_chave_atalho($1) as k`, [carteira.id])).rows[0].k;
    assert.match(chave, /^[0-9a-f]{64}$/);
    const guardado = await one(`select key_hash from public.shortcut_keys where user_id = $1`, [U1]);
    assert.notEqual(guardado.key_hash, chave, "o banco guarda só o hash");

    // --- permissões da tabela ----------------------------------------------------
    await assert.rejects(as(null, `select * from public.shortcut_keys`), /permission denied/, "anon não lê chaves");
    assert.equal((await as(U2, `select * from public.shortcut_keys`)).rows.length, 0, "outro usuário não vê a chave");
    await assert.rejects(
      as(U2, `insert into public.shortcut_keys (user_id, key_hash) values ($1, 'x')`, [U2]),
      /permission denied/,
      "ninguém insere direto na tabela",
    );
    await assert.rejects(
      as(U1, `update public.shortcut_keys set default_account_id = $1`, [contaJoao.id]),
      /permission denied/,
      "nem altera direto",
    );

    // --- registrar compras (como o app Atalhos, papel anon) ----------------------
    const compra = (args: { chave?: string; valor: string; estab?: string; cartao?: string; teste?: boolean }) =>
      as(null, `select public.registrar_compra($1, $2, $3, $4, $5) as r`, [args.chave ?? chave, args.valor, args.estab ?? null, args.cartao ?? null, args.teste ?? false]).then(
        (r) => r.rows[0].r,
      );

    await assert.rejects(compra({ chave: "errada", valor: "10" }), /Chave do atalho inválida/);
    await assert.rejects(compra({ valor: "abc" }), /Valor da compra inválido/);

    const t0 = await compra({ valor: "R$ 42,90", estab: "Padaria Pão Quente", cartao: "Carteira digital", teste: true });
    assert.equal(t0.teste, true);
    assert.equal(Number(t0.valor), 42.9);
    // a resposta não revela nomes de cartões nem de contas, em nenhum modo
    for (const cartao of ["", "a", "n", "nubank", "inter"]) {
      const r = JSON.stringify(await compra({ valor: "1", cartao, teste: true }));
      assert.doesNotMatch(r, /Nubank|Inter|Carteira/, `teste com cartão "${cartao}" não mostra nomes`);
      assert.deepEqual(Object.keys(JSON.parse(r)).sort(), ["descricao", "ok", "teste", "valor"]);
    }
    assert.equal((await one(`select count(*)::int n from public.transactions where description = 'Padaria Pão Quente'`)).n, 0, "teste não grava");

    const r1 = await compra({ valor: "R$ 1.234,56", estab: "Magazine", cartao: "Nubank Ultravioleta" });
    assert.deepEqual(Object.keys(r1).sort(), ["descricao", "id", "ok", "valor"], "registro também não mostra o destino");
    const t1 = await one(`select * from public.transactions where id = $1`, [r1.id]);
    assert.equal(Number(t1.amount), 1234.56);
    assert.equal(t1.card_id, nubank.id, "cartão da Carteira casa com o cartão do Granaa");
    assert.equal(t1.account_id, null);
    assert.ok(t1.invoice_month, "compra no cartão tem fatura");
    assert.equal(t1.user_id, U1);

    const r2 = await compra({ valor: "42.9", estab: "Drogasil", cartao: "Inter Gold" });
    const t2 = await one(`select * from public.transactions where id = $1`, [r2.id]);
    assert.equal(t2.account_id, inter.id, "nome da conta casa");
    assert.equal(t2.category_id, farmacia.id, "categoria da última compra no mesmo lugar");
    assert.equal(Number(t2.amount), 42.9);

    const r3 = await compra({ valor: "15", estab: "Uber", cartao: "Visa do Banco X" });
    const t3 = await one(`select * from public.transactions where id = $1`, [r3.id]);
    assert.equal(t3.account_id, carteira.id, "cartão desconhecido vai para a conta padrão");
    assert.equal(t3.category_id, null);

    const r4 = await compra({ valor: "15", estab: "Uber", cartao: "Visa do Banco X" });
    assert.equal(r4.id, r3.id, "mesma compra repetida em seguida não duplica");

    const r5 = await compra({ valor: "8,5" });
    const t5 = await one(`select * from public.transactions where id = $1`, [r5.id]);
    assert.equal(t5.description, "Compra com Apple Pay");
    assert.equal(t5.account_id, carteira.id);

    // valores em formatos diversos
    for (const [txt, esperado] of [
      ["R$ 42,90", 42.9],
      ["R$\u00a042,90", 42.9],
      ["1.234", 1234],
      ["1234.5", 1234.5],
      ["1.234,56", 1234.56],
      ["1,234.56", 1234.56],
      ["US$ 1,234,567.89", 1234567.89],
      ["1,234,567", 1234567],
      ["10,00 BRL", 10],
      ["-R$ 10,00", null],
      ["1e9", null],
      ["", null],
      ["R$", null],
    ] as const) {
      const v = (await one(`select public.valor_do_texto($1) v`, [txt])).v;
      assert.equal(v === null ? null : Number(v), esperado, `valor ${txt}`);
    }

    // a chave da Maria nunca grava para o João
    assert.equal((await one(`select count(*)::int n from public.transactions where user_id = $1`, [U2])).n, 0);
    // conta padrão arquivada não recebe compras
    await db.query(`update public.accounts set archived = true where id = $1`, [carteira.id]);
    await assert.rejects(compra({ valor: "5", cartao: "Desconhecido" }), /Escolha a conta padrão/);
    await db.query(`update public.accounts set archived = false where id = $1`, [carteira.id]);
    // conta padrão apagada: o atalho avisa
    await db.query(`delete from public.transactions where account_id = $1`, [carteira.id]);
    await db.query(`delete from public.accounts where id = $1`, [carteira.id]);
    await assert.rejects(compra({ valor: "5", cartao: "Desconhecido" }), /Escolha a conta padrão/);

    // trocar a chave invalida a antiga
    const nova = (await as(U1, `select public.gerar_chave_atalho($1) as k`, [inter.id])).rows[0].k;
    await assert.rejects(compra({ chave, valor: "5" }), /Chave do atalho inválida/);
    assert.ok((await compra({ chave: nova, valor: "5", estab: "Café" })).ok);
    const uso = await one(`select last_used_at from public.shortcut_keys where user_id = $1`, [U1]);
    assert.ok(uso.last_used_at, "registra o último uso");

    // trocar a senha desliga o atalho
    await db.query(`update auth.users set email = 'maria@novo.com' where id = $1`, [U1]);
    assert.ok((await compra({ chave: nova, valor: "6", estab: "Livraria" })).ok, "mudar outro dado não desliga");
    await db.query(`update auth.users set encrypted_password = 'hash-novo' where id = $1`, [U1]);
    await assert.rejects(compra({ chave: nova, valor: "5" }), /Chave do atalho inválida/);

    // apagar a chave desliga o atalho
    const outra = (await as(U1, `select public.gerar_chave_atalho($1) as k`, [inter.id])).rows[0].k;
    assert.ok((await compra({ chave: outra, valor: "5", estab: "Banca" })).ok);
    await as(U1, `delete from public.shortcut_keys`);
    await assert.rejects(compra({ chave: outra, valor: "5" }), /Chave do atalho inválida/);

    // limite de 30 chamadas por hora por chave (testes contam)
    const limitada = (await as(U1, `select public.gerar_chave_atalho($1) as k`, [inter.id])).rows[0].k;
    for (let i = 0; i < 30; i++) await compra({ chave: limitada, valor: "1", teste: true });
    await assert.rejects(compra({ chave: limitada, valor: "1", teste: true }), /Limite de 30 compras por hora/);
    await assert.rejects(compra({ chave: limitada, valor: "2", estab: "Excesso" }), /Limite de 30 compras por hora/);
    assert.equal((await one(`select count(*)::int n from public.transactions where description = 'Excesso'`)).n, 0, "acima do limite não grava");
    await db.query(`update public.shortcut_keys set janela_inicio = now() - interval '61 minutes' where user_id = $1`, [U1]);
    assert.ok((await compra({ chave: limitada, valor: "1", teste: true })).ok, "passada uma hora, libera de novo");
    const nova2 = (await as(U1, `select public.gerar_chave_atalho($1) as k`, [inter.id])).rows[0].k;
    assert.equal((await one(`select janela_chamadas n from public.shortcut_keys where user_id = $1`, [U1])).n, 0, "chave nova zera a contagem");
    assert.ok((await compra({ chave: nova2, valor: "1", teste: true })).ok);

    // reforços das tabelas
    await assert.rejects(
      as(U1, `update public.accounts set color = 'red;background:url(x)' where id = $1`, [inter.id]),
      /accounts_color_hex/,
      "cor fora do formato #RRGGBB",
    );
    await as(U1, `update public.accounts set color = '#123ABC' where id = $1`, [inter.id]);
    await as(U1, `update public.profiles set full_name = 'Maria S.' where id = $1`, [U1]);
    await assert.rejects(
      as(U1, `update public.profiles set created_at = now() where id = $1`, [U1]),
      /permission denied/,
      "perfil: só o nome é editável",
    );
    const catJoao = await one(`select id from public.categories where user_id = $1 limit 1`, [U2]);
    await db.exec(`alter table public.transactions disable trigger user`);
    await assert.rejects(
      db.query(`insert into public.transactions (user_id, kind, description, amount, date, category_id, account_id) values ($1, 'expense', 'x', 1, '2026-10-01', $2, $3)`, [
        U1,
        catJoao.id,
        inter.id,
      ]),
      /transactions_category_owner_fkey/,
      "categoria de outro usuário barrada mesmo sem o gatilho",
    );
    await db.exec(`alter table public.transactions enable trigger user`);
  }, 60_000);
});
