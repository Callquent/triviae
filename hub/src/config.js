const fs = require("fs");
const os = require("os");
const path = require("path");

const isWin = process.platform === "win32";

// Dossier du programme : fourni par l'exécutable, sinon déduit de l'emplacement de hub.js (…/hub/hub.js).
const ROOT = process.env.MA_ROOT || path.resolve(__dirname, "..");
// Données de l'utilisateur, hors du dossier du programme : une mise à jour ne les efface jamais.
const BASE = isWin ? process.env.APPDATA || os.homedir() : process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
const DATA = process.env.MA_DATA || path.join(BASE, "Triviae");
// Anciens noms du dossier (« MaPetiteBoite », « MesApplications ») : renommé au démarrage, données comprises.
if (!process.env.MA_DATA) {
  try {
    for (const n of ["MaPetiteBoite", "MesApplications"]) {
      const old = path.join(BASE, n);
      if (fs.existsSync(old) && !fs.existsSync(DATA)) fs.renameSync(old, DATA);
    }
  } catch {}
}

const runtimeFile = path.join(ROOT, "runtime", isWin ? "node.exe" : "node");

module.exports = {
  isWin,
  ROOT,
  DATA,
  APPS_DIR: path.join(ROOT, "apps"),
  ASSETS: path.join(ROOT, "hub", "assets"),
  WATCHDOG: path.join(ROOT, "hub", "watchdog.js"),
  LOGS: path.join(DATA, "logs"),
  // Node qui fait tourner les applications (en développement, à défaut, celui qui lance le hub).
  RUNTIME: fs.existsSync(runtimeFile) ? runtimeFile : process.execPath,
  HUB_PORT: Number(process.env.HUB_PORT) || 8080,
  EXE: process.env.MA_EXE || "",
};
