// Leitor mínimo de planilhas Excel 97-2003 (.xls, formato BIFF8).
// Lê apenas os valores das células da primeira planilha, que é o necessário
// para extratos bancários. Sem dependências externas.

const ENDOFCHAIN = 0xfffffffe;
const FREESECT = 0xffffffff;

export function isXls(bytes: Uint8Array): boolean {
  const sig = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  return bytes.length >= 512 && sig.every((b, i) => bytes[i] === b);
}

export function isZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

// ---------------------------------------------------------------------------
// Contêiner OLE / Compound File Binary
// ---------------------------------------------------------------------------

function readCfbStream(bytes: Uint8Array, wanted: string[]): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (o: number) => view.getUint32(o, true);
  const u16 = (o: number) => view.getUint16(o, true);

  const sectorSize = 1 << u16(0x1e);
  const miniSectorSize = 1 << u16(0x20);
  const firstDirSector = u32(0x30);
  const miniCutoff = u32(0x38);
  const firstMiniFat = u32(0x3c);
  let difatSector = u32(0x44);
  const numDifat = u32(0x48);
  if (sectorSize !== 512 && sectorSize !== 4096) throw new Error("Arquivo .xls inválido");

  const sectorOffset = (sid: number) => (sid + 1) * sectorSize;
  const maxSectors = Math.floor(bytes.length / sectorSize);

  // DIFAT: localização dos setores da FAT
  const fatSectors: number[] = [];
  for (let i = 0; i < 109; i++) {
    const s = u32(0x4c + i * 4);
    if (s !== FREESECT && s !== ENDOFCHAIN) fatSectors.push(s);
  }
  for (let n = 0; n < numDifat && difatSector !== ENDOFCHAIN && difatSector < maxSectors; n++) {
    const base = sectorOffset(difatSector);
    const per = sectorSize / 4 - 1;
    for (let i = 0; i < per; i++) {
      const s = u32(base + i * 4);
      if (s !== FREESECT && s !== ENDOFCHAIN) fatSectors.push(s);
    }
    difatSector = u32(base + per * 4);
  }

  const fat: number[] = [];
  for (const s of fatSectors) {
    if (s >= maxSectors) continue;
    const base = sectorOffset(s);
    for (let i = 0; i < sectorSize / 4; i++) fat.push(u32(base + i * 4));
  }

  const chain = (start: number, table: number[], limit: number) => {
    const out: number[] = [];
    const seen = new Set<number>();
    for (let s = start; s !== ENDOFCHAIN && s < limit && !seen.has(s); s = table[s] ?? ENDOFCHAIN) {
      seen.add(s);
      out.push(s);
    }
    return out;
  };

  const readChain = (start: number, size?: number) => {
    const sectors = chain(start, fat, maxSectors);
    const out = new Uint8Array(sectors.length * sectorSize);
    sectors.forEach((s, i) => out.set(bytes.subarray(sectorOffset(s), sectorOffset(s) + sectorSize), i * sectorSize));
    return size == null ? out : out.subarray(0, Math.min(size, out.length));
  };

  // Diretório
  const dir = readChain(firstDirSector);
  const dirView = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
  interface Entry { name: string; type: number; start: number; size: number }
  const entries: Entry[] = [];
  for (let off = 0; off + 128 <= dir.length; off += 128) {
    const nameLen = dirView.getUint16(off + 0x40, true);
    let name = "";
    for (let i = 0; i + 2 < nameLen && i < 64; i += 2) name += String.fromCharCode(dirView.getUint16(off + i, true));
    entries.push({
      name,
      type: dir[off + 0x42],
      start: dirView.getUint32(off + 0x74, true),
      size: dirView.getUint32(off + 0x78, true),
    });
  }
  const root = entries.find((e) => e.type === 5);
  const entry = entries.find((e) => e.type === 2 && wanted.includes(e.name));
  if (!entry) return null;
  if (entry.size >= miniCutoff || !root) return readChain(entry.start, entry.size);

  // Fluxos pequenos ficam no mini stream
  const miniStream = readChain(root.start, root.size);
  const miniFatBytes = readChain(firstMiniFat);
  const miniFatView = new DataView(miniFatBytes.buffer, miniFatBytes.byteOffset, miniFatBytes.byteLength);
  const miniFat: number[] = [];
  for (let i = 0; i + 4 <= miniFatBytes.length; i += 4) miniFat.push(miniFatView.getUint32(i, true));
  const sectors = chain(entry.start, miniFat, Math.floor(miniStream.length / miniSectorSize));
  const out = new Uint8Array(sectors.length * miniSectorSize);
  sectors.forEach((s, i) => out.set(miniStream.subarray(s * miniSectorSize, (s + 1) * miniSectorSize), i * miniSectorSize));
  return out.subarray(0, entry.size);
}

// ---------------------------------------------------------------------------
// Registros BIFF8
// ---------------------------------------------------------------------------

interface BiffRecord {
  type: number;
  data: Uint8Array;
}

function* records(stream: Uint8Array): Generator<BiffRecord> {
  let off = 0;
  while (off + 4 <= stream.length) {
    const type = stream[off] | (stream[off + 1] << 8);
    const len = stream[off + 2] | (stream[off + 3] << 8);
    yield { type, data: stream.subarray(off + 4, Math.min(stream.length, off + 4 + len)) };
    off += 4 + len;
  }
}

const dv = (d: Uint8Array) => new DataView(d.buffer, d.byteOffset, d.byteLength);

function decodeChars(data: Uint8Array, off: number, count: number, wide: boolean): string {
  let s = "";
  for (let i = 0; i < count; i++) {
    s += wide ? String.fromCharCode(data[off + i * 2] | (data[off + i * 2 + 1] << 8)) : String.fromCharCode(data[off + i]);
  }
  return s;
}

/** Lê a tabela de strings compartilhadas (SST), que pode continuar em registros CONTINUE. */
function readSst(segments: Uint8Array[]): string[] {
  let seg = 0;
  let pos = 8; // pula total e únicos
  const out: string[] = [];
  const total = dv(segments[0]).getUint32(4, true);

  const ensure = () => {
    while (seg < segments.length && pos >= segments[seg].length) {
      seg++;
      pos = 0;
    }
    return seg < segments.length;
  };
  const u8 = () => {
    ensure();
    return segments[seg]?.[pos++] ?? 0;
  };
  const u16 = () => u8() | (u8() << 8);
  const u32 = () => (u16() | (u16() << 16)) >>> 0;
  const skip = (n: number) => {
    while (n > 0 && ensure()) {
      const take = Math.min(n, segments[seg].length - pos);
      pos += take;
      n -= take;
    }
  };

  for (let i = 0; i < total && ensure(); i++) {
    const cch = u16();
    const flags = u8();
    let wide = (flags & 0x01) !== 0;
    const runs = flags & 0x08 ? u16() : 0;
    const ext = flags & 0x04 ? u32() : 0;
    let s = "";
    let remaining = cch;
    while (remaining > 0) {
      if (!ensure()) break;
      const avail = segments[seg].length - pos;
      if (avail <= 0) continue;
      const bytesPer = wide ? 2 : 1;
      const n = Math.min(remaining, Math.floor(avail / bytesPer));
      s += decodeChars(segments[seg], pos, n, wide);
      pos += n * bytesPer;
      remaining -= n;
      if (remaining > 0) {
        // a string continua no próximo CONTINUE, que começa com um novo byte de opções
        seg++;
        pos = 0;
        if (seg >= segments.length) break;
        wide = (segments[seg][pos++] & 0x01) !== 0;
      }
    }
    skip(runs * 4 + ext);
    out.push(s);
  }
  return out;
}

function rkValue(rk: number): number {
  let v: number;
  if (rk & 0x02) {
    v = rk >> 2; // inteiro de 30 bits com sinal
  } else {
    const buf = new DataView(new ArrayBuffer(8));
    buf.setUint32(4, rk & 0xfffffffc, true);
    v = buf.getFloat64(0, true);
  }
  return rk & 0x01 ? v / 100 : v;
}

function formatNumber(n: number): string {
  // evita representações como 0.30000000000000004
  return String(Math.round(n * 1e8) / 1e8);
}

/** Devolve as linhas da primeira planilha como texto (números com ponto decimal). */
export function readXlsRows(buffer: ArrayBuffer): string[][] {
  const bytes = new Uint8Array(buffer);
  const stream = readCfbStream(bytes, ["Workbook", "Book"]);
  if (!stream) throw new Error("Planilha não encontrada no arquivo.");

  let sst: string[] = [];
  const sstSegments: Uint8Array[] = [];
  let inSst = false;
  let sheetIndex = -1; // -1 = globais; 0 = primeira planilha
  const grid = new Map<number, Map<number, string>>();
  const set = (row: number, col: number, value: string) => {
    if (!grid.has(row)) grid.set(row, new Map());
    grid.get(row)!.set(col, value);
  };
  let pendingFormula: { row: number; col: number } | null = null;

  for (const rec of records(stream)) {
    if (rec.type === 0x003c && inSst) {
      sstSegments.push(rec.data);
      continue;
    }
    if (inSst) {
      sst = readSst(sstSegments);
      inSst = false;
    }
    switch (rec.type) {
      case 0x0809: {
        // BOF
        const kind = dv(rec.data).getUint16(2, true);
        if (kind === 0x0010) sheetIndex++;
        if (kind === 0x0005 && dv(rec.data).getUint16(0, true) !== 0x0600) {
          throw new Error("Versão de .xls muito antiga. Salve como .xls (97-2003), CSV ou OFX.");
        }
        break;
      }
      case 0x00fc: // SST
        sstSegments.length = 0;
        sstSegments.push(rec.data);
        inSst = true;
        break;
    }
    if (sheetIndex !== 0) {
      if (sheetIndex > 0) break;
      continue;
    }
    const d = dv(rec.data);
    switch (rec.type) {
      case 0x00fd: // LABELSST
        set(d.getUint16(0, true), d.getUint16(2, true), sst[d.getUint32(6, true)] ?? "");
        break;
      case 0x0204: {
        // LABEL
        const cch = d.getUint16(6, true);
        const wide = (rec.data[8] & 0x01) !== 0;
        set(d.getUint16(0, true), d.getUint16(2, true), decodeChars(rec.data, 9, cch, wide));
        break;
      }
      case 0x0203: // NUMBER
        set(d.getUint16(0, true), d.getUint16(2, true), formatNumber(d.getFloat64(6, true)));
        break;
      case 0x027e: // RK
        set(d.getUint16(0, true), d.getUint16(2, true), formatNumber(rkValue(d.getUint32(6, true))));
        break;
      case 0x00bd: {
        // MULRK
        const row = d.getUint16(0, true);
        const first = d.getUint16(2, true);
        const count = (rec.data.length - 6) / 6;
        for (let i = 0; i < count; i++) set(row, first + i, formatNumber(rkValue(d.getUint32(4 + i * 6 + 2, true))));
        break;
      }
      case 0x0006: {
        // FORMULA: resultado numérico ou string no registro STRING seguinte
        const row = d.getUint16(0, true);
        const col = d.getUint16(2, true);
        if (d.getUint16(12, true) === 0xffff) {
          if (rec.data[6] === 0x00) pendingFormula = { row, col };
        } else set(row, col, formatNumber(d.getFloat64(6, true)));
        break;
      }
      case 0x0207: {
        // STRING (resultado de fórmula)
        if (pendingFormula) {
          const cch = d.getUint16(0, true);
          const wide = (rec.data[2] & 0x01) !== 0;
          set(pendingFormula.row, pendingFormula.col, decodeChars(rec.data, 3, cch, wide));
          pendingFormula = null;
        }
        break;
      }
    }
  }

  const rowNumbers = [...grid.keys()].sort((a, b) => a - b);
  return rowNumbers.map((r) => {
    const cols = grid.get(r)!;
    const width = Math.max(...cols.keys()) + 1;
    return Array.from({ length: width }, (_, c) => (cols.get(c) ?? "").trim());
  });
}
