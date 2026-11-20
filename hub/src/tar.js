// Extraction minimale d'un .tgz (format npm : ustar, avec en-têtes pax éventuels), sans dépendance.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function extractTgz(file, dest, strip = 1) {
  const buf = zlib.gunzipSync(fs.readFileSync(file));
  let pos = 0;
  let longPath = null;
  const str = (a, b) => buf.toString("utf8", a, b).replace(/\0.*$/s, "");
  while (pos + 512 <= buf.length) {
    if (buf.readUInt8(pos) === 0) break;
    const h = pos;
    let name = str(pos, pos + 100);
    const prefix = str(pos + 345, pos + 500);
    if (prefix) name = prefix + "/" + name;
    const size = parseInt(str(pos + 124, pos + 136).trim() || "0", 8);
    const type = String.fromCharCode(buf[pos + 156] || 48);
    const data = buf.subarray(pos + 512, pos + 512 + size);
    pos += 512 + Math.ceil(size / 512) * 512;
    if (type === "x") {
      const m = /\d+ path=([^\n]*)\n/.exec(data.toString("utf8"));
      if (m) longPath = m[1];
      continue;
    }
    if (type === "L") {
      longPath = data.toString("utf8").replace(/\0.*$/s, "");
      continue;
    }
    if (longPath) (name = longPath), (longPath = null);
    if (type !== "0" && type !== "\0") continue; // dossiers, liens : ignorés (npm ne s'en sert pas ici)
    const parts = name.split("/").filter((x) => x && x !== ".").slice(strip);
    if (!parts.length || parts.includes("..")) continue;
    const out = path.join(dest, ...parts);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, data, { mode: parseInt(str(h + 100, h + 108).trim() || "644", 8) & 0o111 ? 0o755 : 0o644 });
  }
}

module.exports = { extractTgz };
