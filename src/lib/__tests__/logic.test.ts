import { describe, expect, it } from "vitest";
import { addMonths, monthKey, weekLabel, weekStart } from "../dates";
import {
  accountBalance,
  cardUsedLimit,
  expensesByCategory,
  invoiceMonthFor,
  invoiceSummary,
  monthSummary,
  monthlyNeeded,
} from "../finance";
import { buildCategorizer, importKey, looksLikeCardPayment } from "../import/categorize";
import { decodeFile, parseDate, parseStatement } from "../import/parse";
import { parseMoney, splitInstallments } from "../money";
import type { Account, Category, CreditCard, Transaction } from "../types";

const tx = (p: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36).slice(2),
  kind: "expense",
  description: "x",
  amount: 10,
  date: "2026-11-10",
  category_id: null,
  account_id: null,
  card_id: null,
  to_account_id: null,
  invoice_month: null,
  installment_number: null,
  installment_total: null,
  installment_group: null,
  import_id: null,
  notes: null,
  created_at: "",
  ...p,
});

describe("parseMoney", () => {
  it.each([
    ["1.234,56", 1234.56],
    ["1234,56", 1234.56],
    ["-R$ 12,30", -12.3],
    ["R$ -12,30", -12.3],
    ["1,234.56", 1234.56],
    ["1234.56", 1234.56],
    ["-45.9", -45.9],
    ["1.234", 1234],
    ["(45,00)", -45],
    ["12,30-", -12.3],
    ["0,1", 0.1],
  ])("%s → %s", (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });
  it("rejeita texto", () => {
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("1.2.3")).toBeNull();
  });
});

describe("parcelas", () => {
  it("divide centavos sem perder valor", () => {
    const p = splitInstallments(100, 3);
    expect(p).toEqual([33.34, 33.33, 33.33]);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10);
  });
});

describe("datas", () => {
  it("soma meses respeitando o fim do mês", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonths("2026-03-15", -3)).toBe("2025-12-15");
    expect(monthKey("2026-11-20")).toBe("2026-11-01");
  });
  it("lê formatos de data de extratos", () => {
    expect(parseDate("05/11/2026")).toBe("2026-11-05");
    expect(parseDate("05/11/26")).toBe("2026-11-05");
    expect(parseDate("2026-11-05")).toBe("2026-11-05");
    expect(parseDate("20261105120000[-3:BRT]")).toBe("2026-11-05");
    expect(parseDate("31/02/2026")).toBeNull();
  });
});

describe("fatura do cartão", () => {
  // fecha dia 3, vence dia 10
  it("compra antes do fechamento entra na fatura do mês", () => {
    expect(invoiceMonthFor("2026-11-02", 3, 10)).toBe("2026-11-01");
  });
  it("compra no dia do fechamento vai para a próxima", () => {
    expect(invoiceMonthFor("2026-11-03", 3, 10)).toBe("2026-12-01");
  });
  it("vencimento antes do fechamento: vence no mês seguinte ao fechamento", () => {
    // fecha 25, vence 5
    expect(invoiceMonthFor("2026-11-20", 25, 5)).toBe("2026-12-01");
    expect(invoiceMonthFor("2026-11-26", 25, 5)).toBe("2027-01-01");
  });
  it("fechamento no dia 31 em fevereiro", () => {
    expect(invoiceMonthFor("2026-02-28", 31, 10)).toBe("2026-04-01");
    expect(invoiceMonthFor("2026-02-27", 31, 10)).toBe("2026-03-01");
  });

  const card: CreditCard = {
    id: "c1",
    name: "Nubank",
    limit_amount: 5000,
    closing_day: 3,
    due_day: 10,
    color: "#000",
    archived: false,
    created_at: "",
  };
  const items = [
    tx({ card_id: "c1", amount: 300, invoice_month: "2026-11-01" }),
    tx({ card_id: "c1", amount: 50, kind: "income", invoice_month: "2026-11-01" }),
    tx({ card_id: "c1", account_id: "a1", amount: 100, kind: "card_payment", invoice_month: "2026-11-01" }),
    tx({ card_id: "c1", amount: 200, invoice_month: "2026-12-01" }),
  ];
  it("resume a fatura com créditos e pagamentos", () => {
    const s = invoiceSummary(card, "2026-11-01", items, "2026-11-05");
    expect(s.total).toBe(250);
    expect(s.remaining).toBe(150);
    expect(s.status).toBe("fechada");
    expect(s.items).toHaveLength(2);
    expect(invoiceSummary(card, "2026-11-01", items, "2026-11-11").status).toBe("vencida");
    expect(invoiceSummary(card, "2026-12-01", items, "2026-11-05").status).toBe("aberta");
    expect(invoiceSummary(card, "2027-01-01", items, "2026-11-05").status).toBe("futura");
  });
  it("calcula limite usado", () => {
    expect(cardUsedLimit(card, items)).toBe(350);
  });
});

describe("saldos e resumo", () => {
  const account: Account = {
    id: "a1",
    name: "Conta",
    type: "corrente",
    initial_balance: 1000,
    color: "#000",
    archived: false,
    created_at: "",
  };
  const list = [
    tx({ account_id: "a1", kind: "income", amount: 500, category_id: "sal" }),
    tx({ account_id: "a1", kind: "expense", amount: 120, category_id: "mer" }),
    tx({ card_id: "c1", kind: "expense", amount: 80, category_id: "mer", invoice_month: "2026-12-01" }),
    tx({ card_id: "c1", account_id: "a1", kind: "card_payment", amount: 80, invoice_month: "2026-12-01" }),
    tx({ account_id: "a1", to_account_id: "a2", kind: "transfer", amount: 200 }),
    tx({ account_id: "a1", kind: "expense", amount: 999, date: "2099-01-01" }),
  ];
  it("saldo considera só lançamentos até hoje", () => {
    expect(accountBalance(account, list, "2026-11-20")).toBe(1000 + 500 - 120 - 80 - 200);
  });
  it("resumo do mês não conta pagamento de fatura nem transferência", () => {
    expect(monthSummary(list, "2026-11-01")).toEqual({ income: 500, expense: 200, balance: 300 });
  });
  it("gastos por categoria", () => {
    const cats: Category[] = [{ id: "mer", name: "Mercado", kind: "expense", color: "#f00" }];
    const rows = expensesByCategory(list, cats, "2026-11-01");
    expect(rows).toHaveLength(1);
    expect(rows[0].total).toBe(200);
    expect(rows[0].share).toBe(1);
  });
  it("quanto guardar por mês até o prazo", () => {
    expect(monthlyNeeded(1000, 4000, "2027-01-31", "2026-11-20")).toBe(1000);
    expect(monthlyNeeded(1000, 4000, null)).toBeNull();
  });
});

describe("importação", () => {
  it("lê OFX SGML em Windows-1252", () => {
    const ofx = `OFXHEADER:100
DATA:OFXSGML
CHARSET:1252

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261105000000[-3:BRT]
<TRNAMT>-52,90
<FITID>abc1
<MEMO>Farmácia São João
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261106
<TRNAMT>3500.00
<FITID>abc2
<NAME>SALARIO
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    const bytes = new Uint8Array([...ofx].map((c) => c.charCodeAt(0)));
    const text = decodeFile(bytes.buffer);
    const r = parseStatement(text);
    expect(r.format).toBe("ofx");
    expect(r.rows).toEqual([
      { date: "2026-11-05", amount: -52.9, description: "Farmácia São João", externalId: "abc1" },
      { date: "2026-11-06", amount: 3500, description: "SALARIO", externalId: "abc2" },
    ]);
  });

  it("lê CSV de conta com ponto e vírgula e linha de saldo", () => {
    const csv = `Extrato Conta Corrente
Data Lançamento;Descrição;Valor;Saldo
01/11/2026;Saldo Anterior;;1.000,00
03/11/2026;Pix enviado - Mercado Bom Preço;-150,25;849,75
04/11/2026;Pix recebido - João;1.200,00;2.049,75`;
    const r = parseStatement(csv);
    expect(r.format).toBe("csv");
    expect(r.rows).toEqual([
      { date: "2026-11-03", description: "Pix enviado - Mercado Bom Preço", amount: -150.25 },
      { date: "2026-11-04", description: "Pix recebido - João", amount: 1200 },
    ]);
  });

  it("lê CSV de cartão (valores positivos = gastos)", () => {
    const csv = `date,title,amount
2026-11-01,Uber *Trip,23.45
2026-11-02,Pagamento recebido,-500.00`;
    const r = parseStatement(csv);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toEqual({ date: "2026-11-01", description: "Uber *Trip", amount: 23.45 });
    expect(looksLikeCardPayment(r.rows[1].description)).toBe(true);
  });

  it("lê CSV com colunas de crédito e débito", () => {
    const csv = `Data,Histórico,Crédito,Débito
10/11/2026,"Compra, cartão",,"89,90"
11/11/2026,Depósito,"200,00",`;
    const r = parseStatement(csv);
    expect(r.rows.map((x) => x.amount)).toEqual([-89.9, 200]);
    expect(r.rows[0].description).toBe("Compra, cartão");
  });

  it("sugere categorias por histórico e palavra-chave", () => {
    const cats: Category[] = [
      { id: "t", name: "Transporte", kind: "expense", color: "" },
      { id: "s", name: "Saúde", kind: "expense", color: "" },
      { id: "l", name: "Lazer", kind: "expense", color: "" },
    ];
    const history = [tx({ description: "Padaria do Zé", category_id: "l" })];
    const cat = buildCategorizer(cats, history);
    expect(cat("UBER *TRIP 3/4", "expense")).toBe("t");
    expect(cat("Drogaria Araujo", "expense")).toBe("s");
    expect(cat("PADARIA DO ZÉ", "expense")).toBe("l");
    expect(cat("Loja qualquer", "expense")).toBeNull();
  });

  it("gera chave de deduplicação estável", () => {
    const row = { date: "2026-11-01", amount: -10, description: "Café" };
    expect(importKey("a1", row, 0)).toBe(importKey("a1", { ...row }, 0));
    expect(importKey("a1", row, 0)).not.toBe(importKey("a1", row, 1));
    expect(importKey("a1", { ...row, externalId: "X" }, 0)).toBe("a1:fit:X");
  });
});

describe("ajuste de saldo e datas", () => {
  it("soma dias atravessando mês e ano", async () => {
    const { addDays } = await import("../dates");
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });
});

describe("saldo conferido com o banco", () => {
  const conta = {
    id: "a1",
    name: "Conta",
    type: "corrente",
    initial_balance: 0, // o banco mostrava R$ 0,00 no acerto
    color: "",
    archived: false,
    created_at: "",
    balance_date: "2026-11-20",
    balance_checked_at: "2026-11-20T15:00:00+00:00",
  } as Account;

  it("lançamento retroativo, anterior ao acerto, não muda o saldo de hoje", () => {
    const list = [tx({ account_id: "a1", kind: "income", amount: 1000, date: "2026-11-13", created_at: "2026-11-25T12:00:00+00:00" })];
    expect(accountBalance(conta, list, "2026-11-25")).toBe(0);
  });

  it("lançamentos depois do acerto contam; no mesmo dia, só os registrados depois dele", () => {
    const list = [
      tx({ account_id: "a1", kind: "expense", amount: 50, date: "2026-11-20", created_at: "2026-11-20T10:00:00+00:00" }),
      tx({ account_id: "a1", kind: "expense", amount: 30, date: "2026-11-20", created_at: "2026-11-20T18:00:00+00:00" }),
      tx({ account_id: "a1", kind: "income", amount: 200, date: "2026-11-22", created_at: "2026-11-22T09:00:00+00:00" }),
      tx({ account_id: "a1", kind: "expense", amount: 99, date: "2099-01-01", created_at: "2026-11-22T09:00:00+00:00" }),
    ];
    expect(accountBalance(conta, list, "2026-11-25")).toBe(170);
  });

  it("sem acerto, o saldo continua sendo saldo inicial mais todos os lançamentos", () => {
    const list = [tx({ account_id: "a1", kind: "income", amount: 1000, date: "2026-11-13" })];
    expect(accountBalance({ ...conta, balance_date: null, balance_checked_at: null }, list, "2026-11-25")).toBe(1000);
  });
});

describe("regra de senha", () => {
  it("exige 8 caracteres com letras e números", async () => {
    const { passwordProblem } = await import("@/lib/password");
    expect(passwordProblem("curta1")).toMatch(/8 caracteres/);
    expect(passwordProblem("somenteletras")).toMatch(/letras e números/);
    expect(passwordProblem("12345678")).toMatch(/letras e números/);
    expect(passwordProblem("senhaboa1")).toBeNull();
  });
});

describe("semana", () => {
  it("começa na segunda e cobre até domingo", () => {
    expect(weekStart("2026-11-26")).toBe("2026-11-23"); // quinta
    expect(weekStart("2026-11-23")).toBe("2026-11-23"); // segunda
    expect(weekStart("2026-11-29")).toBe("2026-11-23"); // domingo
    expect(weekStart("2027-01-01")).toBe("2026-12-28");
  });
  it("descreve o intervalo", () => {
    expect(weekLabel("2026-11-23")).toBe("23 a 29 de novembro de 2026");
    expect(weekLabel("2026-11-30")).toBe("30 nov a 6 dez de 2026");
    expect(weekLabel("2026-12-28")).toBe("28/12/2026 a 03/01/2027");
  });
});
