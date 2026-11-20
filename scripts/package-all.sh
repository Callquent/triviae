#!/usr/bin/env bash
# Fabrique tous les paquets : Windows (complet + léger) et Ubuntu, dans build/dist/.
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/package-win.sh
bash scripts/package-linux.sh
