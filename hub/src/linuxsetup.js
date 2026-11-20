const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { ROOT, EXE } = require("./config");
const state = require("./state");

const HOME = os.homedir();
const APP_ENTRY = path.join(process.env.XDG_DATA_HOME || path.join(HOME, ".local", "share"), "applications", "triviae.desktop");
const AUTOSTART = path.join(process.env.XDG_CONFIG_HOME || path.join(HOME, ".config"), "autostart", "triviae.desktop");
const PRIVATE_RANGES = ["192.168.0.0/16", "10.0.0.0/8", "172.16.0.0/12"];
const DISCOVERY_PORT = 41234;

const launcher = () => EXE || process.env.MA_LAUNCHER || path.join(ROOT, "triviae.sh");

function entry(args = "") {
  const exec = `"${launcher().replace(/(["`$\\])/g, "\\$1")}"${args ? " " + args : ""}`;
  return [
    "[Desktop Entry]",
    "Type=Application",
    "Name=Triviae",
    "Comment=Vos applications sur ce PC, utilisables depuis le téléphone",
    `Exec=${exec}`,
    `Icon=${path.join(ROOT, "hub", "assets", "icon-512.png")}`,
    "Terminal=false",
    "Categories=Utility;",
    "StartupNotify=false",
    "",
  ].join("\n");
}

function write(file, content, mode = 0o755) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, { mode });
  fs.chmodSync(file, mode);
}

function desktopDir() {
  const r = spawnSync("xdg-user-dir", ["DESKTOP"], { encoding: "utf8", timeout: 3000 });
  const fromXdg = r.status === 0 ? r.stdout.trim() : "";
  for (const d of [fromXdg, path.join(HOME, "Desktop"), path.join(HOME, "Bureau")]) {
    if (d && d !== HOME && fs.existsSync(d)) return d;
  }
  return "";
}

/** Anciens noms du programme (« Mes applications », « MaPetiteBoîte ») : on retire ses lanceurs et on recrée ceux du nouveau nom. */
function migrateLegacy() {
  try {
    const dataHome = process.env.XDG_DATA_HOME || path.join(HOME, ".local", "share");
    const confHome = process.env.XDG_CONFIG_HOME || path.join(HOME, ".config");
    const NAMES = ["mes-applications.desktop", "ma-petite-boite.desktop"];
    const autos = NAMES.map((n) => path.join(confHome, "autostart", n));
    const hadAuto = autos.some((f) => fs.existsSync(f));
    const olds = [...autos];
    const desk = desktopDir();
    for (const n of NAMES) {
      olds.push(path.join(dataHome, "applications", n));
      if (desk) olds.push(path.join(desk, n));
    }
    let any = false;
    for (const f of olds) if (fs.existsSync(f)) (fs.rmSync(f, { force: true }), (any = true));
    if (hadAuto) write(AUTOSTART, entry("--silent"));
    if (any) state.update({ shortcut: false });
  } catch {}
}

/** Entrée dans le menu des applications (et sur le Bureau), créée une seule fois. */
function ensureShortcut() {
  if (!state.read().legacyTriviae) {
    migrateLegacy();
    state.update({ legacyTriviae: true });
  }
  if (state.read().shortcut) return;
  try {
    write(APP_ENTRY, entry());
    const desk = desktopDir();
    if (desk) {
      const file = path.join(desk, "triviae.desktop");
      write(file, entry());
      // Ubuntu demande sinon « Autoriser le lancement » au premier clic droit.
      spawnSync("gio", ["set", file, "metadata::trusted", "true"], { timeout: 3000 });
    }
    state.update({ shortcut: true });
  } catch {}
}

const autostartOn = () => fs.existsSync(AUTOSTART);

/** Démarrage automatique à l'ouverture de session (sans ouvrir le navigateur). */
function setAutostart(on) {
  try {
    if (on) write(AUTOSTART, entry("--silent").replace("Terminal=false\n", "Terminal=false\nX-GNOME-Autostart-enabled=true\n"));
    else fs.rmSync(AUTOSTART, { force: true });
  } catch {}
  return autostartOn();
}

/**
 * Pare-feu : sur Ubuntu, ufw est installé mais inactif par défaut (rien à faire). S'il est actif, on ouvre le port
 * de l'application et celui de la synchronisation, pour les réseaux privés seulement, après une demande de mot de passe.
 */
function ensureFirewall(port, force = false) {
  const st = state.read();
  if (!force && st.firewallV === 2 && st.firewallPort === port && st.firewall) return Promise.resolve(st.firewall === "ok");
  const record = (ok) => (state.update({ firewall: ok ? "ok" : "declined", firewallPort: port, firewallV: 2 }), ok);
  if (spawnSync("systemctl", ["is-active", "--quiet", "ufw"]).status !== 0) return Promise.resolve(record(true));

  const rules = PRIVATE_RANGES.flatMap((r) => [
    `ufw allow from ${r} to any port ${port} proto tcp comment 'Mes applications'`,
    `ufw allow from ${r} to any port ${DISCOVERY_PORT} proto udp comment 'Mes applications'`,
  ]).join(" && ");
  return new Promise((resolve) => {
    const p = spawn("pkexec", ["sh", "-c", rules], { stdio: "ignore" });
    p.on("error", () => resolve(record(false)));
    p.on("close", (code) => resolve(record(code === 0)));
  });
}

module.exports = { supported: true, ensureFirewall, ensureShortcut, autostartOn, setAutostart };
