// Réglages propres au système (pare-feu, raccourcis, démarrage automatique) : Windows ou Ubuntu/Linux.
const noop = {
  supported: false,
  ensureFirewall: () => Promise.resolve(true),
  ensureShortcut() {},
  autostartOn: () => false,
  setAutostart: () => false,
};
module.exports = process.platform === "win32" ? require("./winsetup") : process.platform === "linux" ? require("./linuxsetup") : noop;
