// Liens choisis dans Triviae (page « Liens ») : « l'application X reçoit <ce flux> de l'application Y ».
// Les applications (agenda, budget…) ne gardent plus leurs liaisons : elles les lisent ici par GET /hub/links/for/<leur identifiant>.
const fs = require("fs");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { DATA } = require("./config");
const apps = require("./apps");

const FILE = path.join(DATA, "liens.json");

/** Flux connus : chemin demandé à l'application qui fournit, et texte affiché. */
const FEEDS = {
  agenda: { path: "/api/agenda", label: "Dates affichées dans l'agenda", title: "des dates (agenda)" },
  budget: { path: "/api/budget", label: "Factures ajoutées au budget", title: "des factures (budget)" },
  frigo: { path: "/api/frigo", label: "Contenu du frigo", title: "le contenu du frigo" },
};
const COLORS = ["#3b82f6", "#3f8f5a", "#c47a2c", "#c2417b", "#7c5cd6", "#0e8f9c", "#dc2f3c", "#667085"];
const ID = /^[a-z0-9][a-z0-9-]{0,40}$/;

function read() {
  try {
    const j = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return Array.isArray(j.links) ? j.links.filter((l) => l && ID.test(l.consumer || "") && ID.test(l.provider || "")) : [];
  } catch {
    return [];
  }
}
/** Vrai dès que les liens sont gérés dans Triviae (lien ajouté/retiré, ou anciens liens repris/ignorés). */
function managed() {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8")).managed === true;
  } catch {
    return false;
  }
}
function setManaged() {
  if (!managed()) write(read(), true);
}
function write(links, mg) {
  fs.mkdirSync(DATA, { recursive: true });
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify({ managed: mg === undefined ? managed() || true : mg, links }, null, 2));
  fs.renameSync(tmp, FILE);
}

const fail = (m) => Object.assign(new Error(m), { user: true });

function list() {
  const byId = Object.fromEntries(apps.list().map((r) => [r.def.id, r.def.name]));
  return read().map((l) => ({ ...l, consumerName: byId[l.consumer] || l.consumer, providerName: byId[l.provider] || l.provider }));
}

function add(input) {
  const consumer = String(input.consumer || "").toLowerCase();
  const provider = String(input.provider || "").toLowerCase();
  const ids = new Set(apps.list().map((r) => r.def.id));
  if (!ids.has(consumer) || !ids.has(provider)) throw fail("Choisissez deux applications installées.");
  if (consumer === provider) throw fail("Une application ne peut pas être liée à elle-même.");
  let feed = String(input.feed || "");
  let feedPath;
  let label;
  if (FEEDS[feed]) {
    feedPath = FEEDS[feed].path;
    label = FEEDS[feed].label;
  } else {
    feed = "custom";
    feedPath = String(input.path || "").trim();
    if (!/^\/[A-Za-z0-9_\-./]{1,100}$/.test(feedPath) || feedPath.includes("..")) throw fail("Chemin du flux invalide (exemple : /api/agenda).");
    label = String(input.label || "").trim().slice(0, 140) || "Données";
  }
  const links = read();
  if (links.some((l) => l.consumer === consumer && l.provider === provider && l.path === feedPath)) throw fail("Ce lien existe déjà.");
  const color = COLORS.includes(input.color) ? input.color : COLORS[links.filter((l) => l.consumer === consumer).length % COLORS.length];
  const link = { id: crypto.randomBytes(5).toString("hex"), consumer, provider, feed, path: feedPath, label, color, createdAt: new Date().toISOString() };
  links.push(link);
  write(links);
  return link;
}

function remove(id) {
  const links = read();
  const next = links.filter((l) => l.id !== id);
  if (next.length === links.length) return false;
  write(next);
  return true;
}

/** Liens d'une application qui reçoit des données : c'est ce que lit l'application (agenda, budget…). */
function forConsumer(consumer) {
  const byId = Object.fromEntries(apps.list().map((r) => [r.def.id, r.def]));
  return read()
    .filter((l) => l.consumer === consumer && byId[l.provider])
    .map((l) => ({ id: l.id, provider: l.provider, name: byId[l.provider].name, feed: l.feed, path: l.path, label: l.label, color: l.color }));
}

/** Arêtes pour le schéma : le fournisseur envoie, le receveur reçoit. */
function edges() {
  return read().map((l) => ({ from: l.provider, to: l.consumer, label: l.label }));
}

// --- Quelles applications fournissent quel flux ? (on interroge /api/agenda, /api/budget… sur chaque application en marche)
let probeCache = { at: 0, value: null };
function probeOne(rec, feedPath) {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port: rec.port, path: rec.def.basePath + feedPath, timeout: 1200, headers: { accept: "application/json" } }, (res) => {
      res.resume();
      const json = String(res.headers["content-type"] || "").includes("json");
      // 200 : doit répondre en JSON ; 400 / 401 / 403 : la route existe mais veut des paramètres
      resolve((res.statusCode === 200 && json) || [400, 401, 403].includes(res.statusCode));
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(false));
  });
}
/** { agenda: Set(ids), budget: Set(ids) } des applications en marche qui répondent à ce flux. */
async function providers() {
  if (probeCache.value && Date.now() - probeCache.at < 20_000) return probeCache.value;
  const out = {};
  const running = apps.list().filter((r) => r.status === "running");
  await Promise.all(
    Object.keys(FEEDS).map(async (k) => {
      out[k] = new Set();
      await Promise.all(running.map(async (r) => ((await probeOne(r, FEEDS[k].path)) ? out[k].add(r.def.id) : null)));
    }),
  );
  probeCache = { at: Date.now(), value: out };
  return out;
}

/**
 * Reprend les liens que les applications déclarent encore elles-mêmes (anciennes versions) :
 * pour chaque lien « fournisseur -> receveur » connu du schéma, on devine le flux en interrogeant le fournisseur.
 */
async function importDeclared(edgesList) {
  setManaged();
  const prov = await providers();
  const ids = new Set(apps.list().map((r) => r.def.id));
  let n = 0;
  for (const e of edgesList) {
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    const feed = Object.keys(FEEDS).find((k) => prov[k] && prov[k].has(e.from));
    if (!feed) continue;
    try {
      add({ consumer: e.to, provider: e.from, feed });
      n++;
    } catch {}
  }
  return n;
}

module.exports = { managed, setManaged, FEEDS, COLORS, list, add, remove, forConsumer, edges, providers, importDeclared };
