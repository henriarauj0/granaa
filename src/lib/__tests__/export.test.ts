import { describe, expect, it } from "vitest";
import { exportTransactions, kindLabel, signedAmount, transactionsSheets } from "../export/transactions";
import { buildXlsx, columnName, excelDate } from "../export/xlsx";
import { crc32 } from "../export/zip";
import { categoryItems, expensesByCategory } from "../finance";
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

/** Lê os arquivos de um ZIP sem compressão, conferindo o CRC de cada um. */
function unzip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = bytes.length - 22;
  expect(view.getUint32(eocd, true)).toBe(0x06054b50);
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  // o diretório central termina exatamente onde começa o registro final
  expect(p + view.getUint32(eocd + 12, true)).toBe(eocd);
  const files = new Map<string, string>();
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(p, true)).toBe(0x02014b50);
    const crc = view.getUint32(p + 16, true);
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const offset = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    expect(view.getUint32(offset, true)).toBe(0x04034b50);
    const start = offset + 30 + view.getUint16(offset + 26, true);
    const data = bytes.subarray(start, start + size);
    expect(crc32(data)).toBe(crc);
    files.set(name, decoder.decode(data));
    p += 46 + nameLen;
  }
  return files;
}

describe("planilha .xlsx", () => {
  it("crc32 confere com o valor de referência", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("nomes de coluna e datas no formato do Excel", () => {
    expect([0, 25, 26, 27, 701, 702].map(columnName)).toEqual(["A", "Z", "AA", "AB", "ZZ", "AAA"]);
    expect(excelDate("1900-03-01")).toBe(61);
    expect(excelDate("2026-11-22")).toBe(46348);
  });

  it("monta um pacote com todas as partes e escapa o texto", () => {
    const files = unzip(
      buildXlsx([{ name: "Aba: teste?", widths: [10, 10], header: true, rows: [["A", "B"], ['<café & "pão">', 12.5]] }]),
    );
    expect([...files.keys()]).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
    ]);
    const sheet = files.get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain("&lt;café &amp; &quot;pão&quot;&gt;");
    expect(sheet).toContain('<c r="B2"><v>12.5</v></c>');
    expect(sheet).toContain('<autoFilter ref="A1:B2"/>');
    expect(files.get("xl/workbook.xml")).toContain('name="Aba  teste "');
  });

  it("texto que começa com = fica como texto, não como fórmula", () => {
    const sheet = unzip(buildXlsx([{ name: "x", widths: [10], rows: [["=1+1"]] }])).get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain('t="inlineStr"><is><t>=1+1</t>');
    expect(sheet).not.toContain("<f>");
  });
});

describe("exportação de lançamentos", () => {
  const accounts = [{ id: "a1", name: "Nubank" }, { id: "a2", name: "Poupança" }] as Account[];
  const cards = [{ id: "c1", name: "Visa" }] as CreditCard[];
  const categories: Category[] = [
    { id: "sau", name: "Saúde", kind: "expense", color: "#f00" },
    { id: "mer", name: "Mercado", kind: "expense", color: "#0f0" },
  ];
  const list = [
    tx({ id: "1", date: "2026-11-05", description: "Farmácia", amount: 80, category_id: "sau", card_id: "c1", installment_number: 1, installment_total: 2 }),
    tx({ id: "2", date: "2026-11-02", description: "Consulta", amount: 300, category_id: "sau", account_id: "a1" }),
    tx({ id: "3", date: "2026-11-08", description: "Estorno farmácia", kind: "income", amount: 30, category_id: "sau", card_id: "c1" }),
    tx({ id: "4", date: "2026-11-09", description: "Feira", amount: 50, category_id: "mer", account_id: "a1" }),
    tx({ id: "5", date: "2026-11-01", description: "Salário", kind: "income", amount: 5000, account_id: "a1" }),
    tx({ id: "6", date: "2026-11-10", description: "Guardar", kind: "transfer", amount: 1000, account_id: "a1", to_account_id: "a2" }),
    tx({ id: "7", date: "2026-10-30", description: "Dentista", amount: 200, category_id: "sau", account_id: "a1" }),
  ];

  it("tipo e sinal de cada lançamento", () => {
    expect(list.map(kindLabel).slice(0, 6)).toEqual(["Despesa", "Despesa", "Estorno no cartão", "Despesa", "Receita", "Transferência"]);
    expect(list.map(signedAmount).slice(0, 6)).toEqual([-80, -300, 30, -50, 5000, 1000]);
  });

  it("lista em ordem de data e resumo com os mesmos totais do app", () => {
    const novembro = list.filter((t) => t.date.startsWith("2026-11"));
    const [lancamentos, resumo] = transactionsSheets(novembro, { accounts, cards, categories }, { period: "Novembro de 2026" });
    expect(lancamentos.rows[0][0]).toBe("Data");
    expect(lancamentos.rows.slice(1).map((r) => r[1])).toEqual(["Salário", "Consulta", "Farmácia", "Estorno farmácia", "Feira", "Guardar"]);
    expect(lancamentos.rows[3][4]).toBe("Visa");
    expect(lancamentos.rows[3][5]).toBe("1/2");
    expect(lancamentos.rows[6][4]).toBe("Nubank → Poupança");

    const value = (label: string) =>
      resumo.rows.find((r) => typeof r[0] === "object" && r[0]?.value === label)?.[1];
    expect(value("Receitas")).toEqual({ style: "money", value: 5000 });
    expect(value("Despesas")).toEqual({ style: "money", value: 400 });
    expect(value("Saúde")).toBeUndefined(); // linhas de categoria não são negrito
    const saude = resumo.rows.find((r) => r[0] === "Saúde")!;
    expect(saude[1]).toEqual({ style: "money", value: 350 });
    expect(saude[3]).toBe(3);
  });

  it("gera um arquivo .xlsx válido", () => {
    const bytes = exportTransactions(list, { accounts, cards, categories }, { period: "Tudo" });
    const files = unzip(bytes);
    expect(files.get("xl/workbook.xml")).toContain('<sheet name="Lançamentos"');
    expect(files.get("xl/worksheets/sheet1.xml")).toContain("Estorno no cartão");
  });
});

describe("detalhe dos gastos por categoria", () => {
  const list = [
    tx({ date: "2026-11-05", amount: 80, category_id: "sau", card_id: "c1" }),
    tx({ date: "2026-11-02", amount: 300, category_id: "sau" }),
    tx({ date: "2026-11-08", kind: "income", amount: 30, category_id: "sau", card_id: "c1" }),
    tx({ date: "2026-11-09", kind: "income", amount: 1000, category_id: "sau" }),
    tx({ date: "2026-10-30", amount: 200, category_id: "sau" }),
    tx({ date: "2026-11-03", amount: 15 }),
  ];

  it("lista os lançamentos que formam o total, do maior para o menor", () => {
    const items = categoryItems(list, "2026-11-01", "sau");
    expect(items.map((t) => t.amount)).toEqual([300, 80, 30]);
    const total = expensesByCategory(list, [], "2026-11-01").find((r) => r.key === "sau")!;
    expect(total.total).toBe(350);
    expect(total.count).toBe(items.length);
  });

  it("agrupa os lançamentos sem categoria", () => {
    expect(categoryItems(list, "2026-11-01", "none").map((t) => t.amount)).toEqual([15]);
  });
});

describe("ícones sugeridos pelo nome", () => {
  it("acha um ícone para as categorias padrão e para nomes comuns", async () => {
    const { suggestIcon, iconFor } = await import("../../components/icons");
    const padrao = [
      "Alimentação", "Mercado", "Transporte", "Moradia", "Contas da casa", "Saúde", "Cuidados pessoais", "Educação",
      "Lazer", "Compras", "Assinaturas", "Viagem", "Pets", "Presentes", "Doações", "Impostos e taxas",
      "Empréstimos e financiamentos", "Saques", "Salário", "Investimentos", "Reembolsos", "Renda extra",
    ];
    for (const nome of padrao) expect(iconFor(suggestIcon(nome)), nome).not.toBeNull();
    expect(suggestIcon("Viagem a Lisboa")).toBe("aviao");
    expect(suggestIcon("Reserva de emergência")).toBe("cofrinho");
    expect(suggestIcon("Padaria do bairro")).toBeNull();
  });
});
