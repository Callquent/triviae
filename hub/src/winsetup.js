const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { isWin, ROOT, EXE } = require("./config");
const state = require("./state");

const RULE = "Mes applications";
const startupLink = () =>
  path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "Triviae.lnk");

const quote = (s) => String(s).replace(/'/g, "''");
const encode = (script) => Buffer.from(script, "utf16le").toString("base64");

function powershell(script) {
  return spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encode(script)], {
    windowsHide: true,
    encoding: "utf8",
    timeout: 30_000,
  });
}

/** Ce que le raccourci doit lancer : l'exécutable, ou à défaut le lanceur de secours. */
const target = () => {
  if (EXE) return EXE;
  const light = path.join(ROOT, "Triviae.bat");
  return fs.existsSync(light) ? light : path.join(ROOT, "Demarrer (secours).bat");
};

function makeShortcut(where, args = "") {
  return powershell(`
$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${quote(where)}')
$s.TargetPath='${quote(target())}'
$s.Arguments='${quote(args)}'
$s.WorkingDirectory='${quote(ROOT)}'
$s.IconLocation='${quote(path.join(ROOT, "hub", "assets", "icon.ico"))}'
$s.Description='Triviae'
$s.Save()`).status === 0;
}

const ruleExists = () => spawnSync("netsh", ["advfirewall", "firewall", "show", "rule", `name=${RULE}`], { windowsHide: true }).status === 0;

/**
 * Autorise le téléphone à joindre le PC (pare-feu Windows, réseaux privés). Windows demande une
 * confirmation d'administrateur, une seule fois. Renvoie true si la règle est en place.
 */
function ensureFirewall(port, force = false) {
  if (!isWin) return Promise.resolve(true);
  const st = state.read();
  if (!force) {
    if (st.firewall === "ok" && st.firewallPort === port && st.firewallV === 2 && ruleExists()) return Promise.resolve(true);
    if (st.firewall === "declined" && st.firewallPort === port) return Promise.resolve(false);
  }
  const cmd =
    `netsh advfirewall firewall delete rule name="${RULE}" & ` +
    `netsh advfirewall firewall add rule name="${RULE}" dir=in action=allow protocol=TCP localport=${port} profile=private,domain & ` +
    // Annonce entre PC jumelés (synchronisation) : UDP 41234
    `netsh advfirewall firewall delete rule name="${RULE} (découverte)" & ` +
    `netsh advfirewall firewall add rule name="${RULE} (découverte)" dir=in action=allow protocol=UDP localport=41234 profile=private,domain`;
  const script = `Start-Process -FilePath cmd.exe -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList '/c ${quote(cmd)}'`;
  return new Promise((resolve) => {
    const p = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encode(script)], { windowsHide: true, stdio: "ignore" });
    p.on("error", () => resolve(false));
    p.on("close", () => {
      const ok = ruleExists();
      state.update({ firewall: ok ? "ok" : "declined", firewallPort: port, firewallV: 2 });
      resolve(ok);
    });
  });
}

/** Anciens noms du programme (« Mes applications », « MaPetiteBoîte ») : on retire ses raccourcis et on recrée ceux du nouveau nom. */
function migrateLegacy() {
  try {
    const startDir = path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
    let hadStartup = false;
    for (const n of ["Mes applications.lnk", "MaPetiteBoîte.lnk"]) {
      const f = path.join(startDir, n);
      if (fs.existsSync(f)) (fs.rmSync(f, { force: true }), (hadStartup = true));
    }
    if (hadStartup) makeShortcut(startupLink(), "--silent");
    const r = powershell(`$d=[Environment]::GetFolderPath('Desktop'); foreach($n in 'Mes applications.lnk','MaPetiteBoîte.lnk'){ $f=Join-Path $d $n; if(Test-Path $f){Remove-Item $f -Force; 'old'} }`);
    if (r.stdout && r.stdout.includes("old")) state.update({ shortcut: false });
  } catch {}
}

/** Raccourci « Triviae » sur le Bureau : créé une seule fois au démarrage, ou à la demande (force) depuis les Réglages. */
function ensureShortcut(force) {
  if (!isWin) return false;
  if (!state.read().legacyTriviae) {
    migrateLegacy();
    state.update({ legacyTriviae: true });
  }
  if (state.read().shortcut && !force) return true;
  const ok = powershell(`$d=[Environment]::GetFolderPath('Desktop')
$s=(New-Object -ComObject WScript.Shell).CreateShortcut("$d\\Triviae.lnk")
$s.TargetPath='${quote(target())}'
$s.WorkingDirectory='${quote(ROOT)}'
$s.IconLocation='${quote(path.join(ROOT, "hub", "assets", "icon.ico"))}'
$s.Description='Triviae'
$s.Save()`).status === 0;
  if (ok) state.update({ shortcut: true });
  return ok;
}

const autostartOn = () => isWin && fs.existsSync(startupLink());

/** Démarrage automatique avec Windows (raccourci dans le dossier Démarrage, sans ouvrir le navigateur). */
function setAutostart(on) {
  if (!isWin) return false;
  try {
    if (on) makeShortcut(startupLink(), "--silent");
    else fs.rmSync(startupLink(), { force: true });
  } catch {}
  return autostartOn();
}

module.exports = { supported: isWin, ensureFirewall, ensureShortcut, autostartOn, setAutostart };
