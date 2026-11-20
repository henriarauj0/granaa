import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bankCategoryToId, buildCategorizer, findReversalPairs, isSelfTransfer } from "../import/categorize";
import { composeDescription, parseDate, parseStatementFile } from "../import/parse";
import { isXls, readXlsRows } from "../import/xls";
import type { Category } from "../types";

// Planilha fictícia no mesmo leiaute do extrato do BTG Pactual (cabeçalho
// repetido por página, linhas de "Saldo Diário", colunas Transação e Categoria).
const file = readFileSync(join(__dirname, "fixtures", "extrato-ficticio.xls"));
const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);

describe("leitor .xls", () => {
  it("reconhece o formato", () => {
    expect(isXls(new Uint8Array(buffer))).toBe(true);
    expect(isXls(new TextEncoder().encode("Data;Valor\n"))).toBe(false);
  });

  it("lê células de texto (com acentos) e números", () => {
    const rows = readXlsRows(buffer);
    const header = rows.find((r) => r.includes("Data e hora"));
    expect(header?.filter(Boolean)).toEqual(["Data e hora", "Categoria", "Transação", "Descrição", "Valor"]);
    const first = rows.find((r) => r[6] === "Mercadinho São José");
    expect(first?.[10]).toBe("-45.9");
    // a tabela de strings passa de um registro: a última precisa vir inteira
    expect(rows.some((r) => r[6] === "Restaurante número 419 com nome bem comprido ção")).toBe(true);
  });

  it("converte o extrato em lançamentos", () => {
    const r = parseStatementFile(buffer);
    expect(r.format).toBe("xls");
    expect(r.warnings).toEqual([]);
    expect(r.rows).toHaveLength(11 + 420);
    expect(r.rows[0]).toEqual({
      date: "2026-03-02",
      description: "Pix recebido - Exemplo Sociedade Individual De Advocacia",
      amount: 1500,
      operation: "Pix recebido",
      counterparty: "Exemplo Sociedade Individual De Advocacia",
      bankCategory: "Outra Categoria",
    });
    expect(r.rows[1].description).toBe("Mercadinho São José");
    expect(r.rows.some((x) => /saldo/i.test(x.description))).toBe(false);
  });

  it("identifica transferências para a própria pessoa", () => {
    const rows = parseStatementFile(buffer).rows;
    const self = rows.filter((x) => isSelfTransfer(x, "Maria Exemplo Souza")).map((x) => x.amount);
    expect(self).toEqual([-300, -200]);
    // a sociedade com o nome da pessoa é receita, não transferência
    expect(isSelfTransfer(rows[0], "Maria Exemplo Souza")).toBe(false);
    expect(isSelfTransfer({ description: "Resgate CDB" }, null)).toBe(true);
  });

  it("pareia estornos com a compra original", () => {
    const rows = parseStatementFile(buffer).rows;
    const pairs = findReversalPairs(rows);
    const marked = [...pairs].sort((a, b) => a - b).map((i) => `${rows[i].description} ${rows[i].amount}`);
    expect(marked).toEqual([
      "Pix enviado - Cinema Central -56",
      "Devolução de Pix recebida - Cinema Central 56",
      "Loja Ficticia -399.9",
      "Cancelamento de compra - Loja Ficticia 399.9",
    ]);
  });

  it("usa a categoria do banco quando não há regra melhor", () => {
    const cats: Category[] = [
      { id: "m", name: "Mercado", kind: "expense", color: "" },
      { id: "l", name: "Lazer", kind: "expense", color: "" },
      { id: "x", name: "Cuidados Pessoais", kind: "expense", color: "" },
    ];
    expect(bankCategoryToId("Supermercado", "expense", cats)).toBe("m");
    expect(bankCategoryToId("Lazer e Entretenimento", "expense", cats)).toBe("l");
    expect(bankCategoryToId("Cuidados Pessoais", "expense", cats)).toBe("x");
    expect(bankCategoryToId("Outra Categoria", "expense", cats)).toBeNull();
    const categorize = buildCategorizer(cats, []);
    expect(categorize("Mercadinho São José", "expense")).toBeNull();
  });

  it("monta descrições legíveis", () => {
    expect(composeDescription("Compra no débito autorizada", "Mercado Bom Preço")).toBe("Mercado Bom Preço");
    expect(composeDescription("Pix enviado", "Fulano")).toBe("Pix enviado - Fulano");
    expect(composeDescription("Saque Banco24Horas QR Code", "Saque Banco24horas")).toBe("Saque Banco24Horas QR Code");
  });

  it("aceita data em número de série do Excel", () => {
    expect(parseDate("46083")).toBe("2026-03-02");
  });
});
