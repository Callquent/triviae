// Chargé dans chaque application (node --require) : si le hub disparaît (fenêtre fermée, plantage),
// le tuyau d'entrée se ferme et l'application s'arrête aussi, au lieu de rester en arrière-plan.
process.stdin.on("end", () => process.exit(0));
process.stdin.on("error", () => process.exit(0));
process.stdin.on("close", () => process.exit(0));
process.stdin.resume();

// Next.js 16 (Turbopack) réclame parfois « @prisma/client-<16 caractères> » (alias introuvable hors de la compilation) :
// à défaut, on charge le vrai module du même nom sans suffixe.
{
  const Module = require("module");
  const resolve = Module._resolveFilename;
  const seen = new Set();
  Module._resolveFilename = function (request, ...rest) {
    try {
      return resolve.call(this, request, ...rest);
    } catch (e) {
      const m = e && e.code === "MODULE_NOT_FOUND" && typeof request === "string" ? /^((?:@[\w.-]+\/)?[\w.-]+)-[0-9a-f]{16}$/.exec(request) : null;
      if (m) {
        try {
          const found = resolve.call(this, m[1], ...rest);
          if (!seen.has(request)) (seen.add(request), console.log("[réparation] module externe " + request + " → " + m[1]));
          return found;
        } catch {}
      }
      throw e;
    }
  };
}
