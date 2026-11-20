@echo off
rem Triviae : demarre la plateforme. Au premier lancement, telecharge Node.js (une seule fois).
chcp 65001 >nul
title Triviae
cd /d "%~dp0"
if not exist "%~dp0runtime\node.exe" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0outils\telecharger-node.ps1"
)
if not exist "%~dp0runtime\node.exe" (
  echo.
  echo Impossible de continuer sans Node.js. Verifiez la connexion Internet puis relancez.
  pause
  exit /b 1
)
"%~dp0runtime\node.exe" "%~dp0hub\hub.js" %*
echo.
echo Triviae s'est arrete. Appuyez sur une touche pour fermer.
pause >nul
