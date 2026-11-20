"use strict";
// Applications Next.js avec Prisma + SQLite.
//
// Le hub ne peut pas lancer « prisma db push » (le moteur de migration n'est pas livré avec l'application compilée).
// Il lit donc le schéma Prisma (prisma/schema.prisma), puis, avant chaque démarrage de l'application, crée dans le
// dossier de données les tables et les colonnes manquantes avec le module SQLite intégré à Node. Les données
// existantes ne sont jamais supprimées ni modifiées.
//
// Couvre le sous-ensemble courant de Prisma : modèles, types de base, énumérations (stockées en texte),
// @id / @@id, @unique / @@unique, @@index, @default, @map / @@map, relations 1-n et n-n implicites.
const fs = require("fs");
const path = require("path");

const SCALARS = { String: "TEXT", Int: "INTEGER", BigInt: "BIGINT", Float: "REAL", Decimal: "DECIMAL", Boolean: "BOOLEAN", DateTime: "DATETIME", Json: "JSONB", Bytes: "BLOB" };

/** Emplacements possibles du schéma dans une application assemblée. */
function findSchema(dir) {
  for (const rel of ["prisma/schema.prisma", "schema.prisma", "node_modules/.prisma/client/schema.prisma"]) {
    const f = path.join(dir, rel);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => {
    let q = false;
    for (let i = 0; i < l.length; i++) {
      if (l[i] === '"' && l[i - 1] !== "\\") q = !q;
      if (!q && l[i] === "/" && l[i + 1] === "/") return l.slice(0, i);
    }
    return l;
  }).join("\n");
}

function blocks(text, kind) {
  const out = [];
  const re = new RegExp(`(?:^|\\n)\\s*${kind}\\s+(\\w+)\\s*\\{([\\s\\S]*?)\\n\\s*\\}`, "g");
  let m;
  while ((m = re.exec(text))) out.push({ name: m[1], body: m[2] });
  return out;
}

const list = (s) => String(s || "").split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
function arg(attrs, name, key) {
  // @attr(...) → contenu des parenthèses
  const m = new RegExp(`@${name}\\(((?:[^()"]|"[^"]*"|\\([^()]*\\))*)\\)`).exec(attrs);
  if (!m) return null;
  if (!key) return m[1];
  const k = new RegExp(`${key}\\s*:\\s*(\\[[^\\]]*\\]|"[^"]*"|[\\w.]+)`).exec(m[1]);
  return k ? k[1] : null;
}
const arr = (s) => (s ? list(s.replace(/^\[|\]$/g, "")) : []);
const unq = (s) => (s || "").replace(/^"|"$/g, "");

/** Lit un schéma Prisma. @returns {{provider:string, models:object[], enums:string[]}} */
function parse(text) {
  const src = stripComments(String(text || ""));
  const provider = (/datasource\s+\w+\s*\{[^}]*provider\s*=\s*"([^"]+)"/.exec(src) || [])[1] || "";
  const enums = blocks(src, "enum").map((b) => b.name);
  const rawModels = blocks(src, "model");
  const names = new Set(rawModels.map((m) => m.name));

  const models = rawModels.map((b) => {
    const model = { name: b.name, table: b.name, fields: [], pk: null, uniques: [], indexes: [], rel: [] };
    for (const line of b.body.split("\n").map((l) => l.trim()).filter(Boolean)) {
      if (line.startsWith("@@")) {
        if (/^@@map/.test(line)) model.table = unq(arg(line, "map") || b.name);
        else if (/^@@id/.test(line)) model.pk = arr((/\[([^\]]*)\]/.exec(line) || [])[1]);
        else if (/^@@unique/.test(line)) model.uniques.push(arr((/\[([^\]]*)\]/.exec(line) || [])[1]));
        else if (/^@@index/.test(line)) model.indexes.push(arr((/\[([^\]]*)\]/.exec(line) || [])[1]));
        continue;
      }
      const m = /^(\w+)\s+(\w+)(\[\]|\?)?\s*(.*)$/.exec(line);
      if (!m) continue;
      const [, name, type, mod, attrs] = m;
      const f = { name, type, list: mod === "[]", optional: mod === "?", attrs, column: name };
      if (names.has(type)) {
        // relation : colonne(s) de clé étrangère si fields: [...] est présent
        const fields = arr(arg(attrs, "relation", "fields"));
        model.rel.push({
          field: name, target: type, list: f.list, name: unq(arg(attrs, "relation", "name") || (/@relation\(\s*"([^"]+)"/.exec(attrs) || [])[1] || ""),
          fields, references: arr(arg(attrs, "relation", "references")),
          onDelete: unq(arg(attrs, "relation", "onDelete")), onUpdate: unq(arg(attrs, "relation", "onUpdate")), optional: f.optional,
        });
        continue;
      }
      if (f.list) continue; // liste de scalaires : non gérée par SQLite
      const sql = SCALARS[type] || (enums.includes(type) ? "TEXT" : null);
      if (!sql) continue;
      f.sql = sql;
      f.isId = /@id\b/.test(attrs);
      f.unique = /@unique\b/.test(attrs);
      const mp = arg(attrs, "map");
      if (mp) f.column = unq(mp);
      const d = arg(attrs, "default");
      f.default = d == null ? null : d.trim();
      model.fields.push(f);
    }
    return model;
  });
  return { provider, models, enums };
}

const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`;

function defaultSql(f) {
  const d = f.default;
  if (d == null || /^(autoincrement|cuid|uuid|dbgenerated|nanoid|ulid)\(/.test(d)) return "";
  if (/^now\(\)$/.test(d)) return " DEFAULT CURRENT_TIMESTAMP";
  if (/^(true|false)$/.test(d)) return ` DEFAULT ${d === "true" ? 1 : 0}`;
  if (/^-?\d+(\.\d+)?$/.test(d)) return ` DEFAULT ${d}`;
  const s = /^"((?:[^"\\]|\\.)*)"$/.exec(d);
  if (s) return ` DEFAULT ${sqlStr(s[1].replace(/\\(.)/g, "$1"))}`;
  if (/^\w+$/.test(d)) return ` DEFAULT ${sqlStr(d)}`; // valeur d'énumération
  return "";
}

function colSql(f, { forAlter } = {}) {
  const auto = f.default && /^autoincrement\(/.test(f.default);
  let s = `${q(f.column)} ${f.sql}`;
  const pkInline = f.isId;
  if (!f.optional || pkInline) s += " NOT NULL";
  if (pkInline) s += " PRIMARY KEY" + (auto ? " AUTOINCREMENT" : "");
  let def = defaultSql(f);
  if (forAlter && !f.optional && !def) def = f.sql === "TEXT" ? " DEFAULT ''" : f.sql === "DATETIME" ? " DEFAULT CURRENT_TIMESTAMP" : f.sql === "BLOB" ? " DEFAULT x''" : " DEFAULT 0";
  return s + def;
}

const colName = (model, field) => (model.fields.find((f) => f.name === field) || { column: field }).column;

/** Tables à partir du schéma (y compris les tables de jointure des relations n-n implicites). */
function plan(schema) {
  const byName = new Map(schema.models.map((m) => [m.name, m]));
  const tables = [];
  for (const m of schema.models) {
    const cols = m.fields.map((f) => ({ name: f.column, sql: colSql(f), alter: colSql(f, { forAlter: true }), required: !f.optional }));
    const cons = [];
    if (m.pk && m.pk.length) cons.push(`PRIMARY KEY (${m.pk.map((c) => q(colName(m, c))).join(", ")})`);
    for (const r of m.rel) {
      if (!r.fields.length) continue;
      const t = byName.get(r.target);
      const del = r.onDelete ? r.onDelete.replace(/([a-z])([A-Z])/g, "$1 $2").toUpperCase() : r.optional ? "SET NULL" : "RESTRICT";
      const upd = r.onUpdate ? r.onUpdate.replace(/([a-z])([A-Z])/g, "$1 $2").toUpperCase() : "CASCADE";
      cons.push(`FOREIGN KEY (${r.fields.map((c) => q(colName(m, c))).join(", ")}) REFERENCES ${q(t.table)} (${r.references.map((c) => q(colName(t, c))).join(", ")}) ON DELETE ${del} ON UPDATE ${upd}`);
    }
    const idx = [];
    for (const f of m.fields) if (f.unique) idx.push({ name: `${m.table}_${f.column}_key`, unique: true, cols: [f.column] });
    for (const u of m.uniques) idx.push({ name: `${m.table}_${u.map((c) => colName(m, c)).join("_")}_key`, unique: true, cols: u.map((c) => colName(m, c)) });
    for (const i of m.indexes) idx.push({ name: `${m.table}_${i.map((c) => colName(m, c)).join("_")}_idx`, unique: false, cols: i.map((c) => colName(m, c)) });
    tables.push({ table: m.table, cols, cons, idx });
  }
  // relations n-n implicites : liste des deux côtés, aucune clé étrangère
  const done = new Set();
  for (const m of schema.models) {
    for (const r of m.rel) {
      if (!r.list || r.fields.length) continue;
      const other = byName.get(r.target);
      const back = other.rel.find((x) => x.target === m.name && x.list && !x.fields.length && x.name === r.name && x.field !== r.field) || other.rel.find((x) => x.target === m.name && x.list && !x.fields.length && x.name === r.name);
      if (!back) continue;
      const [a, b] = [m, other].sort((x, y) => (x.name < y.name ? -1 : 1));
      const jt = r.name ? `_${r.name}` : `_${a.name}To${b.name}`;
      if (done.has(jt)) continue;
      done.add(jt);
      const pkOf = (x) => x.fields.find((f) => f.isId) || x.fields.find((f) => x.pk && x.pk[0] === f.name);
      const pa = pkOf(a), pb = pkOf(b);
      if (!pa || !pb) continue;
      tables.push({
        table: jt,
        cols: [{ name: "A", sql: `"A" ${pa.sql} NOT NULL`, alter: `"A" ${pa.sql} NOT NULL DEFAULT 0`, required: true }, { name: "B", sql: `"B" ${pb.sql} NOT NULL`, alter: `"B" ${pb.sql} NOT NULL DEFAULT 0`, required: true }],
        cons: [`FOREIGN KEY ("A") REFERENCES ${q(a.table)} (${q(pa.column)}) ON DELETE CASCADE ON UPDATE CASCADE`, `FOREIGN KEY ("B") REFERENCES ${q(b.table)} (${q(pb.column)}) ON DELETE CASCADE ON UPDATE CASCADE`],
        idx: [{ name: `${jt}_AB_unique`, unique: true, cols: ["A", "B"] }, { name: `${jt}_B_index`, unique: false, cols: ["B"] }],
      });
    }
  }
  return tables;
}

/**
 * Crée / complète la base SQLite du schéma. Ne supprime rien.
 * @returns {string[]} messages pour le journal de l'application
 */
function ensure(dbFile, schemaText) {
  const log = [];
  const schema = parse(schemaText);
  if (schema.provider !== "sqlite") throw new Error(`base « ${schema.provider || "inconnue"} » non prise en charge (seul SQLite l'est)`);
  const tables = plan(schema);
  if (!tables.length) throw new Error("aucun modèle trouvé dans le schéma Prisma");
  const { DatabaseSync } = require("node:sqlite");
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = new DatabaseSync(dbFile);
  try {
    db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    const have = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name));
    for (const t of tables) {
      if (!have.has(t.table)) {
        db.exec(`CREATE TABLE ${q(t.table)} (\n  ${[...t.cols.map((c) => c.sql), ...t.cons.filter((c) => !(c.startsWith("PRIMARY KEY") && t.cols.some((x) => /PRIMARY KEY/.test(x.sql))))].join(",\n  ")}\n)`);
        log.push(`table « ${t.table} » créée`);
      } else {
        const cols = new Set(db.prepare(`PRAGMA table_info(${q(t.table)})`).all().map((r) => r.name));
        for (const c of t.cols) {
          if (cols.has(c.name)) continue;
          db.exec(`ALTER TABLE ${q(t.table)} ADD COLUMN ${c.alter}`);
          log.push(`colonne « ${t.table}.${c.name} » ajoutée`);
        }
      }
      for (const i of t.idx) {
        try {
          db.exec(`CREATE ${i.unique ? "UNIQUE " : ""}INDEX IF NOT EXISTS ${q(i.name)} ON ${q(t.table)} (${i.cols.map(q).join(", ")})`);
        } catch (e) {
          log.push(`index « ${i.name} » ignoré : ${e.message}`);
        }
      }
    }
  } finally {
    db.close();
  }
  return log;
}

/** URL SQLite au format Prisma (chemin absolu, barres obliques). */
const toUrl = (file) => "file:" + file.replace(/\\/g, "/");

module.exports = { parse, plan, ensure, findSchema, toUrl };
