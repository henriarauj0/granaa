// Gravador mínimo de arquivos ZIP, sem compressão (método "stored").
// Basta para montar um .xlsx, que é um ZIP com alguns arquivos XML.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

// 01/01/1980 00:00 no formato de data do MS-DOS
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
const UTF8_FLAG = 0x0800;

export function zip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const files = entries.map((e) => ({ name: encoder.encode(e.name), data: e.data, crc: crc32(e.data) }));

  const localSize = files.reduce((sum, f) => sum + 30 + f.name.length + f.data.length, 0);
  const centralSize = files.reduce((sum, f) => sum + 46 + f.name.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let p = 0;
  const u16 = (v: number) => {
    view.setUint16(p, v, true);
    p += 2;
  };
  const u32 = (v: number) => {
    view.setUint32(p, v, true);
    p += 4;
  };
  const bytes = (b: Uint8Array) => {
    out.set(b, p);
    p += b.length;
  };

  const offsets: number[] = [];
  for (const f of files) {
    offsets.push(p);
    u32(0x04034b50);
    u16(20);
    u16(UTF8_FLAG);
    u16(0);
    u16(DOS_TIME);
    u16(DOS_DATE);
    u32(f.crc);
    u32(f.data.length);
    u32(f.data.length);
    u16(f.name.length);
    u16(0);
    bytes(f.name);
    bytes(f.data);
  }

  files.forEach((f, i) => {
    u32(0x02014b50);
    u16(20);
    u16(20);
    u16(UTF8_FLAG);
    u16(0);
    u16(DOS_TIME);
    u16(DOS_DATE);
    u32(f.crc);
    u32(f.data.length);
    u32(f.data.length);
    u16(f.name.length);
    u16(0);
    u16(0);
    u16(0);
    u16(0);
    u32(0);
    u32(offsets[i]);
    bytes(f.name);
  });

  // o diretório central começa logo depois dos arquivos
  u32(0x06054b50);
  u16(0);
  u16(0);
  u16(files.length);
  u16(files.length);
  u32(centralSize);
  u32(localSize);
  u16(0);
  return out;
}
