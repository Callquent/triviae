// Importer une application Next.js ou Nuxt depuis un .zip, en deux temps :
//   1. stage()   : réception du .zip, analyse, rien n'est installé ;
//   2. confirm() : installation (remplace l'application du même identifiant, ses données ne sont pas touchées).
const fs = require("fs");
const { findIcon } = require("./icon");
const path = require("path");
const crypto = require("crypto");
const { APPS_DIR, DATA } = require("./config");
const apps = require("./apps");
const zip = require("./zip");
const builder = require("./builder");

const STAGE = path.join(DATA, "import");
const MAX_UPLOAD = 2 * 1024 ** 3;
const ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
const TTL = 60 * 60 * 1000;
/** @type {Map<string, any>} */
const pending = new Map();

const fail = (message) => Object.assign(new Error(message), { user: true });
const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

function sweep() {
  const now = Date.now();
  for (const [t, p] of pending) if (p.expires < now) (pending.delete(t), fs.rmSync(p.file, { force: true }));
  try {
    for (const f of fs.readdirSync(STAGE)) {
      const full = path.join(STAGE, f);
      if (!pending.has(f.replace(/\.zip$/, "")) && now - fs.statSync(full).mtimeMs > TTL) fs.rmSync(full, { force: true });
    }
  } catch {}
}

/** Reçoit le .zip (flux brut) dans un fichier temporaire. */
function receive(req, file) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const out = fs.createWriteStream(file);
    const abort = (e) => {
      req.unpipe(out);
      out.destroy();
      fs.rmSync(file, { force: true });
      reject(e);
    };
    req.on("data", (c) => {
      n += c.length;
      if (n > MAX_UPLOAD) abort(fail("Fichier trop volumineux (2 Go maximum). Retirez node_modules et .next/cache de l'archive."));
    });
    req.on("error", abort);
    req.on("aborted", () => abort(fail("Envoi interrompu.")));
    out.on("error", abort);
    out.on("finish", () => (n === 0 ? abort(fail("Fichier vide.")) : resolve(n)));
    req.pipe(out);
  });
}


/** Projet SOURCE (à compiler ici) : avec package.json, ou fichiers en vrac (page.tsx, layout.tsx…) à ranger. */
async function analyzeSource(file, entries, filename) {
  const depth = (s) => s.split("/").length;
  const usable = entries.filter((e) => !builder.SKIP.test(e.name));
  const pk = usable.map((e) => e.name).filter((n) => /(^|\/)package\.json$/.test(n)).sort((x, y) => depth(x) - depth(y))[0];
  let root = "";
  let loose = false;
  let framework = "next";
  let pkg = {};
  if (pk) {
    root = pk.slice(0, -"package.json".length);
    try {
      pkg = JSON.parse(await zip.readText(file, usable.find((e) => e.name === pk), 256 * 1024));
    } catch {
      throw fail("Le fichier package.json de l'archive est illisible.");
    }
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps.nuxt) framework = "nuxt";
    else if (!deps.next) throw fail("Ce projet n'utilise ni Next.js ni Nuxt (ni « next » ni « nuxt » dans package.json).");
  } else {
    if (usable.some((e) => /(^|\/)nuxt\.config\.(ts|js|mjs)$/.test(e.name))) {
      throw fail("Ce projet Nuxt n'a pas de package.json. Ajoutez-le à l'archive (avec ses dépendances, mais sans node_modules ni .output).");
    }
    const marked = usable.some((e) => /(^|\/)(page|layout)\.(tsx?|jsx?)$|(^|\/)next\.config\.(mjs|js|cjs|ts)$/.test(e.name));
    if (!marked) {
      throw fail(
        "Aucune application Next.js reconnue dans cette archive. Envoyez soit un projet Next.js (avec package.json, ou au moins page.tsx / layout.tsx), soit un projet déjà compilé (dossier .next/standalone). Voir le guide « Ajouter une application ».",
      );
    }
    loose = true;
    // dossier commun (ex. « mon-projet/ ») : on le retire
    let prefix = "";
    for (;;) {
      const firsts = new Set(usable.map((e) => e.name.slice(prefix.length).split("/")[0]));
      const only = [...firsts][0];
      if (firsts.size !== 1 || usable.every((e) => !e.name.slice(prefix.length).includes("/"))) break;
      if (["app", "src", "pages", "public", "components", "lib", "types"].includes(only)) break; // vraie structure Next.js
      prefix += only + "/";
    }
    root = prefix;
  }
  const plan = usable.filter((e) => e.name.startsWith(root)).map((e) => ({ entry: e, rel: e.name.slice(root.length) }));
  const layoutEntry = plan.filter((p) => /(^|\/)layout\.(tsx|jsx|js)$/.test(p.rel)).sort((x, y) => depth(x.rel) - depth(y.rel))[0];
  let meta = {};
  const nuxtCfg = framework === "nuxt" ? plan.find((p) => /^nuxt\.config\.(ts|js|mjs)$/.test(p.rel)) : null;
  if (nuxtCfg && nuxtCfg.entry.usize < 200_000) {
    try {
      const t = await zip.readText(file, nuxtCfg.entry, 200_000);
      meta = { title: (/\btitle:\s*(["'`])([^"'`\n]{1,80})\1/.exec(t) || [])[2] || "", description: (/\bname:\s*["']description["']\s*,\s*content:\s*(["'`])([^"'`\n]{1,200})\1/.exec(t) || [])[2] || "" };
    } catch {}
  } else if (layoutEntry && layoutEntry.entry.usize < 200_000) {
    try {
      meta = builder.metaFrom(await zip.readText(file, layoutEntry.entry, 200_000));
    } catch {}
  }
  // « 78430da6-1793784227085_candidatures.zip » (préfixe ajouté par certains envois) → « candidatures »
  const fromFile = String(filename || "").replace(/\.zip$/i, "").replace(/^[0-9a-f][0-9a-f-]{7,}_/i, "");
  const id = builder.slug(pkg.name) || builder.slug(fromFile) || "application";
  const warnings = ["Ce projet va être compilé sur ce PC : plusieurs minutes, connexion Internet nécessaire (outil de compilation et dépendances téléchargés)."];
  if (loose) warnings.push("Le projet est incomplet (pas de package.json ou de dossiers) : sa structure sera reconstruite automatiquement.");
  return {
    kind: "source",
    framework,
    loose,
    plan,
    id,
    name: clean(meta.title, 60) || clean(pkg.name, 60) || id,
    description: clean(meta.description, 200) || clean(pkg.description, 200),
    warnings,
    existing: fs.existsSync(path.join(APPS_DIR, id)),
    editableId: true,
    files: plan.length,
    megabytes: Math.round(plan.reduce((s, p) => s + p.entry.usize, 0) / 1048576),
  };
}

/** Cherche la racine de l'application dans l'archive et dit où va chaque fichier. */
async function analyze(file, entries, filename) {
  const names = new Set(entries.map((e) => e.name));
  const byName = new Map(entries.map((e) => [e.name, e]));
  const depth = (s) => s.split("/").length;

  // A. projet compilé : <racine>/.next/standalone/server.js
  const a = entries.map((e) => e.name).filter((n) => /(^|\/)\.next\/standalone\/server\.js$/.test(n)).sort((x, y) => depth(x) - depth(y))[0];
  // B. dossier prêt à l'emploi : <dossier>/server.js + app.json (ou un sous-dossier .next)
  const b = entries
    .map((e) => e.name)
    .filter((n) => /(^|\/)server\.js$/.test(n) && !n.includes("node_modules/"))
    .filter((n) => {
      const d = n.slice(0, -"server.js".length);
      return names.has(d + "app.json") || [...names].some((x) => x.startsWith(d + ".next/"));
    })
    .sort((x, y) => depth(x) - depth(y))[0];

  const plan = []; // { entry, rel }
  let layout, root, cfgName;
  if (b && b !== a && (!a || depth(b) < depth(a))) {
    layout = "pret";
    root = b.slice(0, -"server.js".length);
    for (const e of entries) if (e.name.startsWith(root)) plan.push({ entry: e, rel: e.name.slice(root.length) });
    cfgName = root + ".next/required-server-files.json";
  } else if (a) {
    layout = "compile";
    root = a.slice(0, -".next/standalone/server.js".length);
    for (const e of entries) {
      if (e.name.startsWith(root + ".next/standalone/")) plan.push({ entry: e, rel: e.name.slice((root + ".next/standalone/").length) });
      else if (e.name.startsWith(root + ".next/static/")) plan.push({ entry: e, rel: e.name.slice(root.length) });
      else if (e.name.startsWith(root + "public/")) plan.push({ entry: e, rel: e.name.slice(root.length) });
    }
    cfgName = root + ".next/standalone/.next/required-server-files.json";
  } else {
    return analyzeSource(file, entries, filename);
  }
  const kept = plan.filter((p) => p.rel && !/^data\//.test(p.rel) && !/(^|\/)\.git\//.test(p.rel));
  const rels = new Set(kept.map((p) => p.rel));
  if (!rels.has("server.js")) throw fail("server.js est introuvable dans l'application.");
  const hasStatic = kept.some((p) => p.rel.startsWith(".next/static/"));
  if (layout === "compile" && !hasStatic) throw fail("Le dossier .next/static est absent de l'archive : sans lui, les styles et les scripts de l'application ne se chargeraient pas. Ajoutez-le (il se trouve à côté de .next/standalone).");

  // app.json éventuel
  let manifest = {};
  if (rels.has("app.json")) {
    try {
      manifest = JSON.parse(await zip.readText(file, kept.find((p) => p.rel === "app.json").entry, 64 * 1024));
    } catch {
      throw fail("Le fichier app.json de l'archive est illisible.");
    }
  }
  // préfixe /apps/<id> : celui de la compilation (il est figé dans l'application)
  let basePath = typeof manifest.basePath === "string" ? manifest.basePath : "";
  if (!basePath && byName.has(cfgName)) {
    try {
      basePath = String(JSON.parse(await zip.readText(file, byName.get(cfgName))).config?.basePath ?? "");
    } catch {}
  }
  const m = /^\/apps\/([a-z0-9][a-z0-9-]{0,40})$/.exec(basePath);
  if (!m) {
    throw fail(
      basePath
        ? `Cette application a été compilée avec le préfixe « ${clean(basePath, 60)} ». Il doit être de la forme /apps/mon-identifiant. Recompilez avec BASE_PATH=/apps/mon-identifiant.`
        : "Cette application a été compilée sans préfixe. Recompilez-la avec BASE_PATH=/apps/mon-identifiant et STANDALONE=1 (voir le guide « Ajouter une application »), car le préfixe est figé à la compilation.",
    );
  }
  const id = m[1];
  const actions = (Array.isArray(manifest.actions) ? manifest.actions : [])
    .filter((x) => x && typeof x.label === "string" && typeof x.path === "string" && x.path.startsWith("/"))
    .slice(0, 6)
    .map((x) => ({ label: clean(x.label, 40), path: x.path.slice(0, 200) }));
  const warnings = [];
  if (kept.some((p) => /\.node$/i.test(p.rel))) warnings.push("L'application contient des modules natifs (.node) : ils ne fonctionnent que sur le système où elle a été compilée (Windows ou Ubuntu, pas les deux).");
  const existing = fs.existsSync(path.join(APPS_DIR, id));
  let previous = {};
  if (existing) {
    try {
      previous = JSON.parse(fs.readFileSync(path.join(APPS_DIR, id, "app.json"), "utf8"));
    } catch {}
  }
  return {
    plan: kept,
    layout,
    id,
    // mise à jour : on garde le nom, la description et l'icône déjà choisis si l'archive n'en apporte pas
    name: clean(manifest.name, 60) || clean(previous.name, 60) || id,
    description: manifest.description !== undefined ? clean(manifest.description, 200) : clean(previous.description, 200),
    icon: [manifest.icon, previous.icon].find((v) => typeof v === "string" && v.startsWith("/"))?.slice(0, 200) ?? "",
    actions: actions.length ? actions : [{ label: "Ouvrir", path: "/" }],
    sync: manifest.sync && typeof manifest.sync.path === "string" && /^\/[A-Za-z0-9/_-]+$/.test(manifest.sync.path) ? { path: manifest.sync.path } : undefined,
    warnings,
    existing,
    files: kept.length,
    megabytes: Math.round(kept.reduce((s, p) => s + p.entry.usize, 0) / 1048576),
  };
}

async function stage(req, filename) {
  fs.mkdirSync(STAGE, { recursive: true });
  sweep();
  const token = crypto.randomBytes(16).toString("hex");
  const file = path.join(STAGE, token + ".zip");
  await receive(req, file);
  try {
    const entries = await zip.readEntries(file);
    const info = await analyze(file, entries, filename);
    info.filename = filename;
    pending.set(token, { file, info, expires: Date.now() + TTL });
    const { plan, actions, sync, icon, filename: _f, ...shown } = info;
    return { ok: true, token, ...shown };
  } catch (e) {
    fs.rmSync(file, { force: true });
    throw e;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function renameRetry(from, to) {
  for (let i = 0; ; i++) {
    try {
      return fs.renameSync(from, to);
    } catch (e) {
      if (i >= 8 || !/^(EBUSY|EPERM|EACCES)$/.test(e.code)) throw e;
      await sleep(400); // Windows : le temps que l'application libère ses fichiers
    }
  }
}

/** Met le dossier préparé à la place de apps/<id> (en gardant l'ancienne version si le remplacement échoue). */
async function swapIn(id, tmp) {
  const target = path.join(APPS_DIR, id);
  const old = path.join(APPS_DIR, `.old-${id}-${crypto.randomBytes(4).toString("hex")}`);
  const replaced = fs.existsSync(target);
  if (replaced) {
    await apps.stopOne(id);
    await renameRetry(target, old);
  }
  try {
    await renameRetry(tmp, target);
  } catch (e) {
    if (replaced) fs.renameSync(old, target); // on remet l'ancienne version
    throw e;
  }
  if (replaced) fs.rm(old, { recursive: true, force: true }, () => {});
  await apps.reload(id);
  return replaced;
}

const readJson = (f) => {
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return {};
  }
};

async function confirm(token, opts = {}) {
  const p = pending.get(String(token));
  if (!p) throw fail("Cet import a expiré. Recommencez l'envoi du fichier.");
  if (p.info.kind === "source") return startBuild(String(token), p, opts);
  const info = p.info;
  const tmp = path.join(APPS_DIR, `.import-${info.id}-${crypto.randomBytes(4).toString("hex")}`);
  try {
    fs.mkdirSync(tmp, { recursive: true });
    for (const { entry, rel } of info.plan) {
      const dest = path.join(tmp, ...rel.split("/"));
      if (path.relative(tmp, dest).startsWith("..")) throw fail("Chemin dangereux dans l'archive.");
      await zip.extractTo(p.file, entry, dest);
    }
    const icon = findIcon(tmp, info.icon);
    const manifest = {
      name: clean(opts.name, 60) || info.name,
      description: opts.description === undefined ? info.description : clean(opts.description, 200),
      basePath: `/apps/${info.id}`,
      entry: "server.js",
      ...(icon ? { icon } : {}),
      actions: info.actions,
      ...(info.sync ? { sync: info.sync } : {}),
    };
    fs.writeFileSync(path.join(tmp, "app.json"), JSON.stringify(manifest, null, 2));
    const replaced = await swapIn(info.id, tmp);
    return { ok: true, id: info.id, name: manifest.name, replaced };
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw e.user ? e : fail(`L'installation a échoué (${e.code || e.message}). Rien n'a été modifié.`);
  } finally {
    pending.delete(String(token));
    fs.rmSync(p.file, { force: true });
  }
}

// ---------------------------------------------------------------------------------------------
// Projet source : compilation en tâche de fond, suivie par la page
// ---------------------------------------------------------------------------------------------
/** @type {Map<string, any>} */
const jobs = new Map();
let building = null;

function startBuild(token, p, opts) {
  if (building) throw fail("Une compilation est déjà en cours. Attendez sa fin (ou annulez-la).");
  const info = p.info;
  const id = String(opts.id || info.id).trim();
  if (!ID.test(id)) throw fail("Identifiant invalide : minuscules, chiffres et tirets seulement (ex. mes-candidatures).");
  const name = clean(opts.name, 60) || info.name;
  const description = opts.description === undefined ? info.description : clean(opts.description, 200);
  const job = builder.newJob(id);
  jobs.set(token, job);
  building = job;
  pending.delete(token); // le fichier reste jusqu'à la fin de la compilation
  (async () => {
    const work = path.join(DATA, "build", `${id}-${crypto.randomBytes(4).toString("hex")}`);
    const out = path.join(APPS_DIR, `.import-${id}-${crypto.randomBytes(4).toString("hex")}`);
    try {
      job.say("Extraction des fichiers");
      fs.mkdirSync(work, { recursive: true });
      for (const { entry, rel } of info.plan) {
        const dest = path.join(work, ...rel.split("/"));
        if (path.relative(work, dest).startsWith("..")) throw fail("Chemin dangereux dans l'archive.");
        await zip.extractTo(p.file, entry, dest);
      }
      await builder.build(job, { id, workDir: work, loose: info.loose, outDir: out });
      const framework = info.framework || "next";
      const previous = readJson(path.join(APPS_DIR, id, "app.json"));
      fs.writeFileSync(
        path.join(out, "app.json"),
        JSON.stringify(
          {
            name,
            description,
            basePath: `/apps/${id}`,
            entry: "server.js",
            ...(framework === "nuxt" ? { framework: "nuxt" } : {}),
            ...(typeof previous.icon === "string" ? { icon: previous.icon } : {}),
            actions: Array.isArray(previous.actions) && previous.actions.length ? previous.actions : [{ label: "Ouvrir", path: "/" }],
            ...(previous.sync ? { sync: previous.sync } : {}),
          },
          null,
          2,
        ),
      );
      job.say("Installation et démarrage");
      const replaced = await swapIn(id, out);
      job.result = { id, name, replaced };
      job.finished = Date.now();
      job.state = "done";
      job.say("Terminé");
    } catch (e) {
      fs.rmSync(out, { recursive: true, force: true });
      job.finished = Date.now();
      job.state = "error";
      job.error = e.cancelled ? "Compilation annulée." : e.user ? e.message : `Erreur inattendue : ${e.code || e.message}`;
      if (e.showLog) job.errorLog = job.tail.slice(-25);
      job.line("ERREUR : " + job.error);
    } finally {
      building = null;
      fs.rmSync(p.file, { force: true });
      fs.rm(work, { recursive: true, force: true }, () => {});
    }
  })();
  return { ok: true, job: true, id };
}

/** Sans jeton : la compilation en cours, ou celle qui vient de se terminer (pour reprendre l'affichage après un rechargement). */
function jobStatus(token) {
  let t = token ? String(token) : null;
  let j = t ? jobs.get(t) : null;
  if (!t) {
    for (const [k, v] of jobs) if (v.state === "running" || (v.state === "done" && Date.now() - (v.finished || 0) < 120_000)) (t = k), (j = v);
  }
  if (!j) return { ok: false, message: "Compilation inconnue." };
  return { ok: true, token: t, state: j.state, step: j.step, tail: j.tail.slice(-8), error: j.error, errorLog: j.errorLog, result: j.result };
}

function cancel(token) {
  const j = jobs.get(String(token));
  if (j && j.state === "running") {
    j.cancelled = true;
    if (j.child) builder.killTree(j.child);
    return;
  }
  const p = pending.get(String(token));
  if (p) (pending.delete(String(token)), fs.rmSync(p.file, { force: true }));
}

module.exports = { stage, confirm, cancel, jobStatus };
