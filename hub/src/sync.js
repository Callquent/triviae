/**
 * Synchronisation entre deux ordinateurs (ou plus) jumelés, sur le réseau de la maison.
 *
 *  - Jumelage : un code à 8 chiffres affiché sur un PC, saisi sur l'autre. Il sert à échanger, de façon
 *    chiffrée, un secret partagé. Ensuite, chaque requête entre PC est signée (HMAC) : sans le secret,
 *    impossible de lire ou d'écrire quoi que ce soit.
 *  - Découverte : chaque PC annonce sa présence sur le réseau (UDP, signé) ; l'adresse de l'autre PC
 *    est donc retrouvée toute seule même si la box change l'adresse IP.
 *  - Échange : pour chaque application qui le déclare (app.json, "sync"), on récupère l'état de l'autre PC,
 *    on le fusionne chez nous, on lui renvoie le résultat, puis on échange les photos qui manquent.
 *    La fusion elle-même appartient à l'application (elle connaît ses données).
 *  - Les échanges ne sont pas chiffrés (http sur le réseau de la maison) mais signés et horodatés.
 */
const crypto = require("crypto");
const dgram = require("dgram");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const apps = require("./apps");
const { DATA } = require("./config");
const { lanAddresses, broadcastAddresses } = require("./netinfo");

const FILE = path.join(DATA, "sync.json");
const UDP_PORT = Number(process.env.MA_DISCOVERY_PORT) || 41234;
const SKEW_MS = 5 * 60_000;
const AUTO_EVERY_MS = 5 * 60_000;
const MAX_BODY = 64 * 1024 * 1024;
const PAIR_TTL_MS = 5 * 60_000;
const EMPTY_HASH = crypto.createHash("sha256").update("").digest("hex");

// ---------------------------------------------------------------------------------------------
// Identité et jumelages mémorisés
// ---------------------------------------------------------------------------------------------
let db = (() => {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return {};
  }
})();
if (!db.id) {
  db = { id: crypto.randomUUID(), name: os.hostname(), auto: true, peers: {}, ...db };
  save();
}
db.peers ||= {};
db.name = process.env.MA_NAME || db.name || os.hostname();

function save() {
  fs.mkdirSync(DATA, { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, FILE);
}

let myPort = 0;
const seen = new Map(); // id du PC -> { address, at } (vu récemment sur le réseau)
const nonces = new Map(); // anti-rejeu
let pairing = null; // { code, expires, attempts }
let syncing = false;

const hmac = (key, text) => crypto.createHmac("sha256", key).update(text).digest("hex");
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const same = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const cleanIp = (ip) => String(ip || "").replace(/^::ffff:/, "");

// ---------------------------------------------------------------------------------------------
// Requêtes signées entre PC
// ---------------------------------------------------------------------------------------------
function signature(secret, method, url, time, nonce, bodyHash) {
  return hmac(secret, [method, url, time, nonce, bodyHash].join("\n"));
}

/** Appelle l'autre PC. `peer` : { address: "ip:port", secret }. Renvoie { status, headers, body: Buffer }. */
function call(peer, method, url, { body, timeout = 30_000 } = {}) {
  return new Promise((resolve, reject) => {
    const [host, port] = peer.address.split(":");
    const data = body === undefined ? Buffer.alloc(0) : Buffer.isBuffer(body) ? body : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
    const time = String(Date.now());
    const nonce = crypto.randomBytes(12).toString("hex");
    const bodyHash = data.length ? sha256(data) : EMPTY_HASH;
    const req = http.request(
      {
        host,
        port: Number(port) || 80,
        method,
        path: url,
        timeout,
        headers: {
          "x-ma-id": db.id,
          "x-ma-time": time,
          "x-ma-nonce": nonce,
          "x-ma-body": bodyHash,
          "x-ma-sig": signature(peer.secret, method, url, time, nonce, bodyHash),
          "content-length": data.length,
          ...(data.length && typeof body !== "string" && !Buffer.isBuffer(body) ? { "content-type": "application/json" } : {}),
          ...(Buffer.isBuffer(body) ? { "content-type": "application/octet-stream" } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks) }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("délai dépassé")));
    req.on("error", reject);
    req.end(data);
  });
}

/**
 * Vérifie qu'une requête reçue vient bien d'un PC jumelé. `body` : corps déjà lu (Buffer).
 * Renvoie { peer } si tout est bon, sinon { error: "clock" | "denied" }.
 */
function verify(req, body) {
  const h = req.headers;
  const peer = db.peers[h["x-ma-id"]];
  const time = Number(h["x-ma-time"]);
  const nonce = String(h["x-ma-nonce"] || "");
  if (!peer || !Number.isFinite(time) || nonce.length < 16) return { error: "denied" };
  if (Math.abs(Date.now() - time) > SKEW_MS) return { error: "clock" };
  const bodyHash = body.length ? sha256(body) : EMPTY_HASH;
  if (!same(h["x-ma-body"], bodyHash)) return { error: "denied" };
  const expected = signature(peer.secret, req.method, req.url, h["x-ma-time"], nonce, bodyHash);
  if (!same(h["x-ma-sig"], expected)) return { error: "denied" };
  const key = `${peer.id}:${nonce}`;
  if (nonces.has(key)) return { error: "denied" };
  nonces.set(key, Date.now());
  for (const [k, t] of nonces) if (Date.now() - t > 2 * SKEW_MS) nonces.delete(k);
  return { peer };
}

// ---------------------------------------------------------------------------------------------
// Jumelage
// ---------------------------------------------------------------------------------------------
const deriveKey = (code, salt) => crypto.scryptSync(String(code), Buffer.from(salt, "base64"), 32);
const normalizeCode = (c) => String(c || "").replace(/\D/g, "");

/** Affiche un code sur CE PC ; l'autre PC le saisira avec l'adresse de celui-ci. */
function startPairing() {
  const code = String(crypto.randomInt(0, 100_000_000)).padStart(8, "0");
  pairing = { code, expires: Date.now() + PAIR_TTL_MS, attempts: 0 };
  return pairingInfo();
}

function cancelPairing() {
  pairing = null;
}

function pairingInfo() {
  if (pairing && pairing.expires < Date.now()) pairing = null;
  return pairing ? { code: `${pairing.code.slice(0, 4)} ${pairing.code.slice(4)}`, expiresInSec: Math.round((pairing.expires - Date.now()) / 1000) } : null;
}

/** Côté PC qui affiche le code : reçoit la demande de l'autre PC (route /hub/sync/pair, sans signature). */
function handlePairRequest(body, remoteIp) {
  const info = pairingInfo();
  if (!info) return { status: 403, json: { error: "no-pairing" } };
  let req;
  try {
    req = JSON.parse(body.toString("utf8"));
  } catch {
    return { status: 400, json: { error: "invalid" } };
  }
  if (typeof req.id !== "string" || typeof req.salt !== "string" || typeof req.proof !== "string" || req.id === db.id) {
    return { status: 400, json: { error: "invalid" } };
  }
  if (++pairing.attempts > 5) {
    pairing = null; // trop d'essais : il faut redemander un code
    return { status: 403, json: { error: "code" } };
  }
  const key = deriveKey(pairing.code, req.salt);
  if (!same(req.proof, hmac(key, `join|${req.id}|${req.salt}`))) return { status: 403, json: { error: "code" } };

  const secret = crypto.randomBytes(32).toString("base64");
  const port = Number(req.port) || 8080;
  db.peers[req.id] = { id: req.id, name: String(req.name || "Autre PC").slice(0, 60), secret, address: `${cleanIp(remoteIp)}:${port}`, auto: true };
  save();
  pairing = null; // un code ne sert qu'une fois

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify({ id: db.id, name: db.name, secret }), "utf8"), cipher.final()]);
  return { status: 200, json: { iv: iv.toString("base64"), ct: ct.toString("base64"), tag: cipher.getAuthTag().toString("base64") } };
}

/** Côté PC qui saisit le code. Renvoie le PC jumelé. */
async function joinPairing(address, code) {
  address = String(address || "").trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  if (!address) throw new Error("Saisissez l'adresse de l'autre PC.");
  if (!address.includes(":")) address += ":8080";
  const digits = normalizeCode(code);
  if (digits.length !== 8) throw new Error("Le code comporte 8 chiffres.");

  const salt = crypto.randomBytes(16).toString("base64");
  const key = deriveKey(digits, salt);
  const body = JSON.stringify({ id: db.id, name: db.name, port: myPort, salt, proof: hmac(key, `join|${db.id}|${salt}`) });
  const [host, port] = address.split(":");
  const res = await new Promise((resolve, reject) => {
    const r = http.request(
      { host, port: Number(port), method: "POST", path: "/hub/sync/pair", timeout: 10_000, headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } },
      (x) => {
        const chunks = [];
        x.on("data", (c) => chunks.push(c));
        x.on("end", () => resolve({ status: x.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    r.on("timeout", () => r.destroy(new Error("timeout")));
    r.on("error", reject);
    r.end(body);
  }).catch((e) => {
    throw new Error(`Impossible de joindre ${address} (${e.code || e.message}). Vérifiez l'adresse, que « Triviae » tourne sur l'autre PC, et son pare-feu.`);
  });
  if (res.status === 403) {
    const reason = (() => { try { return JSON.parse(res.body).error; } catch { return ""; } })();
    throw new Error(reason === "no-pairing" ? "L'autre PC n'affiche pas de code (ou il a expiré). Affichez-en un nouveau sur l'autre PC." : "Code incorrect ou expiré.");
  }
  if (res.status !== 200) throw new Error(`Réponse inattendue de l'autre PC (${res.status}).`);
  const out = JSON.parse(res.body);
  let info;
  try {
    const d = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(out.iv, "base64"));
    d.setAuthTag(Buffer.from(out.tag, "base64"));
    info = JSON.parse(Buffer.concat([d.update(Buffer.from(out.ct, "base64")), d.final()]).toString("utf8"));
  } catch {
    throw new Error("La réponse de l'autre PC est illisible.");
  }
  db.peers[info.id] = { id: info.id, name: String(info.name || "Autre PC").slice(0, 60), secret: info.secret, address, auto: true };
  save();
  return peerView(db.peers[info.id]);
}

function unpair(id) {
  delete db.peers[id];
  seen.delete(id);
  save();
}

function setAuto(on) {
  db.auto = !!on;
  save();
}

// ---------------------------------------------------------------------------------------------
// Découverte sur le réseau local
// ---------------------------------------------------------------------------------------------
let socket;

function announce() {
  if (!socket || !myPort) return;
  const targets = ["255.255.255.255", ...broadcastAddresses()];
  for (const peer of Object.values(db.peers)) {
    const t = Date.now();
    const pkt = Buffer.from(JSON.stringify({ v: 1, to: peer.id, from: db.id, port: myPort, t, sig: hmac(peer.secret, `ann|${db.id}|${myPort}|${t}`) }));
    for (const ip of targets) socket.send(pkt, UDP_PORT, ip, () => {});
  }
}

function onAnnounce(msg, rinfo) {
  let a;
  try {
    a = JSON.parse(msg.toString("utf8"));
  } catch {
    return;
  }
  if (!a || a.v !== 1 || a.to !== db.id || a.from === db.id) return;
  const peer = db.peers[a.from];
  if (!peer || Math.abs(Date.now() - Number(a.t)) > SKEW_MS) return;
  if (!same(a.sig, hmac(peer.secret, `ann|${a.from}|${a.port}|${a.t}`))) return;
  const address = `${cleanIp(rinfo.address)}:${Number(a.port)}`;
  const wasOnline = isOnline(peer);
  seen.set(peer.id, { address, at: Date.now() });
  if (peer.address !== address) {
    peer.address = address; // l'autre PC a changé d'adresse : on la retrouve toute seule
    save();
  }
  if (!wasOnline) setTimeout(() => syncPeer(peer, { auto: true }).catch(() => {}), 1500);
}

function startDiscovery(port) {
  myPort = port;
  socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
  socket.on("error", () => {}); // sans découverte, l'adresse mémorisée et la saisie manuelle restent possibles
  socket.on("message", onAnnounce);
  try {
    socket.bind(UDP_PORT, "0.0.0.0", () => {
      try {
        socket.setBroadcast(true);
      } catch {}
      announce();
    });
  } catch {}
  setInterval(announce, 15_000).unref();
  setInterval(tick, 30_000).unref();
  setTimeout(tick, 8_000).unref();
}

const isOnline = (peer) => {
  const s = seen.get(peer.id);
  return !!s && Date.now() - s.at < 50_000;
};

// ---------------------------------------------------------------------------------------------
// Échange des données
// ---------------------------------------------------------------------------------------------
const canon = (v) => (Array.isArray(v) ? `[${v.map(canon).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}` : JSON.stringify(v));
const byId = (x, y) => (x.id < y.id ? -1 : 1);
const fingerprint = (state) =>
  sha256(Buffer.from(canon(Object.fromEntries(Object.entries(state).map(([k, v]) => [k, Array.isArray(v) ? [...v].sort(byId) : v])))));

/** Appel direct à l'application locale (sans passer par la passerelle). */
function callLocal(rec, method, url, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? Buffer.alloc(0) : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
    const req = http.request(
      {
        host: "127.0.0.1",
        port: rec.port,
        method,
        path: url,
        timeout: 60_000,
        headers: { "x-sync-token": rec.syncToken, "content-length": data.length, ...(data.length ? { "content-type": Buffer.isBuffer(body) ? "application/octet-stream" : "application/json" } : {}) },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks) }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("délai dépassé")));
    req.on("error", reject);
    req.end(data);
  });
}

const json = (res, what) => {
  if (res.status !== 200) throw new Error(`${what} : réponse ${res.status}`);
  return JSON.parse(res.body.toString("utf8"));
};

async function syncApp(peer, rec) {
  const base = rec.def.basePath + rec.def.sync.path;
  const remote = json(await call(peer, "GET", `${base}/state`), "état de l'autre PC");
  const before = fingerprint(json(await callLocal(rec, "GET", `${base}/state`), "état local"));

  // 1. fusion chez nous, puis récupération des photos qui nous manquent
  const mine = json(await callLocal(rec, "POST", `${base}/merge`, remote), "fusion locale");
  let filesIn = 0;
  for (const name of mine.needFiles || []) {
    const f = await call(peer, "GET", `${base}/file/${encodeURIComponent(name)}`, { timeout: 120_000 });
    if (f.status !== 200) continue; // la photo n'existe plus chez l'autre : tant pis, la prochaine fusion nettoiera
    const put = await callLocal(rec, "PUT", `${base}/file/${encodeURIComponent(name)}`, f.body);
    if (put.status === 200) filesIn++;
  }

  // 2. envoi du résultat à l'autre PC, puis des photos qui lui manquent
  const theirs = json(await call(peer, "POST", `${base}/merge`, { body: mine.state }), "fusion chez l'autre PC");
  let filesOut = 0;
  for (const name of theirs.needFiles || []) {
    const f = await callLocal(rec, "GET", `${base}/file/${encodeURIComponent(name)}`);
    if (f.status !== 200) continue;
    const put = await call(peer, "PUT", `${base}/file/${encodeURIComponent(name)}`, { body: f.body, timeout: 120_000 });
    if (put.status === 200) filesOut++;
  }
  return {
    id: rec.def.id,
    name: rec.def.name,
    receivedData: before !== fingerprint(mine.state),
    sentData: fingerprint(remote) !== fingerprint(mine.state),
    filesIn,
    filesOut,
  };
}

/** Une synchronisation complète avec un PC jumelé. Ne lève jamais : le résultat est mémorisé. */
async function syncPeer(peer, { auto = false } = {}) {
  if (syncing) return { ok: false, message: "Une synchronisation est déjà en cours." };
  syncing = true;
  const started = Date.now();
  try {
    // L'autre PC doit prouver qui il est avant qu'on lui envoie quoi que ce soit.
    const nonce = crypto.randomBytes(16).toString("hex");
    const hello = await call(peer, "GET", `/hub/sync/hello?nonce=${nonce}`, { timeout: auto ? 4_000 : 10_000 });
    if (hello.status === 401 && /clock/.test(hello.body.toString())) throw new Error("Les horloges des deux PC diffèrent de plus de 5 minutes : réglez l'heure automatiquement sur les deux.");
    if (hello.status === 403 || hello.status === 401) throw new Error("L'autre PC ne reconnaît plus ce jumelage : retirez-le puis jumelez à nouveau.");
    const proof = json(hello, "vérification").proof;
    if (!same(proof, hmac(peer.secret, `hello|${nonce}|${peer.id}`))) throw new Error("L'autre PC n'a pas pu prouver son identité.");

    const results = [];
    for (const rec of apps.list()) {
      if (!rec.def.sync || rec.status !== "running") continue;
      try {
        results.push(await syncApp(peer, rec));
      } catch (e) {
        results.push({ id: rec.def.id, name: rec.def.name, error: e.message });
      }
    }
    const failed = results.filter((r) => r.error);
    const files = results.reduce((n, r) => n + (r.filesIn || 0) + (r.filesOut || 0), 0);
    const changed = results.some((r) => r.receivedData || r.sentData || r.filesIn || r.filesOut);
    const ok = failed.length === 0;
    const message = !ok
      ? `Erreur (${failed[0].name}) : ${failed[0].error}`
      : !results.length
        ? "Aucune application synchronisable."
        : changed
          ? `Synchronisé${files ? ` (${files} photo${files > 1 ? "s" : ""} échangée${files > 1 ? "s" : ""})` : ""}.`
          : "Déjà à jour.";
    peer.lastSync = { at: Date.now(), ok, message, ms: Date.now() - started };
    seen.set(peer.id, { address: peer.address, at: Date.now() });
    save();
    return { ok, message };
  } catch (e) {
    const unreachable = /ECONNREFUSED|EHOSTUNREACH|ETIMEDOUT|ENETUNREACH|ECONNRESET|EAI_AGAIN|délai/.test(`${e.code} ${e.message}`);
    const message = unreachable ? "L'autre PC est injoignable (éteint, hors du Wi-Fi, ou « Triviae » fermé)." : e.message;
    peer.lastSync = { at: Date.now(), ok: false, message, ms: Date.now() - started };
    save();
    return { ok: false, message };
  } finally {
    syncing = false;
  }
}

/** Passe périodique : synchronise les PC jumelés dont la dernière synchronisation date. */
function tick() {
  if (!db.auto || syncing) return;
  for (const peer of Object.values(db.peers)) {
    if (peer.auto === false) continue;
    const last = peer.lastSync?.at || 0;
    const due = Date.now() - last > AUTO_EVERY_MS;
    if (due && (isOnline(peer) || !last || !peer.lastSync?.ok)) {
      syncPeer(peer, { auto: true }).catch(() => {});
      return; // un seul à la fois
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Pour l'interface et la passerelle
// ---------------------------------------------------------------------------------------------
function peerView(p) {
  return {
    id: p.id,
    name: p.name,
    address: p.address,
    online: isOnline(p),
    lastSync: p.lastSync || null,
  };
}

function status() {
  return {
    id: db.id,
    name: db.name,
    auto: db.auto,
    syncing,
    pairing: pairingInfo(),
    peers: Object.values(db.peers).map(peerView),
  };
}

/** Réponse à /hub/sync/hello : preuve d'identité de ce PC pour le PC qui appelle. */
function helloProof(peer, nonce) {
  return { id: db.id, name: db.name, proof: hmac(peer.secret, `hello|${nonce}|${db.id}`) };
}

function now(peerId) {
  const peer = db.peers[peerId];
  if (!peer) return Promise.resolve({ ok: false, message: "PC inconnu." });
  return syncPeer(peer);
}

module.exports = {
  startDiscovery,
  status,
  startPairing,
  cancelPairing,
  handlePairRequest,
  joinPairing,
  unpair,
  setAuto,
  now,
  verify,
  helloProof,
  MAX_BODY,
};
