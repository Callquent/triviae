#!/bin/sh
# Télécharge Node.js (le moteur qui fait tourner les applications) dans runtime/, une seule fois.
# Le fichier est vérifié avec la somme de contrôle publiée par nodejs.org avant d'être utilisé.
set -e
VERSION=v22.23.4
BASE="${MA_NODE_BASE:-https://nodejs.org/dist/$VERSION}"
cd "$(dirname "$(readlink -f "$0")")/.."

case "$(uname -m)" in
  x86_64) ARCH=x64 ;;
  aarch64 | arm64) ARCH=arm64 ;;
  *) echo "Architecture non prise en charge : $(uname -m)"; exit 1 ;;
esac
NAME="node-$VERSION-linux-$ARCH.tar.xz"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fetch() {
  if command -v curl >/dev/null 2>&1; then curl -fsSL "$1" -o "$2"
  elif command -v wget >/dev/null 2>&1; then wget -q "$1" -O "$2"
  else echo "Installez curl :  sudo apt install curl"; exit 1
  fi
}

echo "Téléchargement de Node.js $VERSION (une seule fois, environ 25 Mo)..."
fetch "$BASE/$NAME" "$TMP/$NAME"
fetch "$BASE/SHASUMS256.txt" "$TMP/SUMS"
EXPECTED="$(grep " $NAME\$" "$TMP/SUMS" | cut -d' ' -f1)"
[ -n "$EXPECTED" ] || { echo "Somme de contrôle introuvable sur nodejs.org."; exit 1; }
ACTUAL="$(sha256sum "$TMP/$NAME" | cut -d' ' -f1)"
[ "$EXPECTED" = "$ACTUAL" ] || { echo "Fichier corrompu (somme de contrôle différente)."; exit 1; }

tar -xJf "$TMP/$NAME" -C "$TMP" --strip-components=2 "node-$VERSION-linux-$ARCH/bin/node"
mkdir -p runtime
mv "$TMP/node" runtime/node
chmod +x runtime/node
echo "Node.js est installé."
