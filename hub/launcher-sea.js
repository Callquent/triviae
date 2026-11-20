// Contenu de Triviae.exe : un petit lanceur qui démarre hub/hub.js situé à côté de l'exécutable.
// Le hub peut ainsi être mis à jour sans refaire l'exécutable.
const path = require("node:path");
const { createRequire } = require("node:module");

const root = path.dirname(process.execPath);
process.env.MA_ROOT = root;
process.env.MA_EXE = process.execPath;

try {
  const hub = path.join(root, "hub", "hub.js");
  createRequire(hub)(hub);
} catch (err) {
  console.error("\nTriviae ne peut pas démarrer :", err && err.message ? err.message : err);
  console.error("Vérifiez que le dossier « hub » est bien à côté de Triviae.exe.");
  setInterval(() => {}, 1 << 30); // garde la fenêtre ouverte pour lire le message
}
