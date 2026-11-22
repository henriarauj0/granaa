// Gerador mínimo de planilhas .xlsx (Office Open XML).
// Usa texto embutido nas células (sem tabela de textos compartilhados) e
// um conjunto fixo de estilos: cabeçalho, data, valor em reais e percentual.

import { parts } from "../dates";
import { zip } from "./zip";

type Style = "text" | "header" | "date" | "money" | "percent" | "bold" | "moneyBold";

const STYLE_INDEX: Record<Style, number> = {
  text: 0,
  header: 1,
  date: 2,
  money: 3,
  percent: 4,
  bold: 5,
  moneyBold: 6,
};

export type Cell =
  | null
  | string
  | number
  | { style: Style; value: string | number };

export const date = (iso: string): Cell => ({ style: "date", value: iso });
export const money = (value: number): Cell => ({ style: "money", value });
export const moneyBold = (value: number): Cell => ({ style: "moneyBold", value });
export const percent = (value: number): Cell => ({ style: "percent", value });
export const bold = (value: string): Cell => ({ style: "bold", value });

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface Sheet {
  name: string;
  /** Largura de cada coluna, em caracteres. */
  widths: number[];
  rows: Cell[][];
  /** Primeira linha como cabeçalho fixo, com filtro. */
  header?: boolean;
}

/** Número de série de data do Excel (dias desde 30/12/1899). */
export function excelDate(iso: string): number {
  const { year, month, day } = parts(iso);
  return (Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86_400_000;
}

export function columnName(index: number): string {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

function escapeXml(text: string): string {
  return text
    // caracteres de controle não são aceitos em XML 1.0
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Nome de aba aceito pelo Excel: até 31 caracteres, sem []:*?/\ */
function sheetName(name: string): string {
  return name.replace(/[[\]:*?/\\]/g, " ").slice(0, 31) || "Planilha";
}

function cellXml(cell: Cell, ref: string, headerRow: boolean): string {
  if (cell == null || cell === "") return "";
  let style: Style = headerRow ? "header" : "text";
  let value: string | number;
  if (typeof cell === "object") {
    style = cell.style;
    value = cell.value;
  } else {
    value = cell;
  }
  const s = STYLE_INDEX[style] ? ` s="${STYLE_INDEX[style]}"` : "";
  if (style === "date" && typeof value === "string") value = excelDate(value);
  if (typeof value === "number") {
    return Number.isFinite(value) ? `<c r="${ref}"${s}><v>${value}</v></c>` : "";
  }
  const space = /^\s|\s$/.test(value) ? ' xml:space="preserve"' : "";
  return `<c r="${ref}"${s} t="inlineStr"><is><t${space}>${escapeXml(value)}</t></is></c>`;
}

/** Última coluna e última linha do filtro automático, ou null sem cabeçalho ou sem dados. */
function filterEnd(sheet: Sheet): { col: string; row: number } | null {
  if (!sheet.header || sheet.rows.length < 2) return null;
  return { col: columnName(Math.max(0, sheet.widths.length - 1)), row: sheet.rows.length };
}

function sheetXml(sheet: Sheet): string {
  const rows = sheet.rows
    .map((row, r) => {
      const cells = row.map((cell, c) => cellXml(cell, `${columnName(c)}${r + 1}`, !!sheet.header && r === 0)).join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  const cols = sheet.widths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join("");
  const pane = sheet.header
    ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
    : "";
  const end = filterEnd(sheet);
  const filter = end ? `<autoFilter ref="A1:${end.col}${end.row}"/>` : "";
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>` +
    `<cols>${cols}</cols>` +
    `<sheetData>${rows}</sheetData>` +
    filter +
    "</worksheet>"
  );
}

const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="2">' +
  '<numFmt numFmtId="164" formatCode="dd/mm/yyyy"/>' +
  '<numFmt numFmtId="165" formatCode="#,##0.00;[Red]-#,##0.00"/>' +
  "</numFmts>" +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFDCEFE4"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="7">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="165" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
  "</cellXfs>" +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  "</styleSheet>";

export function buildXlsx(sheets: Sheet[]): Uint8Array {
  const encoder = new TextEncoder();
  const names = sheets.map((s) => sheetName(s.name));

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    sheets
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join("") +
    "</Types>";

  const rootRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    "</Relationships>";

  const filters = sheets
    .map((s, i) => {
      const end = filterEnd(s);
      if (!end) return "";
      const quoted = `'${escapeXml(names[i]).replace(/'/g, "''")}'`;
      return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${quoted}!$A$1:$${end.col}$${end.row}</definedName>`;
    })
    .join("");

  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    "<sheets>" +
    names.map((n, i) => `<sheet name="${escapeXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
    "</sheets>" +
    (filters ? `<definedNames>${filters}</definedNames>` : "") +
    "</workbook>";

  const workbookRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheets
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join("") +
    `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    "</Relationships>";

  return zip([
    { name: "[Content_Types].xml", data: encoder.encode(contentTypes) },
    { name: "_rels/.rels", data: encoder.encode(rootRels) },
    { name: "xl/workbook.xml", data: encoder.encode(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: encoder.encode(workbookRels) },
    { name: "xl/styles.xml", data: encoder.encode(STYLES_XML) },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: encoder.encode(sheetXml(s)) })),
  ]);
}
