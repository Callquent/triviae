#!/usr/bin/env bash
# Fabrique l'archive Ubuntu : build/dist/Triviae-ubuntu.tar.gz (Node est téléchargé au premier lancement).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=build/dist/ubuntu/Triviae
rm -rf build/dist/ubuntu; mkdir -p build/dist
scripts/assemble.sh "$OUT" linux none
mkdir -p "$OUT/outils"
cp tools/commun/preparer-application.mjs "$OUT/outils/"
cp tools/linux/triviae.sh "$OUT/"
cp tools/linux/telecharger-node.sh "$OUT/outils/"
cp tools/linux/LISEZMOI-ubuntu.txt "$OUT/LISEZMOI.txt"
cp tools/commun/AJOUTER-UNE-APPLICATION.pdf "$OUT/"
chmod +x "$OUT/triviae.sh" "$OUT/outils/telecharger-node.sh"
rm -f build/dist/Triviae-ubuntu.tar.gz
tar -C build/dist/ubuntu -czf build/dist/Triviae-ubuntu.tar.gz Triviae
ls -la build/dist/Triviae-ubuntu.tar.gz | awk '{printf "%.1f Mo  %s\n", $5/1048576, $9}'
