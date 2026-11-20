// « Données sur le PC » pour les applications qui rangent tout dans le localStorage du navigateur
// (cas fréquent des applications 100 % navigateur) : le hub garde la copie de référence sur le PC et la
// propose à chaque appareil (PC, téléphone…). Une petite couche injectée dans les pages envoie chaque
// modification au PC et fusionne les modifications faites en parallèle sur deux appareils.
const fs = require("fs");
const path = require("path");
const datadir = require("./datadir");

const FILE = "localstorage.json";
const MAX_VALUE = 6 * 1024 * 1024;
const MAX_KEYS = 500;

const file = (id) => path.join(datadir.forApp(id), FILE);

function load(id) {
  try {
    const j = JSON.parse(fs.readFileSync(file(id), "utf8"));
    return { rev: j.rev | 0, keys: j.keys && typeof j.keys === "object" ? j.keys : {} };
  } catch {
    return { rev: 0, keys: {} };
  }
}

function save(id, s) {
  const f = file(id);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s));
  fs.renameSync(tmp, f);
}

/** Valeurs actuelles ; une clé supprimée vaut null (le « tombeau » prévient les autres appareils). */
function snapshot(id) {
  const s = load(id);
  const keys = {};
  for (const [k, e] of Object.entries(s.keys)) keys[k] = e && typeof e.v === "string" ? e.v : null;
  return { rev: s.rev, keys };
}

// ---- fusion à trois voies -------------------------------------------------------------------

const idOf = (x) => (x && typeof x === "object" && !Array.isArray(x) && (typeof x.id === "string" || typeof x.id === "number") ? String(x.id) : null);
function parseList(s) {
  if (typeof s !== "string") return null;
  try {
    const a = JSON.parse(s);
    return Array.isArray(a) && a.every((x) => idOf(x) !== null) ? a : null;
  } catch {
    return null;
  }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Listes d'objets à « id » (candidatures, tâches…) : on fusionne élément par élément. */
function mergeLists(B, M, T, mineNewer) {
  const index = (a) => new Map(a.map((x) => [idOf(x), x]));
  const b = index(B), m = index(M), t = index(T);
  const ids = [...new Set([...T, ...M, ...B].map(idOf))];
  const out = [];
  for (const id of ids) {
    const ib = b.get(id), im = m.get(id), it = t.get(id);
    if (im && it) {
      if (same(im, it)) out.push(it);
      else if (ib && same(ib, it)) out.push(im); // seul « mine » a modifié
      else if (ib && same(ib, im)) out.push(it); // seul « theirs » a modifié
      else out.push(mineNewer ? im : it);
    } else if (im) {
      if (!ib || !same(ib, im)) out.push(im); // ajouté ou modifié ici ; supprimé là-bas sans modification : supprimé
    } else if (it) {
      if (!ib || !same(ib, it)) out.push(it);
    }
  }
  return out;
}

/**
 * @param base    valeur commune au dernier échange de l'appareil (null si jamais synchronisé)
 * @param mine    valeur envoyée par l'appareil (null = supprimée)
 * @param theirs  valeur actuelle sur le PC (null = absente ou supprimée)
 */
function merge(base, mine, theirs, tMine, tTheirs) {
  if (theirs === null || theirs === base) return mine; // rien de nouveau sur le PC
  if (mine === theirs) return theirs;
  if (mine === null) return theirs; // supprimée ici, modifiée ailleurs : la modification gagne
  const M = parseList(mine), T = parseList(theirs);
  if (M && T) {
    const B = parseList(base) || [];
    return JSON.stringify(mergeLists(B, M, T, tMine >= tTheirs));
  }
  return tMine >= tTheirs ? mine : theirs;
}

function push(id, body) {
  const k = body && body.k;
  if (typeof k !== "string" || !k || k.length > 200 || k.startsWith("__ma_")) return { ok: false, message: "clé invalide" };
  const v = body.v === null || typeof body.v === "string" ? body.v : undefined;
  const base = body.base === null || typeof body.base === "string" ? body.base : null;
  if (v === undefined || (v !== null && v.length > MAX_VALUE)) return { ok: false, message: "valeur invalide ou trop grande" };
  const t = Number.isFinite(body.t) ? body.t : Date.now();
  const s = load(id);
  const cur = s.keys[k];
  if (!cur && Object.keys(s.keys).length >= MAX_KEYS) return { ok: false, message: "trop de clés" };
  const theirs = cur && typeof cur.v === "string" ? cur.v : null;
  const final = merge(base, v, theirs, t, cur ? cur.t || 0 : 0);
  if (final !== theirs || !cur) {
    s.keys[k] = { v: final, t: final === theirs && cur ? cur.t : t };
    s.rev++;
    save(id, s);
  }
  return { ok: true, v: final, rev: s.rev };
}

// ---- couche injectée dans les pages ----------------------------------------------------------

/* eslint-disable */
function client(BASE, SNAP) {
  var LS;
  try {
    LS = window.localStorage;
    LS.getItem("__ma_t");
  } catch (e) {
    return;
  }
  var P = Storage.prototype;
  var pGet = P.getItem, pSet = P.setItem, pRem = P.removeItem, pClear = P.clear;
  var BK = "__ma_base", DK = "__ma_dirty";
  var started = Date.now();
  function rd(k) {
    try {
      return JSON.parse(pGet.call(LS, k) || "{}") || {};
    } catch (e) {
      return {};
    }
  }
  var base = rd(BK), dirty = rd(DK);
  function wr(k, o) {
    try {
      pSet.call(LS, k, JSON.stringify(o));
    } catch (e) {}
  }
  function mine(k) {
    return k.indexOf("__ma_") !== 0;
  }
  var has = function (o, k) {
    return Object.prototype.hasOwnProperty.call(o, k);
  };

  // 1. Ce que le PC sait est appliqué avant que l'application ne lise ses données.
  var keys = SNAP.keys || {};
  for (var k in keys) {
    if (!has(keys, k) || !mine(k)) continue;
    var sv = keys[k], lv = pGet.call(LS, k);
    var unsynced = has(dirty, k) || (has(base, k) ? lv !== base[k] : lv !== null);
    if (unsynced) {
      if (!has(dirty, k)) dirty[k] = Date.now();
      continue;
    }
    if (sv === null) {
      if (lv !== null) pRem.call(LS, k);
      delete base[k];
    } else {
      if (lv !== sv) pSet.call(LS, k, sv);
      base[k] = sv;
    }
  }
  // 2. Ce que cet appareil a et que le PC ignore.
  for (var i = 0; i < LS.length; i++) {
    var kk = LS.key(i);
    if (!mine(kk) || has(keys, kk)) continue;
    var cv = pGet.call(LS, kk);
    if (!has(base, kk) || cv !== base[kk]) if (!has(dirty, kk)) dirty[kk] = Date.now();
  }
  wr(BK, base);
  wr(DK, dirty);

  // 3. Suivi des modifications faites par l'application.
  var timer = null, busy = false, retry = null, badge = null, flash = null;
  function mark(k) {
    dirty[k] = Date.now();
    wr(DK, dirty);
    schedule(300);
  }
  P.setItem = function (k, v) {
    pSet.call(this, k, v);
    if (this === LS && mine(String(k))) mark(String(k));
  };
  P.removeItem = function (k) {
    pRem.call(this, k);
    if (this === LS && mine(String(k))) mark(String(k));
  };
  P.clear = function () {
    if (this !== LS) return pClear.call(this);
    var ks = [], sb = pGet.call(LS, BK), sd = pGet.call(LS, DK);
    for (var j = 0; j < LS.length; j++) if (mine(LS.key(j))) ks.push(LS.key(j));
    pClear.call(LS);
    if (sb !== null) pSet.call(LS, BK, sb);
    if (sd !== null) pSet.call(LS, DK, sd);
    for (var m = 0; m < ks.length; m++) mark(ks[m]);
  };

  // 4. Petit témoin : n'apparaît que si des données attendent d'être envoyées au PC.
  function show(text, ms) {
    if (!document.documentElement) return;
    if (!badge) {
      badge = document.createElement("div");
      badge.setAttribute("role", "status");
      badge.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:2147483647;background:#17261e;color:#fff;padding:6px 12px;border-radius:999px;font:13px system-ui,sans-serif;opacity:.92;pointer-events:none";
      document.documentElement.appendChild(badge);
    }
    badge.textContent = text;
    badge.style.display = text ? "block" : "none";
    clearTimeout(flash);
    if (ms) flash = setTimeout(function () { badge.style.display = "none"; }, ms);
  }
  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(flush, ms);
  }
  function flush() {
    if (busy) return;
    var pend = Object.keys(dirty);
    if (!pend.length) return;
    busy = true;
    var k = pend[0], sent = pGet.call(LS, k);
    var tSent = dirty[k];
    fetch(BASE + "/__ma/ls", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ k: k, v: sent, base: has(base, k) ? base[k] : null, t: tSent }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        if (!res || !res.ok) throw new Error("refus");
        var now = pGet.call(LS, k), merged = res.v;
        if (now === sent) {
          if (merged !== sent) {
            if (merged === null) pRem.call(LS, k);
            else pSet.call(LS, k, merged);
          }
          if (dirty[k] === tSent) delete dirty[k];
        }
        if (merged === null) delete base[k];
        else base[k] = merged;
        wr(BK, base);
        wr(DK, dirty);
        busy = false;
        if (merged !== sent && Date.now() - started < 15000 && now === sent) {
          // Fusion faite au chargement (autre appareil modifié entre-temps) : on recharge une fois pour l'afficher.
          try {
            var n = +(sessionStorage.getItem("__ma_rl") || 0);
            if (n < 2) {
              sessionStorage.setItem("__ma_rl", String(n + 1));
              location.reload();
              return;
            }
          } catch (e) {}
        }
        if (Object.keys(dirty).length) {
          show("Envoi au PC…", 0);
          schedule(0);
        } else show("Enregistré sur le PC", 1800);
      })
      .catch(function () {
        busy = false;
        show("En attente d'envoi au PC", 0);
        clearTimeout(retry);
        retry = setTimeout(flush, 8000);
      });
  }
  window.addEventListener("online", function () { schedule(0); });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flush();
    else schedule(0);
  });
  if (Object.keys(dirty).length) schedule(50);
}
/* eslint-enable */

/** Balise à insérer au début de <head> : la copie du PC est dans la page, donc disponible avant tout script de l'application. */
function injection(id, basePath) {
  const snap = JSON.stringify(snapshot(id)).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return `<script>(${client.toString()})(${JSON.stringify(basePath)},${snap});</script>`;
}

module.exports = { snapshot, push, merge, injection };
