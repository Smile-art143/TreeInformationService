import { healthLabels } from "./mockApi";

// 导出树木点位为 Shapefile 压缩包（.shp / .shx / .dbf / .prj / .cpg）。
// 坐标系采用 WGS84 地理坐标（EPSG:4326），DBF 以 UTF-8 编码（.cpg 声明编码）。

const WGS84_PRJ =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],' +
  'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

const FIELD_DEFS = [
  { name: "ID", type: "C", length: 24, decimals: 0 },
  { name: "SPECIES", type: "C", length: 40, decimals: 0 },
  { name: "DBH", type: "N", length: 8, decimals: 2 },
  { name: "HEALTH", type: "C", length: 12, decimals: 0 },
  { name: "SITE", type: "C", length: 60, decimals: 0 },
  { name: "TYPE", type: "C", length: 20, decimals: 0 },
  { name: "PROTECT", type: "C", length: 20, decimals: 0 },
  { name: "LON", type: "N", length: 18, decimals: 8 },
  { name: "LAT", type: "N", length: 18, decimals: 8 },
];

// ---- 二进制写入辅助 ----
const writeI32BE = (view, offset, value) => view.setInt32(offset, value, false);
const writeI32LE = (view, offset, value) => view.setInt32(offset, value, true);
const writeU16LE = (view, offset, value) => view.setUint16(offset, value, true);
const writeU32LE = (view, offset, value) => view.setUint32(offset, value, true);
const writeF64LE = (view, offset, value) => view.setFloat64(offset, value, true);

function toTreeRecords(trees) {
  return trees
    .filter((tree) => tree.longitude != null && tree.latitude != null)
    .map((tree) => ({
      ID: tree.code ?? tree.id ?? "",
      SPECIES: tree.species ?? "",
      DBH: tree.dbh,
      HEALTH: healthLabels[tree.healthStatus] ?? tree.healthStatus ?? "",
      SITE: tree.siteName ?? tree.locationDescription ?? "",
      TYPE: tree.treeType ?? (tree.isAncient ? "古树" : "普通树"),
      PROTECT: tree.protectionLevel ?? "",
      LON: tree.longitude,
      LAT: tree.latitude,
    }));
}

function writeShpHeader(view, totalLength, minX, minY, maxX, maxY) {
  writeI32BE(view, 0, 9994); // 文件代码
  writeI32BE(view, 24, totalLength / 2); // 文件总长度（16-bit word）
  writeI32LE(view, 28, 1000); // 版本号
  writeI32LE(view, 32, 1); // 几何类型：Point
  writeF64LE(view, 36, minX);
  writeF64LE(view, 44, minY);
  writeF64LE(view, 52, maxX);
  writeF64LE(view, 60, maxY);
  // 其余（Z/M 范围）保持 0
}

function buildShpAndShx(records) {
  const n = records.length;
  const shpLength = 100 + n * 28;
  const shxLength = 100 + n * 8;
  const shpView = new DataView(new ArrayBuffer(shpLength));
  const shxView = new DataView(new ArrayBuffer(shxLength));

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  records.forEach((r) => {
    if (r.LON < minX) minX = r.LON;
    if (r.LON > maxX) maxX = r.LON;
    if (r.LAT < minY) minY = r.LAT;
    if (r.LAT > maxY) maxY = r.LAT;
  });
  if (!Number.isFinite(minX)) {
    minX = minY = maxX = maxY = 0;
  }

  writeShpHeader(shpView, shpLength, minX, minY, maxX, maxY);
  writeShpHeader(shxView, shxLength, minX, minY, maxX, maxY);

  let shpOffset = 100;
  records.forEach((r, i) => {
    writeI32BE(shpView, shpOffset, i + 1); // 记录号
    writeI32BE(shpView, shpOffset + 4, 10); // 内容长度 20 字节 = 10 个 word
    writeI32LE(shpView, shpOffset + 8, 1); // Point
    writeF64LE(shpView, shpOffset + 12, r.LON);
    writeF64LE(shpView, shpOffset + 20, r.LAT);

    const shxOffset = 100 + i * 8;
    writeI32BE(shxView, shxOffset, shpOffset / 2); // 偏移（word）
    writeI32BE(shxView, shxOffset + 4, 10); // 内容长度（word）

    shpOffset += 28;
  });

  return {
    shp: new Uint8Array(shpView.buffer),
    shx: new Uint8Array(shxView.buffer),
  };
}

function encodeChar(encoder, value, length) {
  const bytes = encoder.encode(String(value ?? ""));
  return bytes.length <= length ? bytes : bytes.slice(0, length);
}

function encodeNumber(encoder, value, length, decimals) {
  const num = Number(value);
  let text = Number.isFinite(num) ? num.toFixed(decimals) : "";
  if (text.length > length) text = text.slice(0, length);
  return encoder.encode(text.padStart(length, " "));
}

function buildDbf(records) {
  const headerLength = 32 + FIELD_DEFS.length * 32 + 1;
  const recordLength = 1 + FIELD_DEFS.reduce((sum, f) => sum + f.length, 0);
  const totalLength = headerLength + records.length * recordLength + 1;

  const buf = new Uint8Array(totalLength);
  const view = new DataView(buf.buffer);
  const encoder = new TextEncoder();

  buf[0] = 0x03; // dBASE III
  const now = new Date();
  buf[1] = now.getFullYear() - 1900;
  buf[2] = now.getMonth() + 1;
  buf[3] = now.getDate();
  writeU32LE(view, 4, records.length);
  writeU16LE(view, 8, headerLength);
  writeU16LE(view, 10, recordLength);

  let offset = 32;
  FIELD_DEFS.forEach((f) => {
    const name = encoder.encode(f.name);
    for (let i = 0; i < 11; i++) buf[offset + i] = i < name.length ? name[i] : 0;
    buf[offset + 11] = f.type.charCodeAt(0);
    buf[offset + 16] = f.length;
    buf[offset + 17] = f.decimals;
    offset += 32;
  });
  buf[offset] = 0x0d; // 字段描述区结束符
  offset += 1;

  records.forEach((record) => {
    buf[offset] = 0x20; // 未删除标记
    offset += 1;
    FIELD_DEFS.forEach((f) => {
      const bytes =
        f.type === "C"
          ? encodeChar(encoder, record[f.name], f.length)
          : encodeNumber(encoder, record[f.name], f.length, f.decimals);
      for (let i = 0; i < f.length; i++) buf[offset + i] = i < bytes.length ? bytes[i] : 0x20;
      offset += f.length;
    });
  });
  buf[offset] = 0x1a; // 文件结束标记

  return buf;
}

// ---- ZIP（store 方式，无压缩）----
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZip(entries) {
  const encoder = new TextEncoder();
  const now = new Date();
  const dosTime =
    (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  const localParts = [];
  const centralParts = [];
  let offset = 0;

  entries.forEach((entry) => {
    const nameBytes = encoder.encode(entry.name);
    const data = entry.data;
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    writeU32LE(lv, 0, 0x04034b50);
    writeU16LE(lv, 4, 20);
    writeU16LE(lv, 6, 0);
    writeU16LE(lv, 8, 0); // store
    writeU16LE(lv, 10, dosTime);
    writeU16LE(lv, 12, dosDate);
    writeU32LE(lv, 14, crc);
    writeU32LE(lv, 18, data.length);
    writeU32LE(lv, 22, data.length);
    writeU16LE(lv, 26, nameBytes.length);
    writeU16LE(lv, 28, 0);
    local.set(nameBytes, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    writeU32LE(cv, 0, 0x02014b50);
    writeU16LE(cv, 4, 20);
    writeU16LE(cv, 6, 20);
    writeU16LE(cv, 8, 0);
    writeU16LE(cv, 10, 0); // store
    writeU16LE(cv, 12, dosTime);
    writeU16LE(cv, 14, dosDate);
    writeU32LE(cv, 16, crc);
    writeU32LE(cv, 20, data.length);
    writeU32LE(cv, 24, data.length);
    writeU16LE(cv, 28, nameBytes.length);
    writeU16LE(cv, 30, 0);
    writeU16LE(cv, 32, 0);
    writeU16LE(cv, 34, 0);
    writeU16LE(cv, 36, 0);
    writeU32LE(cv, 38, 0);
    writeU32LE(cv, 42, offset);
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += 30 + nameBytes.length + data.length;
  });

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  writeU32LE(ev, 0, 0x06054b50);
  writeU16LE(ev, 4, 0);
  writeU16LE(ev, 6, 0);
  writeU16LE(ev, 8, entries.length);
  writeU16LE(ev, 10, entries.length);
  writeU32LE(ev, 12, centralSize);
  writeU32LE(ev, 16, offset);
  writeU16LE(ev, 20, 0);

  const result = new Uint8Array(offset + centralSize + 22);
  let pos = 0;
  localParts.forEach((part) => {
    result.set(part, pos);
    pos += part.length;
  });
  centralParts.forEach((part) => {
    result.set(part, pos);
    pos += part.length;
  });
  result.set(end, pos);

  return result;
}

export function exportTreesAsShp(trees, { filename = "TreePoint" } = {}) {
  const records = toTreeRecords(trees);
  if (records.length === 0) {
    throw new Error("没有可导出的树木点位数据");
  }

  const { shp, shx } = buildShpAndShx(records);
  const dbf = buildDbf(records);
  const prj = new TextEncoder().encode(WGS84_PRJ);
  const cpg = new TextEncoder().encode("UTF-8");

  const zip = buildZip([
    { name: `${filename}.shp`, data: shp },
    { name: `${filename}.shx`, data: shx },
    { name: `${filename}.dbf`, data: dbf },
    { name: `${filename}.prj`, data: prj },
    { name: `${filename}.cpg`, data: cpg },
  ]);

  const blob = new Blob([zip], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
