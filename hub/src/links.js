// Liens entre applications : qui échange des données avec qui.
// Une application déclare ses liens de deux façons :
//   - app.json :  "links": [{ "app": "plantes", "label": "Arrosages", "direction": "in" }]   (liens fixes)
//   - route      GET /api/liens  ->  { "links": [{ "app": "plantes", "label": "…", "direction": "in" }] }   (liens choisis par l'utilisateur)
// direction : "in" = cette application reçoit des données de l'autre (défaut), "out" = elle lui en envoie, "both" = dans les deux sens.
// Une application sans identifiant du hub (ex. site extérieur) se déclare avec "name" (et "url" facultative) au lieu de "app".
const http = require("http");
const apps = require("./apps");

const ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
const text = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const DIRS = new Set(["in", "out", "both"]);

function clean(list) {
  const out = [];
  for (const l of Array.isArray(list) ? list.slice(0, 100) : []) {
    if (!l || typeof l !== "object") continue;
    const app = typeof l.app === "string" && ID.test(l.app.toLowerCase()) ? l.app.toLowerCase() : "";
    const name = text(l.name, 80);
    if (!app && !name) continue;
    out.push({ app, name: app ? "" : name, label: text(l.label, 140), direction: DIRS.has(l.direction) ? l.direction : "in" });
  }
  return out;
}

function fetchLinks(rec) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port: rec.port, path: rec.def.basePath + "/api/liens", timeout: 1500, headers: { accept: "application/json" } },
      (res) => {
        if (res.statusCode !== 200 || !String(res.headers["content-type"] || "").includes("json")) {
          res.resume();
          return resolve(null);
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => {
          body += c;
          if (body.length > 200_000) req.destroy();
        });
        res.on("end", () => {
          try {
            resolve(clean(JSON.parse(body).links));
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
  });
}

// Derniers liens connus de chaque application (utile quand elle est arrêtée).
const known = new Map();

/** Collecte les liens de toutes les applications : { nodes, edges, missing }. */
async function collect() {
  const recs = apps.list();
  const ids = new Set(recs.map((r) => r.def.id));
  const info = {};
  await Promise.all(
    recs.map(async (rec) => {
      const fixed = clean(rec.def.links);
      let dyn = null;
      let state = "none"; // none = aucune déclaration, live = lu à l'instant, last = dernière valeur connue, off = arrêtée sans valeur connue
      if (rec.status === "running") {
        dyn = await fetchLinks(rec);
        if (dyn) {
          known.set(rec.def.id, dyn);
          state = "live";
        }
      }
      if (!dyn && known.has(rec.def.id)) {
        dyn = known.get(rec.def.id);
        state = "last";
      }
      if (!dyn && rec.status !== "running") state = fixed.length ? "none" : "off";
      info[rec.def.id] = { links: [...fixed, ...(dyn || [])], state };
    }),
  );

  const edges = new Map();
  const externals = new Map();
  const missing = new Set();
  const add = (owner, l) => {
    let other = l.app;
    if (!other) {
      other = "ext:" + l.name;
      externals.set(other, l.name);
    } else if (!ids.has(other)) missing.add(other);
    const [from, to] = l.direction === "out" ? [owner, other] : l.direction === "both" ? [owner, other] : [other, owner];
    const both = l.direction === "both";
    const key = both ? [from, to].sort().join(">>") : from + ">" + to;
    const e = edges.get(key) || { from, to, both, labels: [] };
    if (l.label && !e.labels.includes(l.label)) e.labels.push(l.label);
    edges.set(key, e);
  };
  for (const [id, v] of Object.entries(info)) for (const l of v.links) add(id, l);

  const nodes = recs.map((r) => ({ id: r.def.id, name: r.def.name, status: r.status, state: info[r.def.id].state, icon: r.def.icon, basePath: r.def.basePath }));
  for (const m of missing) nodes.push({ id: m, name: m, status: "missing", state: "none", icon: "", basePath: "" });
  for (const [id, name] of externals) nodes.push({ id, name, status: "external", state: "none", icon: "", basePath: "" });
  return { nodes, edges: [...edges.values()], missing: [...missing] };
}

module.exports = { collect, clean };
