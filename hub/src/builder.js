// Compile un projet Next.js SOURCE (importé en .zip) pour « Triviae » :
// reconstruction de la structure si le projet est incomplet, npm install, next build, puis assemblage.
const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { RUNTIME, DATA, LOGS } = require("./config");
const toolchain = require("./toolchain");

const SKIP = /(^|\/)(node_modules|\.next|\.git|\.vercel|\.turbo|coverage)(\/|$)|(^|\/)\.env(\..*)?$|(^|\/)\.DS_Store$|(^|\/)Thumbs\.db$/;
const CODE = /\.(tsx?|jsx?|mjs|cjs)$/;
const NEXT_FILES = /^(layout|page|loading|error|not-found|global-error|template|default)\.(tsx?|jsx?)$|^route\.(ts|js)$|^(globals?|global)\.css$|^(favicon\.ico|icon\.[a-z]+|apple-icon\.[a-z]+|opengraph-image\.[a-z]+)$/;
const KNOWN_DIRS = new Set(["app", "src", "pages", "public", "components", "lib", "types", "hooks", "utils", "styles", "data", "context", "store", "services", "config", "models", "assets", "constants"]);
const BUILTIN = new Set(require("module").builtinModules);
const VERSIONS = { next: "~16.4.3", react: "^19.0.0", "react-dom": "^19.0.0" };

const slug = (s) =>
  String(s || "")
    .replace(/^@[^/]+\//, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");

/** Nom et description lus dans `export const metadata` du layout, s'il y en a un. */
function metaFrom(text) {
  const m = /metadata[^=]*=\s*\{([\s\S]*?)\}\s*;?/.exec(text || "");
  if (!m) return {};
  const get = (k) => new RegExp(k + `\\s*:\\s*(["'\`])([^"'\`]+)\\1`).exec(m[1])?.[2];
  return { title: get("title"), description: get("description") };
}

function specifiers(text) {
  const out = new Set();
  for (const re of [/\bfrom\s*["']([^"']+)["']/g, /\bimport\s*["']([^"']+)["']/g, /\brequire\(\s*["']([^"']+)["']\s*\)/g, /\bimport\(\s*["']([^"']+)["']\s*\)/g, /@import\s+["']([^"']+)["']/g]) {
    for (const m of text.matchAll(re)) out.add(m[1]);
  }
  return [...out];
}

const pkgOf = (spec) => {
  if (spec.startsWith(".") || spec.startsWith("@/") || spec.startsWith("~/") || spec.startsWith("/") || spec.startsWith("node:")) return null;
  const parts = spec.split("/");
  const name = spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  return !name || BUILTIN.has(name) || /^[^a-z@]/.test(name) ? null : name;
};

/**
 * Projet incomplet (fichiers en vrac, sans package.json ni dossiers) : on range les fichiers où Next.js les attend,
 * d'après leur nom et leurs imports, puis on écrit package.json / tsconfig.json.
 * Renvoie la liste de ce qui a été reconstruit (affichée à l'utilisateur).
 */
function scaffold(dir, id) {
  const notes = [];
  const all = [];
  const walk = (d, rel = "") => {
    for (const n of fs.readdirSync(d, { withFileTypes: true })) {
      const r = rel ? rel + "/" + n.name : n.name;
      n.isDirectory() ? walk(path.join(d, n.name), r) : all.push(r);
    }
  };
  walk(dir);
  const text = new Map(all.filter((f) => CODE.test(f) || f.endsWith(".css")).map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")]));
  const move = (from, to) => {
    if (from === to) return;
    fs.mkdirSync(path.dirname(path.join(dir, to)), { recursive: true });
    fs.renameSync(path.join(dir, from), path.join(dir, to));
    if (text.has(from)) (text.set(to, text.get(from)), text.delete(from));
    notes.push(`${from} → ${to}`);
  };
  const hasKnown = (f) => KNOWN_DIRS.has(f.split("/")[0]) && f.includes("/");
  const rootFile = /^(next\.config\.(mjs|js|cjs|ts)|package\.json|package-lock\.json|tsconfig\.json|jsconfig\.json|postcss\.config\.[a-z]+|tailwind\.config\.[a-z]+)$/;

  // 1. Fichiers « spéciaux » de Next.js : dans app/
  let loose = all.filter((f) => !f.includes("/") && !rootFile.test(f) && !/\.(md|txt|lock)$/i.test(f) && !/^(LICENSE|\.gitignore)/.test(f));
  for (const f of loose.filter((f) => NEXT_FILES.test(f))) move(f, "app/" + f);
  loose = loose.filter((f) => !NEXT_FILES.test(f));
  const placed = () => [...text.keys()];

  // 2. Les autres : retrouvés grâce aux imports (« @/types/candidature », « ./Carte »…)
  for (let guard = 0; guard < 10 && loose.length; guard++) {
    let moved = false;
    for (const file of placed()) {
      for (const spec of specifiers(text.get(file))) {
        let target;
        if (spec.startsWith("@/")) target = spec.slice(2);
        else if (spec.startsWith("./") || spec.startsWith("../")) target = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
        else continue;
        if (!target || target.startsWith("..")) continue;
        const base = target.split("/").pop();
        const hit = loose.find((f) => f === base || f.replace(/\.[a-z0-9]+$/i, "") === base);
        if (!hit) continue;
        move(hit, target + hit.slice(base.length));
        loose = loose.filter((f) => f !== hit);
        moved = true;
      }
    }
    if (!moved) break;
  }
  for (const f of loose) move(f, "app/" + f); // reste : à côté des pages (sans effet sur le routage)

  // 3. Alias « @/ »
  const hasSrc = placed().some((f) => f.startsWith("src/"));
  all.length = 0;
  walk(dir);
  const files = [...all];
  const hasApp = files.some((f) => /^(src\/)?app\/(.*\/)?page\.(tsx?|jsx?)$/.test(f)) || files.some((f) => /^(src\/)?pages\//.test(f));
  if (!hasApp) {
    const e = new Error("Aucune page Next.js trouvée (page.tsx, page.js…) dans l'archive.");
    e.user = true;
    throw e;
  }
  const usesTs = files.some((f) => /\.tsx?$/.test(f));

  // 4. package.json
  if (!files.includes("package.json")) {
    const deps = { ...VERSIONS };
    const css = [...text.entries()].filter(([f]) => f.endsWith(".css")).map(([, t]) => t);
    for (const t of text.values()) for (const spec of specifiers(t)) {
      const n = pkgOf(spec);
      if (n && !["next", "react", "react-dom"].includes(n) && !(n in deps)) deps[n] = "latest";
    }
    const tw = css.some((t) => /@import\s+["']tailwindcss["']|@tailwind\b/.test(t));
    const dev = {};
    if (usesTs) Object.assign(dev, { typescript: "^5.6.0", "@types/node": "^22.0.0", "@types/react": "^19.0.0", "@types/react-dom": "^19.0.0" });
    if (tw) {
      Object.assign(dev, { tailwindcss: "^4.0.0", "@tailwindcss/postcss": "^4.0.0", postcss: "^8.4.0" });
      if (!files.some((f) => f.startsWith("postcss.config."))) fs.writeFileSync(path.join(dir, "postcss.config.mjs"), 'export default { plugins: { "@tailwindcss/postcss": {} } };\n');
    }
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: id, version: "0.1.0", private: true, scripts: { build: "next build", start: "next start" }, dependencies: deps, devDependencies: dev }, null, 2));
    notes.push("package.json créé (dépendances : " + Object.keys(deps).filter((d) => !(d in VERSIONS)).join(", ") + (Object.keys(deps).length > 3 ? "" : "aucune en plus de Next.js") + ")");
  }
  if (usesTs && !files.includes("tsconfig.json")) {
    fs.writeFileSync(
      path.join(dir, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: { target: "ES2017", lib: ["dom", "dom.iterable", "esnext"], allowJs: true, skipLibCheck: true, strict: false, noEmit: true, esModuleInterop: true, module: "esnext", moduleResolution: "bundler", resolveJsonModule: true, isolatedModules: true, jsx: "preserve", incremental: true, plugins: [{ name: "next" }], paths: { "@/*": [hasSrc ? "./src/*" : "./*"] } },
          include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
          exclude: ["node_modules"],
        },
        null,
        2,
      ),
    );
    notes.push("tsconfig.json créé");
  } else if (!usesTs && !files.some((f) => f === "jsconfig.json")) {
    fs.writeFileSync(path.join(dir, "jsconfig.json"), JSON.stringify({ compilerOptions: { paths: { "@/*": [hasSrc ? "./src/*" : "./*"] } } }, null, 2));
  }
  return notes;
}

/** next.config : on garde celui du projet mais on impose le préfixe /apps/<id>, la sortie autonome et on ignore les erreurs de type. */
function wrapConfig(dir) {
  const found = ["mjs", "js", "cjs", "ts"].map((e) => `next.config.${e}`).find((f) => fs.existsSync(path.join(dir, f)));
  const ts = found && found.endsWith(".ts");
  let head = "let base = {};\n";
  if (found) {
    const ext = found.split(".").pop();
    fs.renameSync(path.join(dir, found), path.join(dir, `next.config.original.${ext}`));
    head = `import * as mod from "./next.config.original${ts ? "" : "." + ext}";\nlet base = mod.default ?? mod;\nif (typeof base === "function") base = await base("phase-production-build", { defaultConfig: {} });\n`;
  }
  const body = `${head}const basePath = process.env.BASE_PATH ?? "";
export default {
  ...base,
  basePath,
  output: "standalone",
  env: { ...(base.env ?? {}), NEXT_PUBLIC_BASE_PATH: basePath },
  typescript: { ...(base.typescript ?? {}), ignoreBuildErrors: true },
  // images servies telles quelles : l'optimisation de next/image exige « sharp », module natif qui ne se charge pas toujours
  // (Windows : ERR_DLOPEN_FAILED) et inutile pour un usage chez soi
  images: { ...(base.images ?? {}), unoptimized: true },
};
`;
  fs.writeFileSync(path.join(dir, ts ? "next.config.ts" : "next.config.mjs"), body);
}

const killTree = (child) => {
  try {
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true });
    else child.kill("SIGKILL");
  } catch {}
};

/** Lance une commande, renvoie les lignes au fur et à mesure. */
function run(job, label, args, { cwd, env, minutes }) {
  return new Promise((resolve, reject) => {
    job.say(label);
    const child = spawn(RUNTIME, args, { cwd, env: { ...process.env, ...env, PATH: path.dirname(RUNTIME) + path.delimiter + (process.env.PATH || "") }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    job.child = child;
    const timer = setTimeout(() => (killTree(child), reject(Object.assign(new Error("La compilation a pris trop de temps (" + minutes + " min) et a été arrêtée."), { user: true }))), minutes * 60_000);
    const feed = (b) => String(b).split(/\r?\n/).filter(Boolean).forEach((l) => job.line(l));
    child.stdout.on("data", feed);
    child.stderr.on("data", feed);
    child.on("error", (e) => (clearTimeout(timer), reject(e)));
    child.on("exit", (code) => {
      clearTimeout(timer);
      job.child = null;
      if (job.cancelled) return reject(Object.assign(new Error("Annulé."), { user: true, cancelled: true }));
      code === 0 ? resolve() : reject(Object.assign(new Error(`${label} a échoué (code ${code}).`), { user: true, showLog: true }));
    });
  });
}

function newJob(id) {
  fs.mkdirSync(LOGS, { recursive: true });
  const logFile = path.join(LOGS, `build-${id}.log`);
  fs.writeFileSync(logFile, `--- ${new Date().toLocaleString("fr-FR")} : compilation de ${id} ---\n`);
  const job = {
    id,
    state: "running",
    step: "Préparation…",
    tail: [],
    child: null,
    cancelled: false,
    logFile,
    say(s) {
      job.step = s;
      job.line("== " + s);
    },
    line(l) {
      l = l.replace(/\x1b\[[0-9;]*m/g, "");
      if (/EnvHttpProxyAgent|--trace-warnings/.test(l)) return;
      job.tail.push(l.slice(0, 300));
      if (job.tail.length > 400) job.tail.splice(0, 100);
      try {
        fs.appendFileSync(logFile, l + "\n");
      } catch {}
    },
  };
  return job;
}

/**
 * @param job   suivi (voir newJob)
 * @param opts  { id, workDir (déjà rempli par l'extraction), loose }
 * @returns {Promise<string>} dossier de l'application assemblée (standalone + static + public)
 */
async function build(job, { id, workDir, loose, outDir }) {
  if (loose) {
    job.say("Reconstruction de la structure du projet");
    for (const n of scaffold(workDir, id)) job.line("  " + n);
  }
  if (!fs.existsSync(path.join(workDir, "package.json"))) throw Object.assign(new Error("package.json est introuvable dans le projet."), { user: true });
  const pkg = JSON.parse(fs.readFileSync(path.join(workDir, "package.json"), "utf8"));
  if (!{ ...pkg.dependencies, ...pkg.devDependencies }.next) throw Object.assign(new Error("Ce projet n'utilise pas Next.js (pas de « next » dans package.json)."), { user: true });
  // Projet TypeScript dont package.json oublie TypeScript ou ses types : Next.js refuserait de compiler.
  const tsUsed = (function has(d) {
    return fs.readdirSync(d, { withFileTypes: true }).some((n) => (n.isDirectory() ? !SKIP.test(n.name) && has(path.join(d, n.name)) : /\.tsx?$/.test(n.name)));
  })(workDir);
  if (tsUsed) {
    const have = { ...pkg.dependencies, ...pkg.devDependencies };
    const need = { typescript: "^5.6.0", "@types/node": "^22.0.0", "@types/react": "^19.0.0", "@types/react-dom": "^19.0.0" };
    const add = Object.keys(need).filter((k) => !have[k]);
    if (add.length) {
      pkg.devDependencies = { ...pkg.devDependencies, ...Object.fromEntries(add.map((k) => [k, need[k]])) };
      fs.writeFileSync(path.join(workDir, "package.json"), JSON.stringify(pkg, null, 2));
      job.line("  ajout des dépendances TypeScript manquantes : " + add.join(", "));
    }
  }
  wrapConfig(workDir);

  const npmCli = await toolchain.ensureNpm((s) => job.say(s));
  if (job.cancelled) throw Object.assign(new Error("Annulé."), { user: true, cancelled: true });
  const cache = path.join(DATA, "toolchain", "npm-cache");
  await run(job, "Installation des dépendances (quelques minutes la première fois)", [npmCli, "install", "--no-audit", "--no-fund", "--no-update-notifier", "--loglevel=error", "--cache", cache, "--include=dev"], { cwd: workDir, env: { npm_config_progress: "false" }, minutes: 20 });
  const nextBin = path.join(workDir, "node_modules", "next", "dist", "bin", "next");
  if (!fs.existsSync(nextBin)) throw Object.assign(new Error("Next.js n'a pas été installé (vérifiez package.json)."), { user: true, showLog: true });
  await run(job, "Compilation de l'application", [nextBin, "build"], { cwd: workDir, env: { BASE_PATH: `/apps/${id}`, STANDALONE: "1", NEXT_TELEMETRY_DISABLED: "1", CI: "1" }, minutes: 20 });

  const standalone = path.join(workDir, ".next", "standalone");
  if (!fs.existsSync(path.join(standalone, "server.js"))) throw Object.assign(new Error("La compilation n'a pas produit server.js (sortie autonome)."), { user: true, showLog: true });
  job.say("Assemblage de l'application");
  const out = outDir;
  fs.rmSync(out, { recursive: true, force: true });
  fs.cpSync(standalone, out, { recursive: true, dereference: true });
  fs.mkdirSync(path.join(out, ".next"), { recursive: true });
  fs.cpSync(path.join(workDir, ".next", "static"), path.join(out, ".next", "static"), { recursive: true });
  if (fs.existsSync(path.join(workDir, "public"))) fs.cpSync(path.join(workDir, "public"), path.join(out, "public"), { recursive: true });
  fs.rmSync(path.join(out, "data"), { recursive: true, force: true });
  // Prisma : le client généré (avec son moteur) et le schéma doivent accompagner l'application
  for (const rel of [path.join("node_modules", ".prisma"), path.join("node_modules", "@prisma", "client"), "prisma"]) {
    const from = path.join(workDir, rel);
    if (fs.existsSync(from)) {
      const to = path.join(out, rel);
      fs.rmSync(to, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.cpSync(from, to, { recursive: true, dereference: true });
    }
  }
  fixHashedExternals(workDir, out, (s) => job.line(s));
  // version de l'application (affichée sur l'accueil) : celle du package.json du projet
  try {
    const ver = JSON.parse(fs.readFileSync(path.join(workDir, "package.json"), "utf8")).version;
    if (ver) {
      const f = path.join(out, "package.json");
      let cur = {};
      try {
        cur = JSON.parse(fs.readFileSync(f, "utf8"));
      } catch {}
      fs.writeFileSync(f, JSON.stringify({ ...cur, version: ver }, null, 2));
    }
  } catch {}
  fs.rmSync(path.join(out, "prisma", "dev.db"), { force: true });
  fs.rmSync(path.join(out, "prisma", "dev.db-journal"), { force: true });
  return out;
}

/**
 * Turbopack (Next 16) référence certains modules externes sous un nom à suffixe, ex. « @prisma/client-2c3a283f134fdcb6 »,
 * résolu par des liens dans .next/node_modules. La sortie autonome ne les emporte pas toujours : « Cannot find module ».
 * On recopie ces alias (vraies copies, pas de lien : Windows) à côté du code compilé.
 */
function fixHashedExternals(workDir, out, say) {
  const dst = path.join(out, ".next", "node_modules");
  const src = path.join(workDir, ".next", "node_modules");
  try {
    if (fs.existsSync(src)) fs.cpSync(src, dst, { recursive: true, dereference: true, force: false, errorOnExist: false });
  } catch {}
  const found = new Set();
  const walk = (d) => {
    let ents = [];
    try {
      ents = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(c|m)?js$/.test(e.name)) {
        let t = "";
        try {
          t = fs.readFileSync(p, "utf8");
        } catch {
          continue;
        }
        for (const m of t.matchAll(/["']((?:@[\w.-]+\/)?[\w.-]+)-[0-9a-f]{16}["']/g)) found.add(m[0].slice(1, -1));
      }
    }
  };
  walk(path.join(out, ".next", "server"));
  for (const alias of found) {
    const base = alias.replace(/-[0-9a-f]{16}$/, "");
    const target = path.join(dst, ...alias.split("/"));
    if (fs.existsSync(target)) continue;
    const real = [path.join(out, "node_modules", ...base.split("/")), path.join(workDir, "node_modules", ...base.split("/"))].find((p) => fs.existsSync(p));
    if (!real) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(real, target, { recursive: true, dereference: true });
    say("  module externe : " + alias + " → " + base);
  }
}

module.exports = { build, fixHashedExternals, newJob, slug, metaFrom, killTree, SKIP, CODE, NEXT_FILES };
