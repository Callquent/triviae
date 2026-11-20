#!/usr/bin/env bash
# Fabrique deux paquets Windows :
#  - build/dist/Triviae-complet.zip : Triviae.exe + Node inclus (hors ligne, ~70 Mo)
#  - build/dist/Triviae.zip         : version légère, « Triviae.bat » télécharge Node au premier lancement (~10 Mo)
set -euo pipefail
cd "$(dirname "$0")/.."
NODE_EXE=build/cache/pkg/package/bin/node.exe
[ -f "$NODE_EXE" ] || { (cd build/cache && npm pack node-win-x64@22.23.4 >/dev/null && rm -rf pkg && mkdir pkg && tar -xzf node-win-x64-22.23.4.tgz -C pkg); }
rm -rf build/dist; mkdir -p build/dist

# --- version complète ---
FULL=build/dist/complet/Triviae
scripts/assemble.sh "$FULL" win "$NODE_EXE"
scripts/make-exe.sh "$NODE_EXE" "$FULL/Triviae.exe"
mkdir -p "$FULL/outils"
cp tools/commun/preparer-application.mjs "$FULL/outils/"
sed 's/$/\r/' tools/windows/LISEZMOI-exe.txt > "$FULL/LISEZMOI.txt"
cp tools/commun/AJOUTER-UNE-APPLICATION.pdf "$FULL/"
sed 's/$/\r/' "tools/windows/Demarrer (secours).bat" > "$FULL/Demarrer (secours).bat"
(cd build/dist/complet && zip -qr ../Triviae-complet.zip Triviae)

# --- version légère ---
LIGHT=build/dist/leger/Triviae
mkdir -p build/dist/leger && cp -r "$FULL" "$LIGHT"
rm -rf "$LIGHT/runtime" "$LIGHT/Triviae.exe" "$LIGHT/Demarrer (secours).bat"
cp tools/windows/telecharger-node.ps1 "$LIGHT/outils/"
sed 's/$/\r/' "tools/windows/Triviae.bat" > "$LIGHT/Triviae.bat"
sed 's/$/\r/' tools/windows/LISEZMOI-leger.txt > "$LIGHT/LISEZMOI.txt"
(cd build/dist/leger && zip -qr ../Triviae.zip Triviae)
ls -la build/dist/*.zip | awk '{printf "%.1f Mo  %s\n", $5/1048576, $9}'
