import { isValidISODate, toISODate } from "../dates";
import { parseMoney } from "../money";
import { isXls, isZip, readXlsRows } from "./xls";

/** Linha de extrato já interpretada. amount > 0 = entrada; amount < 0 = saída. */
export interface StatementRow {
  date: string;
  description: string;
  amount: number;
  /** identificador único do banco (FITID no OFX), quando existir */
  externalId?: string;
  /** tipo de operação informado pelo banco ("Pix enviado", "Cancelamento de compra"...) */
  operation?: string;
  /** contraparte, quando o banco separa operação e descrição */
  counterparty?: string;
  /** categoria sugerida pelo próprio banco */
  bankCategory?: string;
}

export interface ParseResult {
  format: "ofx" | "csv" | "xls";
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
  // número de série de data do Excel (dias desde 30/12/1899), entre 1990 e 2100
  m = s.match(/^(\d{5})(\.\d+)?$/);
  if (m && +m[1] >= 32874 && +m[1] <= 73050) {
    const d = new Date(Date.UTC(1899, 11, 30) + +m[1] * 86400000);
    return toISODate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
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
  /** coluna com o tipo da operação (opcional) */
  type?: number | null;
  /** coluna com a categoria do banco (opcional) */
  category?: number | null;
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
  return tableFromRows(lines.map((l) => splitCsvLine(l, delimiter)));
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const DATE_HEADER = [/^data$/, /^date$/, /data (do |de )?lancamento/, /^data/, /data/, /date/, /^dt/];
const AMOUNT_HEADER = [/^valor$/, /^amount$/, /^value$/, /valor/, /quantia/, /amount/, /^credito/, /^debito/];

/**
 * Localiza o cabeçalho (bancos costumam pôr dados do cliente antes da tabela)
 * e devolve as linhas seguintes. Linhas vazias são descartadas.
 */
export function tableFromRows(input: string[][]): CsvTable {
  const table = input.map((r) => r.map((c) => (c ?? "").trim())).filter((r) => r.some((c) => c !== ""));
  let headerIndex = -1;
  // 1º: linha com nomes de coluna reconhecíveis (data + valor) e sem datas
  for (let i = 0; i < Math.min(table.length, 40); i++) {
    const cells = table[i].map(norm);
    const hasDateHeader = cells.some((c) => c && DATE_HEADER.some((p) => p.test(c)));
    const hasAmountHeader = cells.some((c) => c && AMOUNT_HEADER.some((p) => p.test(c)));
    if (hasDateHeader && hasAmountHeader && !table[i].some((c) => parseDate(c))) {
      headerIndex = i;
      break;
    }
  }
  // 2º: primeira linha sem data seguida de uma linha com data
  if (headerIndex < 0) {
    headerIndex = 0;
    for (let i = 0; i < Math.min(table.length - 1, 15); i++) {
      const hasDate = table[i].some((c) => parseDate(c));
      const nextHasDate = table[i + 1].some((c) => parseDate(c));
      if (!hasDate && nextHasDate && table[i].filter(Boolean).length >= 2) {
        headerIndex = i;
        break;
      }
    }
  }
  const headers = table[headerIndex] ?? [];
  return { headers, rows: table.slice(headerIndex + 1) };
}

function findColumn(headers: string[], patterns: RegExp[], exclude: number[] = []): number {
  for (const p of patterns) {
    const i = headers.findIndex((h, idx) => !exclude.includes(idx) && h.trim() !== "" && p.test(norm(h)));
    if (i >= 0) return i;
  }
  return -1;
}

export function guessMapping(table: CsvTable): CsvMapping | null {
  const h = table.headers;
  let date = findColumn(h, DATE_HEADER);
  const description = findColumn(
    h,
    [/^descricao$/, /^description$/, /^title$/, /^historico$/, /descri/, /historico/, /estabelecimento/, /memo/, /titulo/, /detalhe/, /lancamento/],
    [date],
  );
  const type = findColumn(h, [/^transacao$/, /^tipo( de)?( transacao| lancamento| operacao)?$/, /^operacao$/, /^lancamento$/, /^historico$/], [date, description]);
  const category = findColumn(h, [/^categoria$/, /^category$/], [date, description, type]);
  const credit = findColumn(h, [/^credito/, /^entrada/, /^credit/]);
  const debit = findColumn(h, [/^debito/, /^saida/, /^debit/]);
  const amount = findColumn(h, [/^valor$/, /^amount$/, /^value$/, /valor/, /quantia/, /amount/], [date, description, type, category]);
  const extra = { type: type >= 0 ? type : null, category: category >= 0 ? category : null };

  if (date < 0) {
    // sem cabeçalho reconhecível: procura a coluna com mais datas
    date = mostLikely(table, (c) => parseDate(c) != null);
  }
  if (date < 0 || description < 0) return null;
  if (amount >= 0) return { date, description, amount, credit: null, debit: null, ...extra };
  if (credit >= 0 && debit >= 0) return { date, description, amount: null, credit, debit, ...extra };
  return null;
}

function mostLikely(table: CsvTable, test: (cell: string) => boolean): number {
  const width = Math.max(table.headers.length, ...table.rows.slice(0, 20).map((r) => r.length));
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

/** "Pix enviado" + "Fulano" → "Pix enviado - Fulano"; compras mostram só o estabelecimento. */
export function composeDescription(operation: string, counterparty: string): string {
  const op = cleanDescription(operation);
  const cp = cleanDescription(counterparty);
  if (!op) return cp;
  if (!cp) return op;
  const nop = norm(op);
  const ncp = norm(cp);
  if (/^compra/.test(nop) || ncp.includes(nop)) return cp;
  if (nop.includes(ncp)) return op;
  return cleanDescription(`${op} - ${cp}`);
}

export function rowsFromCsv(table: CsvTable, mapping: CsvMapping): { rows: StatementRow[]; warnings: string[] } {
  const rows: StatementRow[] = [];
  const warnings: string[] = [];
  table.rows.forEach((r, i) => {
    const date = parseDate(r[mapping.date] ?? "");
    // sem data: cabeçalhos repetidos a cada página, rodapés e totais
    if (!date) return;
    let amount: number | null = null;
    if (mapping.amount != null) amount = parseMoney(r[mapping.amount] ?? "");
    else if (mapping.credit != null && mapping.debit != null) {
      const c = parseMoney(r[mapping.credit] ?? "") ?? 0;
      const d = parseMoney(r[mapping.debit] ?? "") ?? 0;
      amount = Math.abs(c) - Math.abs(d);
    }
    const counterparty = cleanDescription(r[mapping.description] ?? "");
    const operation = mapping.type != null ? cleanDescription(r[mapping.type] ?? "") : "";
    if (/^saldo\b|saldo (anterior|do dia|diario|final)/.test(norm(counterparty || operation))) return;
    if (amount == null) {
      warnings.push(`Linha ${i + 1} ignorada (valor ilegível): ${r.filter(Boolean).join(" | ").slice(0, 80)}`);
      return;
    }
    if (amount === 0) return;
    const bankCategory = mapping.category != null ? cleanDescription(r[mapping.category] ?? "") : "";
    rows.push({
      date,
      description: composeDescription(operation, counterparty) || "Sem descrição",
      amount,
      ...(operation ? { operation } : {}),
      ...(counterparty && operation ? { counterparty } : {}),
      ...(bankCategory ? { bankCategory } : {}),
    });
  });
  return { rows, warnings };
}

function parseTable(table: CsvTable, format: "csv" | "xls"): ParseResult {
  const mapping = guessMapping(table);
  if (!mapping) {
    return {
      format,
      rows: [],
      warnings: ["Não consegui identificar as colunas automaticamente. Indique abaixo quais são."],
      csv: table,
    };
  }
  const { rows, warnings } = rowsFromCsv(table, mapping);
  return { format, rows, warnings, csv: table, mapping };
}

export function parseCsv(text: string): ParseResult {
  return parseTable(readCsv(text), "csv");
}

/** Lê o arquivo enviado: OFX, CSV ou Excel 97-2003 (.xls). */
export function parseStatementFile(buffer: ArrayBuffer): ParseResult {
  const bytes = new Uint8Array(buffer);
  if (isXls(bytes)) return parseTable(tableFromRows(readXlsRows(buffer)), "xls");
  if (isZip(bytes)) {
    throw new Error("Arquivos .xlsx ainda não são aceitos. No Excel, salve como .xls (97-2003) ou CSV, ou baixe o extrato em OFX.");
  }
  return parseStatement(decodeFile(buffer));
}

export function parseStatement(text: string): ParseResult {
  return isOfx(text) ? parseOfx(text) : parseCsv(text);
}

export function cleanDescription(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, 140);
}
