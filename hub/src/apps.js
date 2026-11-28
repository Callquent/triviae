const fs = require("fs");
const net = require("net");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { APPS_DIR, LOGS, RUNTIME, WATCHDOG } = require("./config");
const sqldb = require("./sqldb");
const datadir = require("./datadir");

/** @type {Map<string, any>} */
const apps = new Map();

const ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
const MAX_LOG = 2 * 1024 * 1024;

/**
 * Application qui range ses données dans le localStorage du navigateur ? (cherché dans ses scripts compilés ;
 * l'exécution de Next.js elle-même n'en parle pas). Sert de valeur par défaut quand app.json ne dit rien.
 */
function usesLocalStorage(dir) {
  let seen = 0;
  const walk = (d, depth) => {
    let list;
    try {
      list = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const n of list) {
      const full = path.join(d, n.name);
      if (n.isDirectory()) {
        if (depth < 4 && walk(full, depth + 1)) return true;
      } else if (n.name.endsWith(".js") && ++seen < 600) {
        try {
          if (fs.readFileSync(full, "utf8").includes("localStorage")) return true;
        } catch {}
      }
    }
    return false;
  };
  return walk(path.join(dir, ".next", "static"), 0) || walk(path.join(dir, ".output", "public"), 0);
}

/** Lit apps/<id>/app.json. Un dossier sans app.json valide est ignoré. */
const TECH = [["next", "Next.js"], ["react", "React"], ["@prisma/client", "Prisma"], ["tailwindcss", "Tailwind CSS"], ["typescript", "TypeScript"]];
function pkgVersion(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).version || "";
  } catch {
    return "";
  }
}
function techInfo(dir, raw) {
  const ver = (n) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, "node_modules", ...n.split("/"), "package.json"), "utf8")).version || "";
    } catch {
      return "";
    }
  };
  const out = [];
  try {
    // applications Nuxt : versions relevées à la compilation (le serveur Nitro n'emporte pas node_modules)
    const maTech = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).maTech;
    if (Array.isArray(maTech)) for (const t of maTech) if (t && typeof t.label === "string" && typeof t.version === "string") out.push({ label: t.label.slice(0, 40), version: t.version.slice(0, 40) });
  } catch {}
  if (out.length) return finish();
  for (const [n, label] of TECH) {
    const v = ver(n);
    if (v) out.push({ label, version: v });
  }
  return finish();
  function finish() {
    let db = "";
    try {
      const s = sqldb.findSchema(dir);
      if (s) db = /provider\s*=\s*"sqlite"/i.test(fs.readFileSync(s, "utf8")) ? "SQLite" : "Base de données";
    } catch {}
    return { tech: out, db, version: String(raw.version || pkgVersion(dir) || ""), node: process.version.replace(/^v/, "") };
  }
}

const { findIcon } = require("./icon");

function readDefinition(id) {
  const dir = path.join(APPS_DIR, id);
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, "app.json"), "utf8"));
    const entry = raw.entry || "server.js";
    if (!fs.existsSync(path.join(dir, entry))) return null;
    const icon = findIcon(dir, raw.icon);
    if (icon && icon !== raw.icon) {
      try {
        fs.writeFileSync(path.join(dir, "app.json"), JSON.stringify({ ...raw, icon }, null, 2));
      } catch {}
    }
    return {
      id,
      dir,
      entry,
      name: String(raw.name || id),
      description: String(raw.description || ""),
      basePath: raw.basePath || `/apps/${id}`,
      icon,
      // « Données sur le PC » (voir lsstore.js) : explicite dans app.json ("pc" / "off"), sinon détecté
      storage: raw.storage === "pc" ? true : raw.storage === "off" ? false : usesLocalStorage(dir),
      info: techInfo(dir, raw),
      links: Array.isArray(raw.links) ? raw.links : [],
      actions: Array.isArray(raw.actions) && raw.actions.length ? raw.actions : [{ label: "Ouvrir", path: "/" }],
      // Application synchronisable entre deux PC : voir AJOUTER-UNE-APPLICATION.pdf (contrat /state, /merge, /file/<nom>).
      sync: raw.sync && typeof raw.sync.path === "string" && /^\/[A-Za-z0-9/_-]+$/.test(raw.sync.path) ? { path: raw.sync.path.replace(/\/$/, "") } : null,
    };
  } catch {
    return null;
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function canConnect(port) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: "127.0.0.1" });
    s.once("connect", () => (s.destroy(), resolve(true)));
    s.once("error", () => resolve(false));
  });
}

async function waitReady(rec, child) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline && rec.child === child && child.exitCode === null) {
    if (await canConnect(rec.port)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function start(rec) {
  if (rec.child) return;
  if (datadir.getProblem()) {
    rec.status = "stopped";
    rec.lastError = datadir.getProblem();
    return;
  }
  rec.stopping = false;
  rec.status = "starting";
  rec.port = await freePort();
  rec.syncToken = crypto.randomBytes(24).toString("hex"); // seul le hub le connaît : il ouvre les routes de synchronisation

  fs.mkdirSync(LOGS, { recursive: true });
  const logFile = path.join(LOGS, `${rec.def.id}.log`);
  try {
    if (fs.statSync(logFile).size > MAX_LOG) fs.truncateSync(logFile, 0);
  } catch {}
  const fd = fs.openSync(logFile, "a");
  fs.writeSync(fd, `\n--- ${new Date().toLocaleString("fr-FR")} : démarrage sur le port ${rec.port} ---\n`);

  const dataDir = datadir.forApp(rec.def.id);
  fs.mkdirSync(dataDir, { recursive: true });

  // Prisma + SQLite : base dans le dossier de données, tables créées / complétées avant le démarrage
  const dbEnv = {};
  const schemaFile = sqldb.findSchema(rec.def.dir);
  if (schemaFile) {
    try {
      // applications déjà installées : répare « Cannot find module '@prisma/client-<suffixe>' » (voir builder.fixHashedExternals)
      require("./builder").fixHashedExternals(rec.def.dir, rec.def.dir, (m) => fs.writeSync(fd, `[réparation] ${m}\n`));
    } catch {}
    try {
      const text = fs.readFileSync(schemaFile, "utf8");
      if (sqldb.parse(text).provider === "sqlite") {
        const dbFile = path.join(dataDir, "base.db");
        for (const m of sqldb.ensure(dbFile, text)) fs.writeSync(fd, `[base de données] ${m}\n`);
        dbEnv.DATABASE_URL = sqldb.toUrl(dbFile);
      }
    } catch (e) {
      fs.writeSync(fd, `[base de données] ERREUR : ${e.message}\n`);
      rec.lastError = `Base de données : ${e.message}`;
    }
  }

  const child = spawn(RUNTIME, ["--require", WATCHDOG, rec.def.entry], {
    cwd: rec.def.dir,
    env: {
      ...process.env,
      PORT: String(rec.port),
      HOSTNAME: "127.0.0.1", // seul le hub (et lui seul) est visible sur le réseau
      HOST: "127.0.0.1", // idem pour Nuxt / Nitro
      NITRO_HOST: "127.0.0.1",
      DATA_DIR: dataDir,
      SYNC_TOKEN: rec.syncToken,
      TRIVIAE_APP_ID: rec.def.id, // l'application lit ses liens chez Triviae : GET HUB_URL/hub/links/for/<TRIVIAE_APP_ID>
      HUB_URL: `http://127.0.0.1:${hubPort}`,
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      ...dbEnv,
    },
    stdio: ["pipe", fd, fd], // stdin en tuyau : voir watchdog.js
    windowsHide: true,
  });
  fs.closeSync(fd);
  rec.child = child;
  rec.pid = child.pid;

  child.on("error", (err) => {
    rec.lastError = err.message;
  });
  child.on("exit", (code) => {
    if (rec.child !== child) return;
    const uptime = rec.startedAt ? Date.now() - rec.startedAt : 0;
    rec.child = null;
    rec.startedAt = 0;
    if (rec.stopping) {
      rec.status = "stopped";
      return;
    }
    rec.status = "crashed";
    rec.lastError = `arrêtée (code ${code})`;
    if (uptime > 60_000) rec.restarts = 0;
    const delay = Math.min(30_000, 1000 * 2 ** rec.restarts++);
    rec.timer = setTimeout(() => start(rec).catch(() => {}), delay);
  });

  if (await waitReady(rec, child)) {
    rec.status = "running";
    rec.startedAt = Date.now();
  }
}

function stop(rec) {
  clearTimeout(rec.timer);
  rec.stopping = true;
  const child = rec.child;
  if (!child) {
    rec.status = "stopped";
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const force = setTimeout(() => child.kill("SIGKILL"), 5000);
    child.once("exit", () => (clearTimeout(force), resolve()));
    try {
      child.stdin.destroy();
    } catch {}
    child.kill();
  });
}

/** Détecte les dossiers d'apps/ pas encore connus et les démarre. Renvoie les nouveaux identifiants. */
function scan() {
  const added = [];
  let names = [];
  try {
    names = fs.readdirSync(APPS_DIR);
  } catch {}
  for (const id of names) {
    if (!ID.test(id) || apps.has(id)) continue;
    const def = readDefinition(id);
    if (!def) continue;
    const rec = { def, port: 0, syncToken: "", child: null, pid: 0, status: "stopped", restarts: 0, startedAt: 0, stopping: false, lastError: "" };
    apps.set(id, rec);
    added.push(id);
    start(rec).catch((e) => ((rec.status = "crashed"), (rec.lastError = e.message)));
  }
  return added;
}

async function restart(id) {
  const rec = apps.get(id);
  if (!rec) return false;
  await stop(rec);
  rec.restarts = 0;
  start(rec).catch(() => {});
  return true;
}

/** Arrête puis relance toutes les applications (après un changement de dossier de données). */
async function restartAll() {
  await stopAll();
  for (const rec of apps.values()) {
    rec.restarts = 0;
    start(rec).catch(() => {});
  }
}

async function stopAll() {
  await Promise.all([...apps.values()].map(stop));
}

/** Arrête une application (avant de remplacer ses fichiers). */
async function stopOne(id) {
  const rec = apps.get(id);
  if (rec) await stop(rec);
}

/** Relit apps/<id> après une installation ou une mise à jour, et la démarre. */
async function reload(id) {
  await stopOne(id);
  apps.delete(id);
  scan();
}

const get = (id) => apps.get(id);
const list = () => [...apps.values()];

let hubPort = require("./config").HUB_PORT;
function setHubPort(p) {
  hubPort = p;
}

module.exports = { setHubPort, scan, stopOne, reload, restart, restartAll, stopAll, get, list, logPath: (id) => path.join(LOGS, `${id}.log`) };
