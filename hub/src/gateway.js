const fs = require("fs");
const zlib = require("zlib");
const http = require("http");
const path = require("path");
const QRCode = require("qrcode");
const apps = require("./apps");
const pages = require("./pages");
const state = require("./state");
const win = require("./platform");
const sync = require("./sync");
const datadir = require("./datadir");
const importer = require("./importer");
const lsstore = require("./lsstore");
const tls = require("./tls");
const links = require("./links");
const linkstore = require("./linkstore");
const SW = require("./sw");
const { ASSETS, APPS_DIR, LOGS } = require("./config");
const { lanAddresses } = require("./netinfo");

const isLoopback = (req) => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress || "");

/**
 * Une page web quelconque ouverte dans le navigateur du PC ne doit pas pouvoir commander le hub :
 * l'en-tête Origin (s'il existe) doit être celui du hub, et l'adresse utilisée doit être une adresse IP ou « localhost »
 * (ce qui écarte aussi les attaques par « DNS rebinding »).
 */
function sameOrigin(req) {
  const host = String(req.headers.host || "");
  const name = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  if (!(name === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(name) || name.includes(":"))) return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
const send = (res, code, type, body, headers = {}) => {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store", ...headers });
  res.end(body);
};
const html = (res, body, code = 200) => send(res, code, "text/html; charset=utf-8", body);
const json = (res, obj, code = 200) => send(res, code, "application/json", JSON.stringify(obj));

function appFor(url) {
  const m = /^\/apps\/([a-z0-9-]+)(?=[/?#]|$)/.exec(url);
  return m ? apps.get(m[1]) : undefined;
}

/** Lit tout le corps d'une requête (avec une limite). */
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("trop gros"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/**
 * Routes de synchronisation d'une application (ex. /apps/plantes/api/sync/...) : réservées à un PC jumelé.
 * La requête doit être signée avec le secret du jumelage ; le hub ajoute alors le jeton interne de l'application.
 */
async function syncProxy(req, res, rec) {
  if (rec.status !== "running") return html(res, pages.waiting(rec), 503);
  let body;
  try {
    body = await readBody(req, sync.MAX_BODY);
  } catch {
    return send(res, 413, "text/plain", "Trop volumineux");
  }
  const check = sync.verify(req, body);
  if (check.error) return send(res, 401, "text/plain", check.error);
  const upstream = http.request(
    {
      host: "127.0.0.1",
      port: rec.port,
      method: req.method,
      path: req.url,
      headers: { "content-type": req.headers["content-type"] || "application/json", "content-length": body.length, "x-sync-token": rec.syncToken },
    },
    (up) => {
      res.writeHead(up.statusCode || 502, { "content-type": up.headers["content-type"] || "application/octet-stream", "cache-control": "no-store" });
      up.pipe(res);
    },
  );
  upstream.on("error", () => (res.headersSent ? res.destroy() : send(res, 502, "text/plain", "Application injoignable")));
  upstream.end(body);
}

/** « Données sur le PC » actif pour cette application ? (réglage de la page Réglages, sinon app.json / détection) */
function storageOn(rec) {
  const o = (state.read().storage || {})[rec.def.id];
  return typeof o === "boolean" ? o : !!rec.def.storage;
}

// Beaucoup d'applications appellent fetch("/api/...") sans tenir compte de leur sous-dossier /apps/<id> : le navigateur
// interrogerait alors la racine du hub (404). Ce petit script ajoute le préfixe aux requêtes vers le même site.
function pathShim(basePath) {
  const B = JSON.stringify(basePath);
  return `(function(){var B=${B},O=location.origin;function fix(u){if(typeof u!=="string")return u;if(u.indexOf(O+"/")===0)u=u.slice(O.length);if(u.charAt(0)==="/"&&u.charAt(1)!=="/"&&u!==B&&u.indexOf(B+"/")!==0&&u.indexOf(B+"?")!==0&&u.indexOf(B+"#")!==0)return B+u;return u}
var f=window.fetch;if(f)window.fetch=function(i,o){try{if(typeof i==="string")i=fix(i);else if(typeof Request!=="undefined"&&i instanceof Request){var l=new URL(i.url);if(l.origin===O){var a=l.pathname+l.search,b=fix(a);if(a!==b)i=new Request(O+b,i)}}}catch(e){}return f.call(this,i,o)};
var x=window.XMLHttpRequest&&XMLHttpRequest.prototype.open;if(x)XMLHttpRequest.prototype.open=function(m,u){try{arguments[1]=fix(typeof u==="string"?u:String(u))}catch(e){}return x.apply(this,arguments)}})();`;
}

// Petit onglet discret, sur le bord de l'écran, pour revenir à la liste des applications. Il se déplace en hhauteur
// (glisser) pour ne jamais gêner, et sa position est mémorisée. Il est dans un « shadow DOM » : aucun conflit de style.
function backTab() {
  return `(function(){if(window.top!==window||window.__maBack)return;window.__maBack=1;var K="ma-back-y",KS="ma-back-side",H=56,host;
function y0(){try{var v=parseFloat(localStorage.getItem(K));if(v>=0&&v<=1)return v}catch(e){}return .72}
function s0(){try{return localStorage.getItem(KS)==="r"?"r":"l"}catch(e){return"l"}}
function mk(){if(host&&host.isConnected&&host.ownerDocument===document)return;if(!document.documentElement)return;host=document.createElement("div");host.setAttribute("data-ma-back","");host.style.cssText="all:initial;position:fixed;left:0;top:0;width:0;height:0;z-index:2147483000";
var r=host.attachShadow({mode:"open"});r.innerHTML='<style>a{position:fixed;top:0;display:flex;align-items:center;gap:9px;height:56px;width:34px;box-sizing:border-box;background:#1f5fa8;color:#fff;text-decoration:none;font:600 14px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;white-space:nowrap;overflow:hidden;cursor:grab;touch-action:none;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;box-shadow:0 2px 12px rgba(0,0,0,.35),inset 0 0 0 1px rgba(255,255,255,.45);opacity:.55;transition:width .2s ease,opacity .2s ease}a.l{left:env(safe-area-inset-left,0px);border-radius:0 16px 16px 0;padding:0 0 0 8px}a.r{right:env(safe-area-inset-right,0px);border-radius:16px 0 0 16px;padding:0 8px 0 0;flex-direction:row-reverse}a:hover,a:focus-visible,a.on{width:182px;opacity:1}a:focus-visible{outline:2px solid #fff;outline-offset:-4px}a.drag{width:46px;opacity:1;cursor:grabbing;transition:none}svg{width:18px;height:18px;flex:none;fill:#fff}span{opacity:0;transition:opacity .15s}a:hover span,a:focus-visible span,a.on span{opacity:1}a.drag span{opacity:0}@media (prefers-reduced-motion:reduce){a,span{transition:none}}@media print{a{display:none}}</style><a class="'+s0()+'" draggable="false" href="/" aria-label="Retour à Triviae" title="Retour à Triviae (glisser pour déplacer)"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="2.2"/><rect x="13" y="3" width="8" height="8" rx="2.2"/><rect x="3" y="13" width="8" height="8" rx="2.2"/><rect x="13" y="13" width="8" height="8" rx="2.2"/></svg><span>Triviae</span></a>';
var a=r.querySelector("a");function put(f){var h=innerHeight-H;a.style.top=Math.max(8,Math.min(h-8,f*h))+"px"}put(y0());addEventListener("resize",function(){put(y0())});
try{if(!sessionStorage.getItem("ma-back-hint")){sessionStorage.setItem("ma-back-hint","1");a.classList.add("on");setTimeout(function(){a.classList.remove("on")},2600)}}catch(e){}
a.addEventListener("dragstart",function(e){e.preventDefault()});
var sx=0,sy=null,st=0,moved=false,id=null;
a.addEventListener("pointerdown",function(e){sx=e.clientX;sy=e.clientY;st=parseFloat(a.style.top)||0;moved=false;id=e.pointerId;try{a.setPointerCapture(id)}catch(x){}});
a.addEventListener("pointermove",function(e){if(sy==null)return;if(Math.abs(e.clientY-sy)>6||Math.abs(e.clientX-sx)>6)moved=true;if(moved){a.classList.add("drag");a.classList.remove("on");var h=innerHeight-H,t=Math.max(8,Math.min(h-8,st+e.clientY-sy));a.style.top=t+"px";var s=e.clientX>innerWidth/2?"r":"l";if(!a.classList.contains(s)){a.classList.remove("l","r");a.classList.add(s)}}});
function end(){if(sy==null)return;sy=null;a.classList.remove("drag");if(moved){try{localStorage.setItem(K,String((parseFloat(a.style.top)||0)/(innerHeight-H)));localStorage.setItem(KS,a.classList.contains("r")?"r":"l")}catch(e){}}}
a.addEventListener("pointerup",end);a.addEventListener("pointercancel",end);
a.addEventListener("click",function(e){if(moved){e.preventDefault();moved=false}});
document.documentElement.appendChild(host)}
function go(){mk();setInterval(function(){if(!host||!host.isConnected||host.ownerDocument!==document)mk()},700)}
function later(){setTimeout(go,1200)}
if(document.readyState==="complete")later();else addEventListener("load",later)})();`;
}

function proxy(req, res, rec) {
  if (rec.status !== "running") return html(res, pages.waiting(rec), 503);
  const headers = { ...req.headers, "x-forwarded-for": req.socket.remoteAddress || "" };
  delete headers["x-sync-token"]; // jamais fourni par un navigateur : seul le hub peut l'ajouter
  // Pages HTML : on y insère le correctif de chemins (et la copie du PC si « données sur le PC »), donc on les veut non compressées.
  const inject = req.method === "GET" && String(req.headers.accept || "").includes("text/html") && !req.headers.upgrade;
  if (inject) {
    delete headers["accept-encoding"];
    delete headers["if-none-match"];
    delete headers["if-modified-since"];
  }
  const upstream = http.request(
    { host: "127.0.0.1", port: rec.port, method: req.method, path: req.url, headers },
    (up) => {
      const enc = String(up.headers["content-encoding"] || "").toLowerCase();
      if (inject && up.statusCode === 200 && String(up.headers["content-type"] || "").includes("text/html") && (!enc || /^(gzip|br|deflate)$/.test(enc))) {
        const chunks = [];
        up.on("data", (c) => chunks.push(c));
        up.on("end", () => {
          let raw = Buffer.concat(chunks);
          try {
            if (enc === "gzip") raw = zlib.gunzipSync(raw);
            else if (enc === "br") raw = zlib.brotliDecompressSync(raw);
            else if (enc === "deflate") raw = zlib.inflateSync(raw);
          } catch {
            res.writeHead(200, up.headers);
            return res.end(Buffer.concat(chunks));
          }
          let page = raw.toString("utf8");
          // Si l'application impose une politique de sécurité (CSP), un script en ligne serait bloqué : on le charge alors depuis le hub.
          const csp = !!(up.headers["content-security-policy"] || /<meta[^>]+http-equiv=["']?content-security-policy/i.test(page));
          const code = pathShim(rec.def.basePath) + backTab();
          const tag = (csp ? `<script src="/hub/inject.js?b=${encodeURIComponent(rec.def.basePath)}"></script>` : `<script>${code}</script>`) + (storageOn(rec) ? lsstore.injection(rec.def.id, rec.def.basePath) : "");
          page = /<head[^>]*>/i.test(page) ? page.replace(/<head[^>]*>/i, (m) => m + tag) : tag + page;
          const out = Buffer.from(page, "utf8");
          const h = { ...up.headers, "content-length": String(out.length), "cache-control": "no-store" };
          delete h["transfer-encoding"];
          delete h["content-encoding"];
          delete h.etag;
          res.writeHead(200, h);
          res.end(out);
        });
        up.on("error", () => res.destroy());
        return;
      }
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", () => (res.headersSent ? res.destroy() : html(res, pages.waiting(rec), 502)));
  res.on("close", () => upstream.destroy());
  req.pipe(upstream);
}

/** Échange des données localStorage avec le PC (appelé par la couche injectée, depuis n'importe quel appareil du Wi-Fi). */
async function storageRoute(req, res, rec) {
  if (!storageOn(rec)) return json(res, { ok: false, message: "désactivé" }, 404);
  if (req.method !== "POST") return send(res, 405, "text/plain", "POST uniquement");
  if (!sameOrigin(req) || !String(req.headers["content-type"] || "").startsWith("application/json")) return send(res, 403, "text/plain", "Requête refusée");
  let input;
  try {
    input = JSON.parse((await readBody(req, 8 * 1024 * 1024)).toString("utf8"));
  } catch {
    return json(res, { ok: false, message: "corps invalide" }, 400);
  }
  const out = lsstore.push(rec.def.id, input);
  return json(res, out, out.ok ? 200 : 400);
}

async function homePage(req, res, url, view = "home") {
  const host = req.headers.host || `localhost:${getPort()}`;
  const port = host.includes(":") ? host.split(":").pop() : "80";
  const addresses = lanAddresses().map((a) => ({ ...a, url: `http://${a.ip}${port === "80" ? "" : ":" + port}` }));
  const wanted = url.searchParams.get("ip");
  const chosen = addresses.find((a) => a.ip === wanted) || addresses[0];
  const qrSvg = chosen
    ? await QRCode.toString(chosen.url, { type: "svg", margin: 1, color: { dark: "#1a1f2b", light: "#ffffff" } })
    : "";
  const st = state.read();
  const local = isLoopback(req);
  if (view !== "home" && !local) {
    res.writeHead(302, { location: "/" });
    return res.end();
  }
  html(
    res,
    pages[view]({
      apps: apps.list(),
      tls: view === "settingsPage" ? tls.info() : undefined,
      links: view === "linksPage" ? await links.collect() : undefined,
      linkMgr:
        view === "linksPage"
          ? await (async () => {
              const prov = await linkstore.providers();
              return { links: linkstore.list(), feeds: linkstore.FEEDS, colors: linkstore.COLORS, providers: Object.fromEntries(Object.entries(prov).map(([k, v]) => [k, [...v]])) };
            })()
          : undefined,
      addresses,
      selected: chosen ? chosen.url : "",
      qrSvg,
      local,
      setup: st,
      appsDir: APPS_DIR,
      canAutostart: win.supported,
      canShortcut: typeof win.ensureShortcut === "function",
      autostart: win.autostartOn(),
      sync: sync.status(),
      storage: Object.fromEntries(apps.list().map((r) => [r.def.id, storageOn(r)])),
      data: datadir.info(),
      port,
    }),
  );
}

function create({ onQuit, getPort }) {
  pages.setTheme(state.read().theme);
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://hub");
      const p = url.pathname;

      const rec = appFor(p);
      if (rec) {
        if (p === rec.def.basePath + "/__ma/ls") return await storageRoute(req, res, rec);
        if (rec.def.sync && (p + "/").startsWith(rec.def.basePath + rec.def.sync.path + "/")) return await syncProxy(req, res, rec);
        return proxy(req, res, rec);
      }
      if (p.startsWith("/apps/")) return html(res, pages.notFound(), 404);

      if (p === "/" && req.method === "GET") return await homePage(req, res, url);
      if (p === "/synchronisation" && req.method === "GET") return await homePage(req, res, url, "syncPage");
      if (p === "/importer" && req.method === "GET") return await homePage(req, res, url, "importPage");
      if (p === "/reglages" && req.method === "GET") return await homePage(req, res, url, "settingsPage");
      if (p === "/liens" && req.method === "GET") return await homePage(req, res, url, "linksPage");
      if (p === "/hub/inject.js" && req.method === "GET") {
        const b = String(url.searchParams.get("b") || "");
        if (!/^\/apps\/[a-z0-9-]+$/.test(b)) return send(res, 400, "text/plain", "");
        return send(res, 200, "application/javascript; charset=utf-8", pathShim(b) + backTab());
      }
      if (p === "/hors-ligne" && req.method === "GET") return html(res, pages.offlinePage({}));
      if (p === "/offline/apps.json") {
        return json(res, apps.list().map((r) => ({ id: r.def.id, name: r.def.name, paths: r.def.actions.filter((a) => typeof a.path === "string" && a.path.startsWith("/")).map((a) => r.def.basePath + (a.path === "/" ? "/" : a.path)) })));
      }
      if (p === "/sw.js") return send(res, 200, "application/javascript; charset=utf-8", SW, { "service-worker-allowed": "/" });
      if (p === "/hub/ca.crt") {
        try {
          return send(res, 200, "application/x-x509-ca-cert", tls.caDer(), { "content-disposition": 'attachment; filename="Triviae.crt"' });
        } catch {
          return send(res, 500, "text/plain", "Certificat indisponible");
        }
      }
      if (p === "/hub/ping") return send(res, 200, "text/plain", "mes-applications");
      if (p === "/hub/status") return json(res, apps.list().map(pages.statusOf));

      if (p === "/manifest.webmanifest") {
        return json(res, {
          name: "Triviae",
          short_name: "Applications",
          start_url: "/",
          scope: "/",
          display: "standalone",
          background_color: "#ebf0ea",
          theme_color: "#24573f",
          icons: [
            { src: "/hub/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/hub/icon-512.png", sizes: "512x512", type: "image/png" },
          ],
        });
      }
      const asset = /^\/hub\/(icon-(?:192|512)\.png)$/.exec(p);
      if (asset) return send(res, 200, "image/png", fs.readFileSync(path.join(ASSETS, asset[1])), { "cache-control": "max-age=86400" });

      // Jumelage et vérification d'identité entre PC (le jumelage est protégé par le code, le reste par la signature).
      if (p === "/hub/sync/pair" && req.method === "POST") {
        const out = sync.handlePairRequest(await readBody(req, 16 * 1024), req.socket.remoteAddress);
        return json(res, out.json, out.status);
      }
      if (p === "/hub/sync/hello" && req.method === "GET") {
        const check = sync.verify(req, Buffer.alloc(0));
        if (check.error) return send(res, 401, "text/plain", check.error);
        return json(res, sync.helloProof(check.peer, url.searchParams.get("nonce") || ""));
      }

      // Tout ce qui agit sur le PC (redémarrer, quitter, pare-feu…) n'est permis que depuis le PC lui-même.
      if (p.startsWith("/hub/")) {
        if (!isLoopback(req)) return send(res, 403, "text/plain", "Réservé au PC");
        if (req.method !== "GET" && req.method !== "HEAD" && !sameOrigin(req)) return send(res, 403, "text/plain", "Requête refusée");
        let m;
        if ((m = /^\/hub\/log\/([a-z0-9-]+)$/.exec(p))) {
          const r = apps.get(m[1]);
          if (!r) return html(res, pages.notFound(), 404);
          let text = "";
          try {
            text = fs.readFileSync(apps.logPath(m[1]), "utf8").split("\n").slice(-200).join("\n");
          } catch {}
          return html(res, pages.log(r, text));
        }
        if (req.method === "POST" && p === "/hub/data/pick") {
          const pk = datadir.pick();
          res.on("close", () => pk.cancel());
          let out;
          try {
            out = await pk.promise;
          } catch {
            out = { unavailable: true };
          }
          return json(res, out);
        }
        if (p === "/hub/data/browse") return json(res, datadir.browse(new URL(req.url, "http://x").searchParams.get("dir")));
        if (req.method === "POST" && p === "/hub/data/mkdir") {
          let input = {};
          try {
            input = JSON.parse((await readBody(req, 4096)).toString("utf8"));
          } catch {}
          const out = datadir.makeFolder(input.parent, input.name);
          return json(res, out, out.ok ? 200 : 400);
        }
        if (req.method === "POST" && p === "/hub/storage") {
          let input = {};
          try {
            input = JSON.parse((await readBody(req, 1024)).toString("utf8"));
          } catch {}
          const r = apps.get(String(input.id));
          if (!r) return json(res, { ok: false }, 404);
          state.update({ storage: { ...(state.read().storage || {}), [r.def.id]: !!input.on } });
          return json(res, { ok: true, on: !!input.on });
        }
        if (req.method === "POST" && p === "/hub/theme") {
          let input = {};
          try {
            input = JSON.parse((await readBody(req, 1024)).toString("utf8"));
          } catch {}
          const t = pages.setTheme(input.theme);
          state.update({ theme: t });
          return json(res, { ok: true, theme: t });
        }
        if (req.method === "POST" && p === "/hub/import") {
          try {
            return json(res, await importer.stage(req, decodeURIComponent(String(req.headers["x-filename"] || "")).slice(0, 200)));
          } catch (e) {
            if (!e.user) console.error("import :", e);
            res.setHeader("connection", "close");
            return json(res, { ok: false, message: e.user ? e.message : "L'analyse de l'archive a échoué." }, 400);
          }
        }
        if (p === "/hub/import/job") return json(res, importer.jobStatus(url.searchParams.get("token")));
        if (req.method === "POST" && (p === "/hub/import/confirm" || p === "/hub/import/cancel")) {
          let input = {};
          try {
            input = JSON.parse((await readBody(req, 8192)).toString("utf8"));
          } catch {}
          if (p.endsWith("cancel")) return (importer.cancel(input.token), json(res, { ok: true }));
          try {
            return json(res, await importer.confirm(input.token, { name: input.name, description: input.description, id: input.id }));
          } catch (e) {
            return json(res, { ok: false, message: e.user ? e.message : "L'installation a échoué." }, 400);
          }
        }
        if (p === "/hub/data/status") return json(res, datadir.info());
        if (req.method === "POST" && p === "/hub/data/set") {
          let input = {};
          try {
            input = JSON.parse((await readBody(req, 4096)).toString("utf8"));
          } catch {}
          await apps.stopAll(); // le temps de copier : aucune application n'écrit dans les dossiers
          let out;
          try {
            out = datadir.set(input.dir ?? null);
          } catch (e) {
            console.error(e);
            out = { ok: false, message: `Le changement de dossier a échoué (${e.code || e.message}). Rien n'a été changé.` };
          }
          try {
            await apps.restartAll();
          } catch (e) {
            console.error(e);
          }
          return json(res, out, out.ok ? 200 : 400);
        }
        if (req.method === "POST" && p === "/hub/data/retry") {
          const ok = datadir.check();
          if (ok) await apps.restartAll();
          return json(res, { ok, message: datadir.getProblem() });
        }
        if ((m = /^\/hub\/links\/for\/([a-z0-9-]+)$/.exec(p)) && req.method === "GET") return json(res, { links: linkstore.forConsumer(m[1]), managed: linkstore.managed() });
        if (p === "/hub/sync/status") return json(res, sync.status());
        if (req.method === "POST" && p.startsWith("/hub/sync/")) {
          if (p === "/hub/sync/pair/start") return json(res, sync.startPairing());
          if (p === "/hub/sync/pair/cancel") return (sync.cancelPairing(), json(res, { ok: true }));
          if (p === "/hub/sync/join") {
            let input = {};
            try {
              input = JSON.parse((await readBody(req, 4096)).toString("utf8"));
            } catch {}
            try {
              return json(res, { ok: true, peer: await sync.joinPairing(input.address, input.code) });
            } catch (e) {
              return json(res, { ok: false, message: e.message }, 400);
            }
          }
          if (p === "/hub/sync/auto") {
            let input = {};
            try {
              input = JSON.parse((await readBody(req, 1024)).toString("utf8"));
            } catch {}
            return (sync.setAuto(input.on), json(res, { ok: true }));
          }
          if ((m = /^\/hub\/sync\/now\/([A-Za-z0-9-]+)$/.exec(p))) return json(res, await sync.now(m[1]));
          if ((m = /^\/hub\/sync\/unpair\/([A-Za-z0-9-]+)$/.exec(p))) return (sync.unpair(m[1]), json(res, { ok: true }));
        }
        if (req.method === "POST") {
          if ((m = /^\/hub\/restart\/([a-z0-9-]+)$/.exec(p))) return json(res, { ok: await apps.restart(m[1]) });
          if (p === "/hub/rescan") return json(res, { added: apps.scan() });
          if (p === "/hub/firewall") return json(res, { ok: await win.ensureFirewall(getPort(), true) });
          if (p === "/hub/links/add") {
            let input = {};
            try {
              input = JSON.parse((await readBody(req, 4096)).toString("utf8"));
            } catch {}
            try {
              return json(res, { ok: true, link: linkstore.add(input) });
            } catch (e) {
              return json(res, { ok: false, message: e.user ? e.message : "Impossible d'enregistrer le lien." }, e.user ? 400 : 500);
            }
          }
          if (p === "/hub/links/remove") {
            let input = {};
            try {
              input = JSON.parse((await readBody(req, 1024)).toString("utf8"));
            } catch {}
            return json(res, { ok: linkstore.remove(String(input.id || "")) });
          }
          if (p === "/hub/links/ignore") {
            linkstore.setManaged();
            return json(res, { ok: true });
          }
          if (p === "/hub/links/import") {
            const L = await links.collect(true);
            return json(res, { ok: true, added: await linkstore.importDeclared(L.edges) });
          }
          if (p === "/hub/shortcut") return json(res, { ok: !!win.ensureShortcut(true) });
          if (p === "/hub/autostart") return json(res, { on: win.setAutostart(!win.autostartOn()) });
          if (p === "/hub/quit") {
            json(res, { ok: true });
            return setTimeout(onQuit, 100);
          }
        }
      }
      html(res, pages.notFound(), 404);
    } catch (err) {
      console.error(err);
      try {
        fs.mkdirSync(LOGS, { recursive: true });
        fs.appendFileSync(path.join(LOGS, "hub.log"), `\n--- ${new Date().toLocaleString("fr-FR")} ${req.method} ${req.url}\n${(err && err.stack) || err}\n`);
      } catch {}
      if (!res.headersSent) {
        // les pages du hub lisent du JSON : on renvoie la vraie raison plutôt qu'un texte brut
        if (String(req.url || "").startsWith("/hub/")) json(res, { ok: false, message: `Erreur interne : ${(err && (err.code ? err.code + " " : "") + err.message) || err}. Détails dans le fichier hub.log du dossier des journaux.` }, 500);
        else send(res, 500, "text/plain", "Erreur interne");
      }
    }
  });

  // WebSocket éventuels des applications : on relaie le flux tel quel.
  server.on("upgrade", (req, socket, head) => {
    const rec = appFor(req.url || "");
    if (!rec || rec.status !== "running") return socket.destroy();
    const net = require("net");
    const up = net.connect(rec.port, "127.0.0.1", () => {
      up.write(`${req.method} ${req.url} HTTP/1.1\r\n` + Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join("\r\n") + "\r\n\r\n");
      up.write(head);
      socket.pipe(up).pipe(socket);
    });
    up.on("error", () => socket.destroy());
    socket.on("error", () => up.destroy());
  });
  return server;
}

module.exports = { create };
