#!/usr/bin/env bash
# Fabrique tous les paquets : Windows (complet + léger) et Ubuntu, dans build/dist/.
set -euo pipefail
cd "$(dirname "$0")/.."
scripts/package-win.sh
scripts/package-linux.sh
