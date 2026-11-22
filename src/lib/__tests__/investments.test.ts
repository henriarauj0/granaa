import { describe, expect, it } from "vitest";
import { centerMoney } from "../money";
import { assetStats, averageMonthlyContribution, byClass, monthlyFlows, niceMax, positions } from "../investments";
import type { Investment, InvestmentMovement } from "../types";

let n = 0;
const mv = (p: Partial<InvestmentMovement>): InvestmentMovement => ({
  id: `m${++n}`,
  investment_id: "a",
  kind: "aporte",
  amount: 100,
  date: "2026-11-10",
  notes: null,
  created_at: `2026-01-01T00:00:${String(n).padStart(2, "0")}Z`,
  ...p,
});
const asset = (id: string, asset_class: Investment["asset_class"]): Investment => ({
  id,
  name: id.toUpperCase(),
  asset_class,
  institution: null,
  archived: false,
  created_at: "",
});

describe("investimentos", () => {
  const moves = [
    mv({ date: "2026-06-01", amount: 1000 }),
    mv({ date: "2026-08-01", amount: 500 }),
    mv({ date: "2026-09-01", kind: "saldo", amount: 1600 }),
    mv({ date: "2026-10-01", kind: "resgate", amount: 200 }),
    mv({ date: "2026-11-05", amount: 300 }),
    mv({ investment_id: "b", date: "2026-11-01", amount: 900 }),
    mv({ investment_id: "c", date: "2026-11-01", amount: 50 }),
    mv({ investment_id: "c", date: "2026-11-02", kind: "resgate", amount: 50 }),
  ];

  it("valor parte do último saldo informado", () => {
    expect(assetStats(moves, "2026-08-31").get("a")?.value).toBe(1500);
    expect(assetStats(moves, "2026-09-01").get("a")?.value).toBe(1600);
    expect(assetStats(moves, "2026-11-22").get("a")).toEqual({ value: 1700, net: 1600 });
    expect(assetStats(moves, "2026-11-22").get("c")).toEqual({ value: 0, net: 0 });
  });

  it("lista todos os ativos e soma por classe na ordem fixa, sem os zerados", () => {
    const rows = positions([asset("a", "acoes"), asset("b", "renda_fixa"), asset("c", "cripto")], assetStats(moves, "2026-11-22"));
    expect(rows.map((r) => [r.investment.id, r.value])).toEqual([["a", 1700], ["b", 900], ["c", 0]]);
    expect(byClass(rows).map((c) => c.label)).toEqual(["Renda fixa", "Ações"]);
  });

  it("aporte médio conta a partir do primeiro aporte, no máximo 12 meses", () => {
    // jun a nov = 6 meses; aportes 1000 + 500 + 300 + 900 + 50
    expect(averageMonthlyContribution(moves, "2026-11-22")).toBe(458.33);
    expect(averageMonthlyContribution([mv({ date: "2024-01-01", amount: 1200 }), mv({ date: "2026-11-01", amount: 1200 })], "2026-11-22")).toBe(100);
    expect(averageMonthlyContribution([], "2026-11-22")).toBe(0);
  });

  it("aportes e resgates por mês", () => {
    const flows = monthlyFlows(moves, 3, "2026-11-01");
    expect(flows).toEqual([
      { month: "2026-09-01", aportes: 0, resgates: 0 },
      { month: "2026-10-01", aportes: 0, resgates: 200 },
      { month: "2026-11-01", aportes: 1250, resgates: 50 },
    ]);
  });

  it("topo do eixo arredondado", () => {
    expect([niceMax(0), niceMax(1250), niceMax(21_700), niceMax(9)]).toEqual([1, 1500, 25_000, 10]);
  });
});

describe("valor no centro da rosca", () => {
  it("abrevia valores grandes", () => {
    const clean = (s: string) => s.replace(/\s/g, " ");
    expect(clean(centerMoney(533.5))).toBe("R$ 533,50");
    expect(clean(centerMoney(302_800))).toBe("R$ 302.800");
    expect(clean(centerMoney(1_250_000))).toMatch(/^R\$ 1,3 mi/);
  });
});
