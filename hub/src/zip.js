// Lecture minimale d'une archive .zip (stockée ou compressée « deflate »), sans dépendance.
// Protections : pas de chemins qui sortent du dossier, pas de zip64, pas de chiffrement,
// taille décompressée plafonnée (la taille annoncée est aussi une limite stricte à l'écriture).
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { Transform } = require("stream");
const { pipeline } = require("stream/promises");

const E = (m) => Object.assign(new Error(m), { user: true });
const MAX_ENTRIES = 200_000;
const MAX_TOTAL = 3 * 1024 ** 3; // 3 Go décompressés

async function readEntries(file) {
  const fh = await fs.promises.open(file, "r");
  try {
    const { size } = await fh.stat();
    const tail = Math.min(size, 65557);
    const buf = Buffer.alloc(tail);
    await fh.read(buf, 0, tail, size - tail);
    let eocd = -1;
    for (let i = tail - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw E("Ce fichier n'est pas une archive .zip valide.");
    const total = buf.readUInt16LE(eocd + 10);
    const cdSize = buf.readUInt32LE(eocd + 12);
    const cdOff = buf.readUInt32LE(eocd + 16);
    if (total === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) throw E("Archive trop volumineuse (zip64) : réduisez son contenu (sans node_modules ni .next/cache).");
    if (total > MAX_ENTRIES) throw E("Archive trop volumineuse : trop de fichiers.");
    if (cdOff + cdSize > size) throw E("Archive .zip endommagée.");
    const cd = Buffer.alloc(cdSize);
    await fh.read(cd, 0, cdSize, cdOff);
    const entries = [];
    let sum = 0;
    for (let p = 0, n = 0; n < total; n++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) throw E("Archive .zip endommagée.");
      const flags = cd.readUInt16LE(p + 8);
      const method = cd.readUInt16LE(p + 10);
      const csize = cd.readUInt32LE(p + 20);
      const usize = cd.readUInt32LE(p + 24);
      const nlen = cd.readUInt16LE(p + 28);
      const elen = cd.readUInt16LE(p + 30);
      const clen = cd.readUInt16LE(p + 32);
      const off = cd.readUInt32LE(p + 42);
      const rawName = cd.subarray(p + 46, p + 46 + nlen).toString(flags & 0x800 ? "utf8" : "latin1");
      p += 46 + nlen + elen + clen;
      const name = rawName.replace(/\\/g, "/");
      if (name.endsWith("/")) continue; // dossier
      if (flags & 1) throw E("Archive protégée par mot de passe : non prise en charge.");
      if (method !== 0 && method !== 8) throw E(`Méthode de compression non prise en charge (${method}).`);
      const parts = name.split("/");
      if (name.startsWith("/") || /^[A-Za-z]:/.test(name) || parts.includes("..") || name.includes("\0")) throw E("Archive refusée : elle contient un chemin dangereux.");
      sum += usize;
      if (sum > MAX_TOTAL) throw E("Archive trop volumineuse une fois décompressée.");
      entries.push({ name: parts.filter((x) => x && x !== ".").join("/"), method, csize, usize, off });
    }
    return entries;
  } finally {
    await fh.close();
  }
}

async function dataStart(file, e) {
  const fh = await fs.promises.open(file, "r");
  try {
    const h = Buffer.alloc(30);
    await fh.read(h, 0, 30, e.off);
    if (h.readUInt32LE(0) !== 0x04034b50) throw E("Archive .zip endommagée.");
    return e.off + 30 + h.readUInt16LE(26) + h.readUInt16LE(28);
  } finally {
    await fh.close();
  }
}

/** Flux du contenu décompressé d'une entrée, limité à sa taille annoncée. */
async function open(file, e) {
  const start = await dataStart(file, e);
  const limit = new Transform({
    transform(chunk, _enc, cb) {
      this.n = (this.n || 0) + chunk.length;
      this.n > e.usize ? cb(E("Archive .zip incohérente.")) : cb(null, chunk);
    },
  });
  const src = fs.createReadStream(file, { start, end: start + e.csize - 1 });
  return e.method === 8 ? [src, zlib.createInflateRaw(), limit] : [src, limit];
}

async function extractTo(file, e, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (e.csize === 0 && e.usize === 0) return fs.writeFileSync(dest, "");
  await pipeline(...(await open(file, e)), fs.createWriteStream(dest));
}

async function readText(file, e, max = 1024 * 1024) {
  if (e.usize > max) throw E("Fichier de configuration trop gros.");
  if (e.usize === 0) return "";
  const chunks = [];
  await pipeline(...(await open(file, e)), async function (src) {
    for await (const c of src) chunks.push(c);
  });
  return Buffer.concat(chunks).toString("utf8");
}

module.exports = { readEntries, extractTo, readText };
