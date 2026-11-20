// L'outil de compilation (npm) n'est pas livré avec la plateforme : il est téléchargé une seule fois,
// depuis le registre officiel npm, et vérifié par son empreinte SHA-512 (figée ici).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DATA } = require("./config");
const { extractTgz } = require("./tar");

const VERSION = "10.9.4";
const URL_TGZ = `https://registry.npmjs.org/npm/-/npm-${VERSION}.tgz`;
const INTEGRITY = "sha512-OnUG836FwboQIbqtefDNlyR0gTHzIfwRfE3DuiNewBvnMnWEpB0VEXwBlFVgqpNzIgYo/MHh3d2Hel/pszapAA==";
const DIR = path.join(DATA, "toolchain", `npm-${VERSION}`);
const CLI = path.join(DIR, "bin", "npm-cli.js");

const ready = () => fs.existsSync(CLI);

async function ensureNpm(log) {
  if (ready()) return CLI;
  log("Téléchargement de l'outil de compilation (npm, une seule fois)…");
  let res;
  try {
    res = await fetch(URL_TGZ, { signal: AbortSignal.timeout(120_000) });
  } catch (e) {
    throw Object.assign(new Error("Impossible de télécharger l'outil de compilation : ce PC est-il connecté à Internet ?"), { user: true });
  }
  if (!res.ok) throw Object.assign(new Error(`Téléchargement de l'outil de compilation refusé (${res.status}).`), { user: true });
  const data = Buffer.from(await res.arrayBuffer());
  const got = "sha512-" + crypto.createHash("sha512").update(data).digest("base64");
  if (got !== INTEGRITY) throw Object.assign(new Error("Outil de compilation téléchargé mais son empreinte ne correspond pas : arrêt par sécurité."), { user: true });
  const tmp = DIR + ".tmp";
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  const tgz = path.join(tmp, "npm.tgz");
  fs.writeFileSync(tgz, data);
  extractTgz(tgz, path.join(tmp, "pkg"));
  fs.renameSync(path.join(tmp, "pkg"), DIR);
  fs.rmSync(tmp, { recursive: true, force: true });
  return CLI;
}

module.exports = { ensureNpm, ready, VERSION };
