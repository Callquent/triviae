// Service worker « copie hors ligne » : servi par le hub à /sw.js, actif seulement en https (ou localhost).
// Réseau d'abord (les données restent fraîches), copie locale si le PC est injoignable.
module.exports = `
var V = "ma-copie-v1";
var SKIP = /^\\/(hub\\/(?!icon)|synchronisation|importer|reglages|sw\\.js|offline\\/)/;
self.addEventListener("install", function (e) { self.skipWaiting(); });
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== V; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
function offline() {
  return new Response("<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Hors ligne</title><body style='font:16px system-ui;padding:24px;max-width:36em;margin:auto'><h1>Pas de connexion au PC</h1><p>Cette page n\\u2019est pas dans la copie du t\\u00e9l\\u00e9phone. Revenez sur le Wi-Fi de la maison, ou ouvrez <a href='/'>Triviae</a> pour voir ce qui est disponible.</p>", { status: 503, headers: { "content-type": "text/html; charset=utf-8" } });
}
self.addEventListener("fetch", function (e) {
  var r = e.request;
  if (r.method !== "GET" || r.headers.has("range")) return;
  var u = new URL(r.url);
  if (u.origin !== location.origin || SKIP.test(u.pathname)) return;
  e.respondWith(
    caches.open(V).then(function (c) {
      var immutable = /\\/_next\\/static\\//.test(u.pathname);
      var hit = immutable ? c.match(r, { ignoreVary: true }) : Promise.resolve(null);
      return hit.then(function (h) {
        if (h) return h;
        return new Promise(function (resolve) {
          var settled = false;
          var t = setTimeout(function () {
            c.match(r, { ignoreVary: true }).then(function (m) { if (m && !settled) { settled = true; resolve(m); } });
          }, 6000);
          fetch(r).then(function (res) {
            clearTimeout(t);
            if (res && res.status === 200 && res.type === "basic") c.put(r, res.clone());
            if (!settled) { settled = true; resolve(res); }
          }).catch(function () {
            clearTimeout(t);
            c.match(r, { ignoreVary: true }).then(function (m) {
              if (settled) return;
              settled = true;
              if (m) return resolve(m);
              if (r.mode === "navigate") return c.match("/").then(function (home) { resolve(home && u.pathname.indexOf("/apps/") !== 0 ? home : offline()); });
              resolve(new Response("", { status: 504 }));
            });
          });
        });
      });
    })
  );
});
`;
