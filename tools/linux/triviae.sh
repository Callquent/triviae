#!/bin/sh
# Triviae : démarre la plateforme. Au premier lancement, télécharge Node.js (une seule fois).
ROOT="$(dirname "$(readlink -f "$0")")"
cd "$ROOT" || exit 1
export MA_LAUNCHER="$ROOT/triviae.sh"
if [ ! -x runtime/node ]; then
  sh outils/telecharger-node.sh || {
    echo
    echo "Impossible de continuer sans Node.js (vérifiez la connexion Internet)."
    exit 1
  }
fi
exec runtime/node hub/hub.js "$@"
