import { isValidISODate, toISODate } from "../dates";
import { parseMoney } from "../money";

/** Linha de extrato já interpretada. amount > 0 = entrada; amount < 0 = saída. */
export interface StatementRow {
  date: string;
  description: string;
  amount: number;
  /** identificador único do banco (FITID no OFX), quando existir */
  externalId?: string;
}

export interface ParseResult {
  format: "ofx" | "csv";
  rows: StatementRow[];
  warnings: string[];
  /** apenas CSV: colunas e linhas brutas, para mapeamento manual */
  csv?: CsvTable;
  mapping?: CsvMapping;
}

// ---------------------------------------------------------------------------
// Leitura do arquivo (bancos brasileiros ainda usam Windows-1252 com frequência)
// ---------------------------------------------------------------------------

export function decodeFile(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 600));
  const declaresLatin = /CHARSET:\s*(1252|8859|ISO-8859-1)|encoding="(windows-1252|iso-8859-1)"/i.test(head);
  if (!declaresLatin) {
    try {
      return stripBom(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
      // não é UTF-8 válido: cai para Windows-1252
    }
  }
  return stripBom(new TextDecoder("windows-1252").decode(bytes));
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------

/** Aceita dd/mm/aaaa, dd/mm/aa, dd-mm-aaaa, dd.mm.aaaa, aaaa-mm-dd e aaaammdd. */
export function parseDate(input: string): string | null {
  const s = input.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    let year = +m[3];
    if (m[3].length === 2) year += year >= 70 ? 1900 : 2000;
    return valid(year, +m[2], +m[1]);
  }
  m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  return null;
}

function valid(y: number, mo: number, d: number): string | null {
  const iso = toISODate(y, mo, d);
  return isValidISODate(iso) ? iso : null;
}

// ---------------------------------------------------------------------------
// OFX (SGML 1.x ou XML 2.x)
// ---------------------------------------------------------------------------

export function isOfx(text: string): boolean {
  return /OFXHEADER|<OFX>/i.test(text.slice(0, 2000));
}

function ofxTag(block: string, tag: string): string | undefined {
  const m = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"));
  return m ? decodeEntities(m[1].trim()) : undefined;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'");
}

export function parseOfx(text: string): ParseResult {
  const warnings: string[] = [];
  const rows: StatementRow[] = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  for (const raw of blocks) {
    const block = raw.split(/<\/STMTTRN>/i)[0];
    const date = parseDate(ofxTag(block, "DTPOSTED") ?? "");
    const amount = parseMoney(ofxTag(block, "TRNAMT") ?? "");
    const memo = ofxTag(block, "MEMO");
    const name = ofxTag(block, "NAME");
    const description = cleanDescription(
      memo && name && !memo.toLowerCase().includes(name.toLowerCase()) ? `${name} - ${memo}` : memo || name || "Sem descrição",
    );
    if (!date || amount == null) {
      warnings.push(`Lançamento ignorado (data ou valor ilegível): ${description}`);
      continue;
    }
    if (amount === 0) continue;
    rows.push({ date, amount, description, externalId: ofxTag(block, "FITID") || undefined });
  }
  if (blocks.length === 0) warnings.push("Nenhum lançamento encontrado no arquivo OFX.");
  return { format: "ofx", rows, warnings };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export interface CsvTable {
  headers: string[];
  rows: string[][];
}

export interface CsvMapping {
  date: number;
  description: number;
  /** coluna única de valor (com sinal) */
  amount: number | null;
  /** alternativa: colunas separadas de crédito e débito */
  credit: number | null;
  debit: number | null;
}

export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
  const candidates = [";", ",", "\t", "|"];
  let best = ",";
  let bestScore = -1;
  for (const d of candidates) {
    // número de colunas mais frequente (linhas de título no topo não contam)
    const freq = new Map<number, number>();
    for (const l of lines) {
      const n = splitCsvLine(l, d).length;
      if (n > 1) freq.set(n, (freq.get(n) ?? 0) + 1);
    }
    let score = -1;
    for (const [cols, times] of freq) score = Math.max(score, times * 10 + cols);
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

export function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function readCsv(text: string): CsvTable {
  const delimiter = detectDelimiter(text);
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const table = lines.map((l) => splitCsvLine(l, delimiter));
  // o cabeçalho é a primeira linha que não contém data válida em nenhuma coluna
  // e que é seguida por linhas com datas (alguns bancos colocam títulos antes)
  let headerIndex = 0;
  for (let i = 0; i < Math.min(table.length - 1, 15); i++) {
    const hasDate = table[i].some((c) => parseDate(c));
    const nextHasDate = table[i + 1].some((c) => parseDate(c));
    if (!hasDate && nextHasDate && table[i].length >= 2) {
      headerIndex = i;
      break;
    }
  }
  const headers = table[headerIndex] ?? [];
  const width = headers.length;
  const rows = table.slice(headerIndex + 1).filter((r) => r.length >= Math.min(width, 2));
  return { headers, rows };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

function findColumn(headers: string[], patterns: RegExp[], exclude: number[] = []): number {
  for (const p of patterns) {
    const i = headers.findIndex((h, idx) => !exclude.includes(idx) && p.test(norm(h)));
    if (i >= 0) return i;
  }
  return -1;
}

export function guessMapping(table: CsvTable): CsvMapping | null {
  const h = table.headers;
  let date = findColumn(h, [/^data$/, /^date$/, /data (do )?lancamento/, /data/, /date/, /^dt/]);
  const description = findColumn(
    h,
    [/^descricao$/, /^description$/, /^title$/, /historico/, /descri/, /estabelecimento/, /lancamento/, /memo/, /titulo/, /detalhe/],
    [date],
  );
  const credit = findColumn(h, [/^credito/, /^entrada/, /^credit/]);
  const debit = findColumn(h, [/^debito/, /^saida/, /^debit/]);
  const amount = findColumn(h, [/^valor$/, /^amount$/, /^value$/, /valor/, /quantia/, /amount/], [date, description]);

  if (date < 0) {
    // sem cabeçalho reconhecível: procura a coluna com mais datas
    date = mostLikely(table, (c) => parseDate(c) != null);
  }
  if (date < 0 || description < 0) return null;
  if (amount >= 0) return { date, description, amount, credit: null, debit: null };
  if (credit >= 0 && debit >= 0) return { date, description, amount: null, credit, debit };
  return null;
}

function mostLikely(table: CsvTable, test: (cell: string) => boolean): number {
  const width = table.headers.length;
  let best = -1;
  let bestCount = 0;
  for (let c = 0; c < width; c++) {
    const count = table.rows.slice(0, 20).filter((r) => r[c] != null && test(r[c])).length;
    if (count > bestCount) {
      best = c;
      bestCount = count;
    }
  }
  return best;
}

export function rowsFromCsv(table: CsvTable, mapping: CsvMapping): { rows: StatementRow[]; warnings: string[] } {
  const rows: StatementRow[] = [];
  const warnings: string[] = [];
  table.rows.forEach((r, i) => {
    const date = parseDate(r[mapping.date] ?? "");
    const description = cleanDescription(r[mapping.description] ?? "") || "Sem descrição";
    let amount: number | null = null;
    if (mapping.amount != null) amount = parseMoney(r[mapping.amount] ?? "");
    else if (mapping.credit != null && mapping.debit != null) {
      const c = parseMoney(r[mapping.credit] ?? "") ?? 0;
      const d = parseMoney(r[mapping.debit] ?? "") ?? 0;
      amount = Math.abs(c) - Math.abs(d);
    }
    if (!date || amount == null) {
      const joined = r.join(" ").toLowerCase();
      // linhas de saldo/total são comuns em extratos e podem ser ignoradas sem aviso
      if (!/saldo|total/.test(joined)) warnings.push(`Linha ${i + 1} ignorada: ${r.join(" | ").slice(0, 80)}`);
      return;
    }
    if (amount === 0) return;
    if (/^saldo\b|saldo (anterior|do dia|final)/i.test(description)) return;
    rows.push({ date, description, amount });
  });
  return { rows, warnings };
}

export function parseCsv(text: string): ParseResult {
  const table = readCsv(text);
  const mapping = guessMapping(table);
  if (!mapping) {
    return {
      format: "csv",
      rows: [],
      warnings: ["Não consegui identificar as colunas automaticamente. Indique abaixo quais são."],
      csv: table,
    };
  }
  const { rows, warnings } = rowsFromCsv(table, mapping);
  return { format: "csv", rows, warnings, csv: table, mapping };
}

export function parseStatement(text: string): ParseResult {
  return isOfx(text) ? parseOfx(text) : parseCsv(text);
}

export function cleanDescription(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, 140);
}
