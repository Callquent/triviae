#!/usr/bin/env bash
# Fabrique l'exécutable de démarrage : une copie de Node dans laquelle on injecte le lanceur (SEA).
# Usage : ./make-exe.sh <node ou node.exe de la plateforme visée> <exécutable de sortie>
set -euo pipefail
NODE_BIN=$(realpath "${1:?node cible}"); OUT=$(realpath -m "${2:?exécutable de sortie}")
cd "$(dirname "$0")/../hub"
node --experimental-sea-config sea-config.json >/dev/null
cp "$NODE_BIN" "$OUT"
npx postject "$OUT" NODE_SEA_BLOB sea.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 2>&1 | tail -2
rm -f sea.blob
if file "$OUT" | grep -q "MS Windows"; then python3 strip-signature.py "$OUT"; fi
