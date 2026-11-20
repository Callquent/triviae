# Triviae — sources

Hub Node qui héberge plusieurs applications Next.js sur un PC (Windows ou Ubuntu) et les rend utilisables depuis le téléphone.

## Structure

- `hub/` : le code du hub
  - `src/` : serveur (passerelle, supervision des applications, import/compilation, pages, synchronisation, HTTPS local…)
  - `assets/` : icônes
  - `watchdog.js` : chargé dans chaque application (arrêt avec le hub, alias de modules)
  - `launcher-sea.js`, `sea-config.json`, `strip-signature.py` : fabrication de `Triviae.exe`
- `tools/` : fichiers copiés dans les paquets
  - `commun/` : `preparer-application.mjs`, `AJOUTER-UNE-APPLICATION.pdf`
  - `windows/` : lanceurs `.bat`, `telecharger-node.ps1`, LISEZMOI Windows
  - `linux/` : `triviae.sh`, `telecharger-node.sh`, LISEZMOI Ubuntu
- `scripts/` : fabrication
  - `assemble.sh <sortie> <linux|win> [node]` : assemble le dossier de l'application (hub empaqueté)
  - `package-win.sh` : `build/dist/Triviae-complet.zip` et `build/dist/Triviae.zip`
  - `package-linux.sh` : `build/dist/Triviae-ubuntu.tar.gz`
  - `package-all.sh` : les trois
  - `make-exe.sh` : exécutable de démarrage
- `build/` : tout ce qui est généré (ignoré par git) — `dist/` (paquets), `cache/` (Node pour Windows), `dist-linux/` (dossier d'essai)

## Développer

    cd hub && npm install
    scripts/assemble.sh build/dist-linux linux
    MA_NO_BROWSER=1 MA_DATA=/tmp/ma HUB_PORT=8080 node build/dist-linux/hub/hub.js

Variables utiles : `MA_DATA` (dossier des données), `HUB_PORT`, `MA_NO_BROWSER=1`.
Les applications installées se placent dans `apps/<nom>/` du dossier assemblé (rien n'est livré par défaut).

## Guide « Ajouter une application »

Source : `tools/commun/guide-ajouter-application.html`. Le PDF livré dans les paquets (`AJOUTER-UNE-APPLICATION.pdf`) s'en génère avec Chromium :

    NODE_PATH=$(npm root -g) node scripts/make-guide.cjs

## Publication sur GitHub

- `git tag v1.0.0 && git push --tags` : le workflow `.github/workflows/paquets.yml` fabrique `Triviae.zip`, `Triviae-complet.zip` et `Triviae-ubuntu.tar.gz` et les joint à une Release.
- Les paquets ne sont jamais versionnés dans le dépôt (`build/` et `*.zip` sont ignorés).
- Aucune licence n'est fournie : à ajouter (fichier `LICENSE`) avant de rendre le dépôt public.
