const fs = require("fs");
const http = require("http");
const https = require("https");
const net = require("net");
const { Duplex } = require("stream");
const tls = require("./tls");
const { spawn, spawnSync } = require("child_process");
const apps = require("./apps");
const gateway = require("./gateway");
const sync = require("./sync");
const datadir = require("./datadir");
const win = require("./platform");
const { DATA, HUB_PORT, ROOT, isWin, LOGS } = require("./config");
const path = require("path");
const { lanAddresses } = require("./netinfo");

const silent = process.argv.includes("--silent");
let actualPort = HUB_PORT;
let server;
let mux;
let secure = null;

/** Même port pour http et https : le premier octet d'une connexion TLS vaut 0x16. */
function makeMux() {
  mux = net.createServer((socket) => {
    socket.on("error", () => {});
    socket.once("data", (buf) => {
      socket.pause();
      if (buf[0] === 0x16 && secure) {
        // Le TLS lit directement la prise : on lui donne un flux qui rejoue d'abord l'octet déjà lu.
        const d = new Duplex({
          read() {},
          write(chunk, enc, cb) {
            socket.write(chunk, enc, cb);
          },
          final(cb) {
            socket.end();
            cb();
          },
        });
        d.remoteAddress = socket.remoteAddress;
        d.remotePort = socket.remotePort;
        d.push(buf);
        socket.on("data", (c) => d.push(c));
        socket.on("end", () => d.push(null));
        socket.on("close", () => d.destroy());
        socket.on("error", () => d.destroy());
        d.on("close", () => socket.destroy());
        secure.emit("connection", d);
      } else {
        socket.unshift(buf);
        server.emit("connection", socket);
      }
      socket.resume();
    });
  });
}

function startSecure() {
  try {
    const c = tls.ensureServer();
    secure = https.createServer({ key: c.key, cert: c.cert });
    secure.on("secureConnection", (s) => {
      const from = s._handle && s._handle._parentWrap && s._handle._parentWrap.stream && s._handle._parentWrap.stream.remoteAddress;
      if (from && !s.remoteAddress) Object.defineProperty(s, "remoteAddress", { value: from });
    });
    for (const ev of ["request", "upgrade"]) for (const fn of server.listeners(ev)) secure.on(ev, fn);
    let known = JSON.stringify(c.hosts);
    setInterval(() => {
      try {
        const n = tls.ensureServer();
        if (JSON.stringify(n.hosts) !== known) {
          known = JSON.stringify(n.hosts);
          secure.setSecureContext({ key: n.key, cert: n.cert });
        }
      } catch {}
    }, 60000).unref();
  } catch (e) {
    secure = null;
    console.log("  HTTPS indisponible :", e.message);
  }
}

function openBrowser(url) {
  if (silent || process.env.MA_NO_BROWSER) return;
  const [cmd, args] = isWin ? ["cmd.exe", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try {
    const p = spawn(cmd, args, { windowsHide: true, detached: true, stdio: "ignore" });
    p.on("error", () => {});
    p.unref();
  } catch {}
}

/** Vrai si le port est déjà tenu par un autre « Triviae » (double-clic répété). */
function isOurHub(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/hub/ping", timeout: 1500 }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve(body === "mes-applications"));
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => (req.destroy(), resolve(false)));
  });
}

function listen(port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => reject(err);
    mux.once("error", onError);
    mux.listen(port, "0.0.0.0", () => (mux.off("error", onError), resolve()));
  });
}

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  console.log("\nArrêt de Triviae…");
  await apps.stopAll().catch(() => {});
  process.exit(0);
}

async function main() {
  // Console Windows : passe en UTF-8 pour que les accents s'affichent correctement.
  if (isWin) spawnSync("cmd.exe", ["/c", "chcp 65001 >nul"], { stdio: "inherit", windowsHide: false });
  fs.mkdirSync(DATA, { recursive: true });
  server = gateway.create({ onQuit: shutdown, getPort: () => actualPort });
  makeMux();
  startSecure();

  for (let i = 0; i < 10; i++) {
    const port = HUB_PORT + i;
    try {
      await listen(port);
      actualPort = port;
      break;
    } catch (err) {
      if (err.code !== "EADDRINUSE") throw err;
      if (await isOurHub(port)) {
        console.log("Triviae est déjà ouvert : j'affiche sa page.");
        openBrowser(`http://localhost:${port}/`);
        setTimeout(() => process.exit(0), 300);
        return;
      }
    }
  }
  if (!mux.listening) throw new Error(`Aucun port libre entre ${HUB_PORT} et ${HUB_PORT + 9}.`);

  if (!datadir.check()) console.log("\n  Dossier de données inaccessible : " + datadir.getProblem() + "\n");
  apps.scan();
  sync.startDiscovery(actualPort);

  const phone = lanAddresses()[0];
  console.log("");
  console.log("  Triviae est en marche");
  console.log(`  Sur ce PC     : http://localhost:${actualPort}`);
  console.log(`  Sur téléphone : ${phone ? `http://${phone.ip}:${actualPort}` : "(aucun réseau détecté)"}`);
  console.log("");
  console.log("  Laissez cette fenêtre ouverte. Fermez-la pour tout arrêter.");
  console.log("");

  openBrowser(`http://localhost:${actualPort}/`);

  if (win.supported) {
    win.ensureFirewall(actualPort).then((ok) => {
      if (!ok) console.log("  Pare-feu : non autorisé, le téléphone et l'autre PC ne pourront pas se connecter (voir la page d'accueil).");
    });
    win.ensureShortcut();
  }
}

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, shutdown);
// Les erreurs inattendues ne doivent pas arrêter le hub ; elles sont notées dans hub.log (dossier des journaux).
function trace(texte) {
  try {
    fs.mkdirSync(LOGS, { recursive: true });
    fs.appendFileSync(path.join(LOGS, "hub.log"), `\n--- ${new Date().toLocaleString("fr-FR")} ${texte}\n`);
  } catch {}
}
process.on("uncaughtException", (e) => (console.error("Erreur :", e), trace(`Erreur non interceptée : ${(e && e.stack) || e}`)));
process.on("unhandledRejection", (e) => (console.error("Erreur :", e), trace(`Promesse rejetée : ${(e && e.stack) || e}`)));
process.on("exit", (code) => trace(`Arrêt du hub (code ${code})`));

main().catch((err) => {
  console.error("\nImpossible de démarrer :", err.message);
  // La fenêtre reste ouverte pour que le message puisse être lu.
  setInterval(() => {}, 1 << 30);
});
