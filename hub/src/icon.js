// Logo d'une application : celui d'app.json, sinon un fichier usuel du dossier public/.
const fs = require("fs");
const path = require("path");

const ICON_NAMES = ["icon-192.png", "icon-512.png", "icon.png", "icon.svg", "icon.webp", "apple-touch-icon.png", "apple-icon.png", "logo.png", "logo.svg", "favicon.png", "favicon.svg", "favicon.ico"];

function findIcon(dir, declared) {
  const ok = (p) => {
    try {
      return fs.statSync(path.join(dir, "public", p)).isFile();
    } catch {
      return false;
    }
  };
  if (typeof declared === "string" && declared.startsWith("/") && ok(declared.slice(1))) return declared;
  const n = ICON_NAMES.find(ok);
  return n ? "/" + n : typeof declared === "string" ? declared : "";
}

module.exports = { findIcon, ICON_NAMES };
