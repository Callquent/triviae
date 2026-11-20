// HTTPS sur le réseau local : une petite autorité (CA) propre à ce PC signe un certificat pour les adresses du PC.
// Le téléphone installe le certificat de l'autorité une seule fois ; le navigateur accepte alors https://<adresse du PC>
// et autorise le « service worker » qui garde la copie hors ligne (impossible en simple http).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const forge = require("node-forge");
const { DATA } = require("./config");
const { lanAddresses } = require("./netinfo");

const DIR = path.join(DATA, "tls");
const f = (n) => path.join(DIR, n);
const DAY = 86400000;

const keyPem = () => crypto.generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const serial = () => "01" + crypto.randomBytes(15).toString("hex");

function readOk(name) {
  try {
    return fs.readFileSync(f(name), "utf8");
  } catch {
    return "";
  }
}

function ensureCA() {
  let cert = readOk("ca.crt"), key = readOk("ca.key");
  if (cert && key) {
    try {
      if (forge.pki.certificateFromPem(cert).validity.notAfter.getTime() > Date.now() + 30 * DAY) return { cert, key };
    } catch {}
  }
  const kp = keyPem();
  const c = forge.pki.createCertificate();
  c.publicKey = forge.pki.publicKeyFromPem(kp.publicKey);
  c.serialNumber = serial();
  c.validity.notBefore = new Date(Date.now() - DAY);
  c.validity.notAfter = new Date(Date.now() + 3650 * DAY);
  const name = [{ name: "commonName", value: "Triviae (ce PC)" }, { name: "organizationName", value: "Triviae" }];
  c.setSubject(name);
  c.setIssuer(name);
  c.setExtensions([
    { name: "basicConstraints", cA: true, critical: true },
    { name: "keyUsage", keyCertSign: true, cRLSign: true, critical: true },
  ]);
  c.sign(forge.pki.privateKeyFromPem(kp.privateKey), forge.md.sha256.create());
  fs.mkdirSync(DIR, { recursive: true });
  cert = forge.pki.certificateToPem(c);
  fs.writeFileSync(f("ca.key"), kp.privateKey, { mode: 0o600 });
  fs.writeFileSync(f("ca.crt"), cert);
  // l'ancien certificat du serveur n'est plus signé par cette autorité
  fs.rmSync(f("server.crt"), { force: true });
  return { cert, key: kp.privateKey };
}

const hosts = () => ["127.0.0.1", ...lanAddresses().map((a) => a.ip)].filter((v, i, a) => a.indexOf(v) === i).sort();

/** Certificat du serveur valable pour les adresses actuelles du PC (recréé si elles changent). */
function ensureServer() {
  const ca = ensureCA();
  const want = hosts();
  let meta = {};
  try {
    meta = JSON.parse(readOk("server.json") || "{}");
  } catch {}
  const crt = readOk("server.crt"), key = readOk("server.key");
  if (crt && key && JSON.stringify(meta.hosts) === JSON.stringify(want) && meta.until > Date.now() + 30 * DAY) return { cert: crt, key, hosts: want, until: meta.until };

  const kp = key && !crt ? { privateKey: key, publicKey: crypto.createPublicKey(key).export({ type: "spki", format: "pem" }) } : keyPem();
  const c = forge.pki.createCertificate();
  c.publicKey = forge.pki.publicKeyFromPem(kp.publicKey);
  c.serialNumber = serial();
  c.validity.notBefore = new Date(Date.now() - DAY);
  const until = Date.now() + 390 * DAY; // les navigateurs refusent plus de 398 jours
  c.validity.notAfter = new Date(until);
  c.setSubject([{ name: "commonName", value: "Triviae" }]);
  c.setIssuer(forge.pki.certificateFromPem(ca.cert).subject.attributes);
  c.setExtensions([
    { name: "basicConstraints", cA: false },
    { name: "keyUsage", digitalSignature: true, keyEncipherment: true, critical: true },
    { name: "extKeyUsage", serverAuth: true },
    { name: "subjectAltName", altNames: [{ type: 2, value: "localhost" }, ...want.map((ip) => ({ type: 7, ip }))] },
  ]);
  c.sign(forge.pki.privateKeyFromPem(ca.key), forge.md.sha256.create());
  const cert = forge.pki.certificateToPem(c);
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(f("server.key"), kp.privateKey, { mode: 0o600 });
  fs.writeFileSync(f("server.crt"), cert);
  fs.writeFileSync(f("server.json"), JSON.stringify({ hosts: want, until }));
  return { cert, key: kp.privateKey, hosts: want, until };
}

/** Certificat de l'autorité au format DER (.crt), celui que le téléphone installe. */
function caDer() {
  const { cert } = ensureCA();
  return Buffer.from(forge.pki.pemToDer(cert).getBytes(), "binary");
}

const info = () => {
  try {
    const s = ensureServer();
    return { ok: true, hosts: s.hosts, until: s.until };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
};

module.exports = { ensureServer, caDer, info };
