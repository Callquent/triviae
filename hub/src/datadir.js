/**
 * Où vivent les données des applications (plantes, photos…).
 *
 * Par défaut : un dossier propre à chaque système (Windows : %APPDATA%, Ubuntu : ~/.local/share). Avec un
 * double démarrage, Windows et Ubuntu ne se voient donc pas. En choisissant, dans CHAQUE système, le même
 * dossier sur un disque lisible par les deux, ils partagent les mêmes données. Le choix est mémorisé par
 * système (location.json dans le dossier de réglages) ; les réglages propres au système (jumelage, raccourcis)
 * ne sont pas partagés.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { DATA, isWin } = require("./config");

const LOCATION = path.join(DATA, "location.json");
const MARKER = ".mes-applications";
let problem = "";

function read() {
  try {
    const loc = JSON.parse(fs.readFileSync(LOCATION, "utf8"));
    return typeof loc.dir === "string" && loc.dir ? loc : null;
  } catch {
    return null;
  }
}

// Dossier par défaut des données (un sous-dossier par application). Ancien nom : « data », renommé au démarrage.
const DEFAULT_DIR = path.join(DATA, "Données");
const LEGACY_DIR = path.join(DATA, "data");
try {
  if (fs.existsSync(LEGACY_DIR) && !fs.existsSync(DEFAULT_DIR)) fs.renameSync(LEGACY_DIR, DEFAULT_DIR);
} catch {}

/** Dossier qui contient un sous-dossier par application. */
const current = () => (read() ? read().dir : fs.existsSync(DEFAULT_DIR) || !fs.existsSync(LEGACY_DIR) ? DEFAULT_DIR : LEGACY_DIR);
const forApp = (id) => path.join(current(), id);

const isDir = (p) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};

/** Essaie d'écrire dans le dossier. Renvoie un message d'erreur en français, ou "". */
function writeProblem(dir) {
  const probe = path.join(dir, `.ecriture-${process.pid}.tmp`);
  try {
    fs.writeFileSync(probe, "ok");
    fs.rmSync(probe, { force: true });
    return "";
  } catch (e) {
    if (e.code === "EROFS" || e.code === "EPERM" || e.code === "EACCES") {
      return `Impossible d'écrire dans ce dossier (${e.code}). Si c'est le disque Windows vu depuis Ubuntu : sous Windows, désactivez le « démarrage rapide » (Options d'alimentation), puis éteignez complètement Windows ; sinon vérifiez les droits du dossier.`;
    }
    return `Impossible d'écrire dans ce dossier (${e.code || e.message}).`;
  }
}

/**
 * Vérifie au démarrage que le dossier choisi est bien là. Il n'est JAMAIS recréé automatiquement : si le disque
 * n'est pas monté, mieux vaut ne pas démarrer que créer des données vides au mauvais endroit.
 */
function check() {
  const loc = read();
  problem = "";
  if (!loc) return true;
  if (!isDir(loc.dir)) {
    problem = `Le dossier de données « ${loc.dir} » est introuvable. Le disque est peut-être absent ou pas monté (sous Ubuntu : ouvrez le disque dans le gestionnaire de fichiers). Les applications ne démarrent pas, pour ne pas créer de données vides ailleurs.`;
    return false;
  }
  problem = writeProblem(loc.dir);
  return !problem;
}

const getProblem = () => problem;

/** Disques et dossiers proposés pour partager les données entre Windows et Ubuntu. */
function candidates() {
  const out = [];
  const name = "data";
  const OLD = ["Triviae - Données", "MaPetiteBoîte - Données", "MesApplications-donnees", "Mes applications - Données"]; // anciens noms : on garde celui qui existe déjà sur le disque
  const pick = (base) => OLD.find((o) => isDir(path.join(base, o))) || name;
  if (isWin) {
    for (let c = 65; c <= 90; c++) {
      const root = `${String.fromCharCode(c)}:\\`;
      if (isDir(root)) out.push({ label: `Disque ${root.slice(0, 2)}`, dir: root + pick(root) });
    }
  } else if (process.platform === "linux") {
    const seen = new Set();
    try {
      for (const line of fs.readFileSync("/proc/self/mounts", "utf8").split("\n")) {
        const [dev, mp0, type] = line.split(" ");
        const mp = (mp0 || "").replace(/\\040/g, " ");
        if (!/^\/(media|mnt|run\/media)\//.test(mp) || seen.has(mp)) continue;
        if (!/^(ntfs|ntfs3|fuseblk|exfat|vfat|ext[234]|btrfs|xfs)$/.test(type || "")) continue;
        seen.add(mp);
        const label = /^(ntfs|ntfs3|fuseblk)$/.test(type) ? `${path.basename(mp)} (NTFS, lisible aussi sous Windows)` : `${path.basename(mp)} (${type})`;
        out.push({ label, dir: path.join(mp, pick(mp)) });
      }
    } catch {}
  }
  return out;
}

/** Racines proposées pour parcourir : disques Windows, ou dossier personnel + disques montés sous Linux. */
function roots() {
  const out = [];
  if (isWin) {
    for (let c = 65; c <= 90; c++) {
      const root = `${String.fromCharCode(c)}:\\`;
      if (isDir(root)) out.push({ name: `Disque ${root.slice(0, 2)}`, dir: root });
    }
  } else {
    const home = require("os").homedir();
    if (home && isDir(home)) out.push({ name: "Dossier personnel", dir: home });
    for (const c of candidates()) out.push({ name: c.label, dir: path.dirname(c.dir) });
    for (const base of ["/media", "/mnt", "/run/media"]) if (isDir(base)) out.push({ name: base, dir: base });
    out.push({ name: "/ (racine)", dir: "/" });
  }
  const seen = new Set();
  return out.filter((r) => !seen.has(r.dir) && seen.add(r.dir));
}

const foreign = (dir) => (isWin ? dir.startsWith("/") && !dir.startsWith("//") : /^[A-Za-z]:[\\/]|^\\\\/.test(dir));
const HIDDEN = /^(\$Recycle\.Bin|System Volume Information|\$WinREAgent|Recovery|lost\+found)$/i;

/** Liste les sous-dossiers de `dirInput` (vide = racines). Ne montre jamais de fichiers. */
function browse(dirInput) {
  const raw = String(dirInput || "").trim();
  if (!raw) return { ok: true, dir: "", parent: null, entries: roots(), canChoose: false };
  let dir = raw.length > 3 ? raw.replace(/[\\/]+$/, "") : raw;
  if (isWin && /^[A-Za-z]:$/.test(dir)) dir += "\\";
  if (foreign(dir) || !path.isAbsolute(dir)) return { ok: false, message: "Chemin invalide pour ce système." };
  let list;
  try {
    list = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return { ok: false, message: `Impossible d'ouvrir ce dossier (${e.code || "erreur"}).` };
  }
  const entries = list
    .filter((d) => {
      if (HIDDEN.test(d.name) || (!isWin && d.name.startsWith("."))) return false;
      if (d.isDirectory()) return true;
      if (d.isSymbolicLink()) return isDir(path.join(dir, d.name));
      return false;
    })
    .map((d) => ({ name: d.name, dir: path.join(dir, d.name) }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true, sensitivity: "base" }))
    .slice(0, 500);
  const up = path.dirname(dir);
  const parent = up !== dir ? up : isWin ? "" : null; // « D:\ » remonte à la liste des disques
  return { ok: true, dir, parent, entries, canChoose: true };
}

/** Crée un sous-dossier (un seul niveau) pour que l'on puisse en préparer un dédié depuis la page. */
function makeFolder(parent, nameInput) {
  const name = String(nameInput || "").trim();
  if (!name || name.length > 100 || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /^\.+$/.test(name) || /[. ]$/.test(name)) {
    return { ok: false, message: "Nom de dossier invalide (évitez / \\ : * ? \" < > |)." };
  }
  const base = String(parent || "").trim();
  if (!base || foreign(base) || !path.isAbsolute(base) || !isDir(base)) return { ok: false, message: "Le dossier où créer n'existe pas." };
  const dir = path.join(base, name);
  try {
    fs.mkdirSync(dir);
  } catch (e) {
    if (e.code === "EEXIST" && isDir(dir)) return { ok: true, dir };
    return { ok: false, message: `Impossible de créer le dossier (${e.code || "erreur"}). Le disque est-il en lecture seule ?` };
  }
  return { ok: true, dir };
}

function info() {
  const loc = read();
  return { dir: current(), isDefault: !loc, problem, candidates: candidates(), platform: process.platform };
}

/** Copie vers `to` ce qui existe dans `from` et manque dans `to`. Ne remplace jamais rien. */
/** Copie récursive en JavaScript pur (fs.cpSync peut faire planter Node sous Windows) ; ne remplace jamais un fichier existant. */
function copyTree(src, dst, depth) {
  if (depth > 60) return;
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const n of fs.readdirSync(src)) copyTree(path.join(src, n), path.join(dst, n), depth + 1);
  } else if (st.isFile() && !fs.existsSync(dst)) {
    fs.copyFileSync(src, dst);
  }
}

function migrate(from, to) {
  const copied = [];
  const kept = [];
  if (path.resolve(from) === path.resolve(to) || !isDir(from)) return { copied, kept };
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith(".")) continue;
    const dst = path.join(to, e.name);
    const dstHasData = isDir(dst) && fs.readdirSync(dst).length > 0;
    if (dstHasData) kept.push(e.name);
    else {
      copyTree(path.join(from, e.name), dst, 0);
      copied.push(e.name);
    }
  }
  return { copied, kept };
}

/**
 * Choisit le dossier des données (null = retour au dossier par défaut du système).
 * L'appelant arrête les applications avant, et les relance après.
 */
function set(dirInput) {
  const previous = current();
  if (dirInput === null || dirInput === "") {
    fs.rmSync(LOCATION, { force: true });
    problem = "";
    return { ok: true, dir: current(), copied: [], kept: [] };
  }
  let dir = String(dirInput).trim();
  if (dir.length > 3) dir = dir.replace(/[\\/]+$/, ""); // « D:\ » et « / » restent tels quels
  if (isWin ? dir.startsWith("/") && !dir.startsWith("//") : /^[A-Za-z]:[\\/]|^\\\\/.test(dir)) {
    return { ok: false, message: `Ce chemin ne correspond pas à ce système : ${isWin ? "ici, un disque comme D:\\…" : "ici, un chemin comme /media/…"}. Chaque système a son propre chemin vers le même disque.` };
  }
  if (!path.isAbsolute(dir)) return { ok: false, message: `« ${dir} » n'est pas un chemin complet (exemple : ${isWin ? "D:\\data" : "/media/vous/Donnees/data"}).` };
  const parent = path.dirname(dir);
  if (!isDir(parent)) {
    return { ok: false, message: `Le dossier parent « ${parent} » n'existe pas. Le disque est-il branché et monté ? (Le dossier lui-même sera créé, pas ses parents.)` };
  }
  try {
    fs.mkdirSync(dir);
  } catch (e) {
    if (e.code !== "EEXIST") return { ok: false, message: `Impossible de créer « ${dir} » (${e.code || e.message}).` };
  }
  if (!isDir(dir)) return { ok: false, message: `« ${dir} » n'est pas un dossier.` };
  const w = writeProblem(dir);
  if (w) return { ok: false, message: w };

  let report;
  try {
    report = migrate(previous, dir);
  } catch (e) {
    return { ok: false, message: `La copie des données a échoué (${e.code || e.message}). Rien n'a été changé.` };
  }
  try {
    fs.writeFileSync(path.join(dir, MARKER), JSON.stringify({ app: "mes-applications", since: new Date().toISOString() }));
  } catch {}
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(LOCATION, JSON.stringify({ dir }, null, 2));
  problem = "";
  return { ok: true, dir, ...report };
}

/** Fenêtre moderne (style Explorateur : barre latérale, barre d'adresse) : IFileOpenDialog en mode « choisir un dossier ». Windows seulement. */
const MODERN_CS = `
using System;
using System.Runtime.InteropServices;
public static class FP {
  [ComImport, Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")] class FileOpenDialogRCW {}
  [ComImport, Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItem {
    void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
    void GetParent(out IShellItem ppsi);
    void GetDisplayName(uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string name);
    void GetAttributes(uint mask, out uint attrs);
    void Compare(IShellItem psi, uint hint, out int order);
  }
  [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IFileDialog {
    [PreserveSig] int Show(IntPtr parent);
    void SetFileTypes(uint c, IntPtr f);
    void SetFileTypeIndex(uint i);
    void GetFileTypeIndex(out uint i);
    void Advise(IntPtr p, out uint c);
    void Unadvise(uint c);
    void SetOptions(uint o);
    void GetOptions(out uint o);
    void SetDefaultFolder(IShellItem s);
    void SetFolder(IShellItem s);
    void GetFolder(out IShellItem s);
    void GetCurrentSelection(out IShellItem s);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string n);
    void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string n);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string t);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string t);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string t);
    void GetResult(out IShellItem s);
  }
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  public static string Pick(string title) {
    IFileDialog d = (IFileDialog)new FileOpenDialogRCW();
    uint o; d.GetOptions(out o);
    d.SetOptions(o | 0x20u | 0x40u | 0x800u); // dossiers seulement, système de fichiers, chemin existant
    d.SetTitle(title);
    d.SetOkButtonLabel("Sélectionner");
    int hr = d.Show(GetForegroundWindow());
    if (hr == unchecked((int)0x800704C7)) return null; // annulé
    if (hr != 0) Marshal.ThrowExceptionForHR(hr);
    IShellItem it; d.GetResult(out it);
    string p; it.GetDisplayName(0x80058000u, out p); // chemin du système de fichiers
    return p;
  }
}
`;
const MODERN_PS = `$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
${MODERN_CS}
'@
[Console]::Out.Write("SHOWN\n"); [Console]::Out.Flush()
$r=[FP]::Pick('Choisissez le dossier des données')
if($r -eq $null){[Console]::Out.Write("CANCEL")}else{[Console]::Out.Write("PATH:"+$r)}`;
const CLASSIC_PS = "Add-Type -AssemblyName System.Windows.Forms; [Console]::OutputEncoding=[Text.Encoding]::UTF8; $t=New-Object System.Windows.Forms.Form -Property @{TopMost=$true;ShowInTaskbar=$false;Opacity=0;StartPosition='CenterScreen'}; $t.Show(); $t.Activate(); $f=New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description='Choisissez le dossier des données'; $f.ShowNewFolderButton=$true; if($f.ShowDialog($t) -eq 'OK'){[Console]::Out.Write('PATH:'+$f.SelectedPath)} else {[Console]::Out.Write('CANCEL')}";
const psArgs = (script) => ["-NoProfile", "-NonInteractive", "-STA", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")];

/**
 * Ouvre le sélecteur de dossier natif du système.
 * Windows : fenêtre moderne (style Explorateur) d'abord ; si elle échoue ou ne s'affiche pas en 20 s, l'ancienne fenêtre « Rechercher un dossier ».
 * Linux : zenity / kdialog.
 * @returns {{ promise: Promise<{path?:string,cancelled?:boolean,unavailable?:boolean}>, cancel: Function }}
 */
function pick() {
  const { spawn } = require("child_process");
  let child = null;
  let cancelled = false;

  /** Lance un programme ; résout { out, code, error, noShow }. « SHOWN » dans la sortie = la fenêtre est apparue. */
  const run = (cmd, args, showTimeoutMs) =>
    new Promise((resolve) => {
      let out = "";
      let timer = null;
      let noShow = false;
      try {
        child = spawn(cmd, args, { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
      } catch {
        return resolve({ out: "", code: -1, error: true });
      }
      const c = child;
      if (showTimeoutMs) {
        timer = setTimeout(() => {
          if (!out.includes("SHOWN")) {
            noShow = true;
            try { c.kill(); } catch {}
          }
        }, showTimeoutMs);
      }
      c.stdout.on("data", (d) => (out += d));
      c.on("error", () => (clearTimeout(timer), resolve({ out, code: -1, error: true })));
      c.on("close", (code) => (clearTimeout(timer), resolve({ out, code, noShow })));
    });

  const promise = (async () => {
    if (process.platform === "win32") {
      const parse = (r) => {
        const m = /PATH:([^\r\n]+)/.exec(r.out);
        if (m) return { path: m[1].trim() };
        if (/CANCEL/.test(r.out)) return { cancelled: true };
        return null;
      };
      const modern = await run("powershell.exe", psArgs(MODERN_PS), 20000);
      if (cancelled) return { cancelled: true };
      const m = parse(modern);
      if (m) return m;
      // fenêtre moderne indisponible (blocage de PowerShell, Windows ancien…) : on retombe sur l'ancienne
      const classic = await run("powershell.exe", psArgs(CLASSIC_PS), 0);
      if (cancelled) return { cancelled: true };
      const c = parse(classic);
      if (c) return c;
      return classic.error || classic.code ? { unavailable: true } : { cancelled: true };
    }
    let cmd, args;
    const has = (c) => (process.env.PATH || "").split(":").some((d) => d && fs.existsSync(path.join(d, c)));
    if (has("zenity")) { cmd = "zenity"; args = ["--file-selection", "--directory", "--title=Choisissez le dossier des données"]; }
    else if (has("kdialog")) { cmd = "kdialog"; args = ["--getexistingdirectory", os.homedir(), "--title", "Choisissez le dossier des données"]; }
    else return { unavailable: true };
    if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) return { unavailable: true };
    const r = await run(cmd, args, 0);
    const v = r.out.replace(/[\r\n]+$/, "").trim();
    if (v) return { path: v };
    // 1 = annulé (zenity / kdialog)
    return r.code === 0 || r.code === 1 ? { cancelled: true } : { unavailable: true };
  })();
  return { promise, cancel: () => { cancelled = true; try { child && child.kill(); } catch {} } };
}

module.exports = { pick, check, getProblem, current, forApp, info, set, browse, makeFolder };
