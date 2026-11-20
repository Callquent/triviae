#!/usr/bin/env bash
# Assemble le dossier « Triviae ». Usage : ./assemble.sh <dossier-de-sortie> <linux|win> [chemin-du-node-à-embarquer]
set -euo pipefail
OUT=$(realpath -m "${1:?dossier de sortie}"); TARGET=${2:-linux}; NODE_BIN=${3:-$(command -v node)}
cd "$(dirname "$0")/.."
rm -rf "$OUT"; mkdir -p "$OUT/hub/assets" "$OUT/apps" "$OUT/runtime"
(cd hub && npx esbuild src/main.js --bundle --platform=node --target=node22 --outfile="$OUT/hub/hub.js" --log-level=warning)
cp hub/watchdog.js "$OUT/hub/"
cp hub/assets/* "$OUT/hub/assets/"
if [ "$NODE_BIN" = none ]; then rmdir "$OUT/runtime"
elif [ "$TARGET" = win ]; then cp "$NODE_BIN" "$OUT/runtime/node.exe"; else cp "$NODE_BIN" "$OUT/runtime/node"; fi
du -sh "$OUT"
