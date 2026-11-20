const fs = require("fs");
const path = require("path");
const { DATA } = require("./config");

const file = path.join(DATA, "state.json");

function read() {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function update(patch) {
  const next = { ...read(), ...patch };
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2));
  return next;
}

module.exports = { read, update };
