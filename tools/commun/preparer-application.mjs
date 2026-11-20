// Prépare une application Next.js déjà compilée pour « Triviae ».
//
//   node outils/preparer-application.mjs <dossier-du-projet> <identifiant> [--nom "Mon app"] [--description "..."]
//
// Avant : compiler le projet avec BASE_PATH=/apps/<identifiant> et STANDALONE=1 (voir AJOUTER-UNE-APPLICATION.pdf).
// Après : le dossier apps/<identifiant> est prêt ; sur la page d'accueil, « Chercher de nouvelles applications ».
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const [project, id] = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));

const fail = (msg) => (console.error("\n" + msg + "\n"), process.exit(1));
if (!project || !id) fail('Usage : node outils/preparer-application.mjs <dossier-du-projet> <identifiant> [--nom "Mon app"]');
if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(id)) fail("L'identifiant ne peut contenir que des minuscules, chiffres et tirets (ex. budget, mes-recettes).");

const src = resolve(project);
const standalone = join(src, ".next", "standalone");
if (!existsSync(join(standalone, "server.js"))) {
  fail(
    `Projet non compilé en mode autonome : ${join(standalone, "server.js")} est introuvable.\n` +
      `Compilez d'abord (PowerShell) :\n  $env:BASE_PATH="/apps/${id}"; $env:STANDALONE="1"; npx next build`,
  );
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(flag("--sortie") ?? join(root, "apps", id));
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(standalone, out, { recursive: true });
cpSync(join(src, ".next", "static"), join(out, ".next", "static"), { recursive: true });
if (existsSync(join(src, "public"))) cpSync(join(src, "public"), join(out, "public"), { recursive: true });
rmSync(join(out, "data"), { recursive: true, force: true }); // les données vivent hors du programme

// logo : fichier usuel de public/ (icon-192.png…), écrit dans app.json
const ICONS = ["icon-192.png", "icon-512.png", "icon.png", "icon.svg", "icon.webp", "apple-touch-icon.png", "apple-icon.png", "logo.png", "logo.svg", "favicon.png", "favicon.svg", "favicon.ico"];
const logo = ICONS.find((n) => existsSync(join(out, "public", n)));
const manifest = join(out, "app.json");
writeFileSync(
  manifest,
  JSON.stringify(
    {
      name: flag("--nom") ?? id,
      description: flag("--description") ?? "",
      basePath: `/apps/${id}`,
      entry: "server.js",
      ...(logo ? { icon: "/" + logo } : {}),
      actions: [{ label: "Ouvrir", path: "/" }],
    },
    null,
    2,
  ),
);
console.log(`\nApplication prête : ${out}\nModifiez app.json pour le nom, la description, l'icône et les boutons.\nPuis, sur la page d'accueil : « Chercher de nouvelles applications ».\n`);
